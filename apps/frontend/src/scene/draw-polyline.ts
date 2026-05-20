import type SceneView from '@arcgis/core/views/SceneView.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D.js';
import IconSymbol3DLayer from '@arcgis/core/symbols/IconSymbol3DLayer.js';
import LineSymbol3D from '@arcgis/core/symbols/LineSymbol3D.js';
import LineSymbol3DLayer from '@arcgis/core/symbols/LineSymbol3DLayer.js';

/**
 * Interactive polyline-drawing flow with point-cloud snap, modelled after
 * ArcGIS Pro's snap-to-vertex behaviour.
 *
 *   - On pointer-move, hitTest({ include: pcLayers }) reports the topmost
 *     splat under the cursor. A yellow ring renders in 3D at that splat —
 *     preview of where the next click commits.
 *   - "Sticky snap": if hitTest momentarily returns nothing we keep showing
 *     the previous snap target as long as the cursor has only drifted
 *     ≤ STICKY_PX pixels from where it was last acquired. Avoids the ring
 *     flickering through small gaps between splats.
 *   - Left-click commits a vertex AT the snap point. Clicks without a snap
 *     target are ignored. Each commit serializes the subsequent densify
 *     onto a single chain so concurrent clicks can't interleave inserts.
 *   - The segment between the previous commit and the new one is auto-
 *     densified at DENSIFY_SPACING_M (in parallel, one hitTest per
 *     intermediate point) so the chart and the 3D line track the cloud's
 *     curvature even with few user clicks.
 *   - Double-click finishes (≥2 user commits required). Escape cancels.
 *     AbortSignal aborts cleanly: in-flight densify checks signal.aborted
 *     between awaits and stops mutating the destroyed temp layer.
 */

type Vertex = { x: number; y: number; z: number };

const TEAL = [28, 181, 168] as const;
const SNAP_YELLOW = [255, 220, 0] as const;
const SNAP_ORANGE = [255, 140, 0] as const;

const STICKY_PX = 24;
const DENSIFY_SPACING_M = 0.5;

function snapSymbol() {
  return new PointSymbol3D({
    symbolLayers: [
      new IconSymbol3DLayer({
        size: 16,
        resource: { primitive: 'circle' },
        material: { color: [...SNAP_YELLOW, 0.55] },
        outline: { color: [...SNAP_ORANGE, 1], size: 3 },
      }),
    ],
  });
}

function vertexSymbol() {
  return new PointSymbol3D({
    symbolLayers: [
      new IconSymbol3DLayer({
        size: 10,
        resource: { primitive: 'circle' },
        material: { color: [...TEAL, 1] },
        outline: { color: [255, 255, 255, 1], size: 2 },
      }),
    ],
  });
}

function lineSymbol(thickness: number, alpha: number) {
  return new LineSymbol3D({
    symbolLayers: [
      new LineSymbol3DLayer({
        size: thickness,
        material: { color: [...TEAL, alpha] },
      }),
    ],
  });
}

export async function drawPolylineWithPointCloudSnap(
  view: SceneView,
  pcLayers: PointCloudLayer[],
  options?: { signal?: AbortSignal },
): Promise<Polyline> {
  const map = view.map;
  if (!map) throw new Error('SceneView.map is not available');
  const sr = view.spatialReference;
  const signal = options?.signal;

  const userClicks: Vertex[] = [];
  const allVertices: Vertex[] = [];
  let snapped: Vertex | null = null;
  let lastGoodSnap: Vertex | null = null;
  let lastGoodSnapScreen: { x: number; y: number } | null = null;

  // Pointer-move concurrency guard: only one hitTest in flight at a time.
  // If a move arrives while busy, we remember the latest screen coords and
  // run them after the current resolves.
  let moveInFlight = false;
  let pendingMove: { x: number; y: number } | null = null;

  // Serialize all click-driven densify work onto this chain so two quick
  // clicks can't interleave their intermediate vertices.
  let densifyChain: Promise<void> = Promise.resolve();

  const tempLayer = new GraphicsLayer({ listMode: 'hide' });
  map.add(tempLayer);
  let layerDestroyed = false;

  const snapGraphic = new Graphic({ symbol: snapSymbol() });
  const committedLineGraphic = new Graphic({ symbol: lineSymbol(2.5, 1) });
  const previewLineGraphic = new Graphic({ symbol: lineSymbol(1.5, 0.6) });
  const vertexGraphics: Graphic[] = [];

  function setIncluded(graphic: Graphic, include: boolean) {
    if (layerDestroyed) return;
    const has = tempLayer.graphics.includes(graphic);
    if (include && !has) tempLayer.add(graphic);
    if (!include && has) tempLayer.remove(graphic);
  }

  function pointGeometry(v: Vertex) {
    return new Point({
      x: v.x,
      y: v.y,
      z: v.z,
      hasZ: true,
      spatialReference: sr,
    });
  }

  function rebuildVertexGraphics() {
    if (layerDestroyed) return;
    for (const g of vertexGraphics) tempLayer.remove(g);
    vertexGraphics.length = 0;
    for (const v of userClicks) {
      const g = new Graphic({ geometry: pointGeometry(v), symbol: vertexSymbol() });
      vertexGraphics.push(g);
      tempLayer.add(g);
    }
  }

  function refreshCommittedLine() {
    if (layerDestroyed) return;
    if (allVertices.length < 2) {
      setIncluded(committedLineGraphic, false);
      return;
    }
    committedLineGraphic.geometry = new Polyline({
      paths: [allVertices.map((v) => [v.x, v.y, v.z])],
      hasZ: true,
      spatialReference: sr,
    });
    setIncluded(committedLineGraphic, true);
  }

  function refreshPreview() {
    if (layerDestroyed) return;
    if (allVertices.length === 0 || !snapped) {
      setIncluded(previewLineGraphic, false);
      return;
    }
    const last = allVertices[allVertices.length - 1]!;
    previewLineGraphic.geometry = new Polyline({
      paths: [[[last.x, last.y, last.z], [snapped.x, snapped.y, snapped.z]]],
      hasZ: true,
      spatialReference: sr,
    });
    setIncluded(previewLineGraphic, true);
  }

  function refreshSnapCursor() {
    if (layerDestroyed) return;
    if (!snapped) {
      setIncluded(snapGraphic, false);
      return;
    }
    snapGraphic.geometry = pointGeometry(snapped);
    setIncluded(snapGraphic, true);
  }

  async function snapAtScreen(
    screenX: number,
    screenY: number,
  ): Promise<Vertex | null> {
    const hit = await view.hitTest(
      { x: screenX, y: screenY },
      { include: pcLayers },
    );
    const pcHit = hit.results.find(
      (r) =>
        r.type === 'graphic' &&
        pcLayers.some((layer) => layer === r.graphic.layer),
    );
    if (pcHit?.type === 'graphic' && pcHit.mapPoint && typeof pcHit.mapPoint.z === 'number') {
      return { x: pcHit.mapPoint.x, y: pcHit.mapPoint.y, z: pcHit.mapPoint.z };
    }
    return null;
  }

  async function snapAtWorld(x: number, y: number): Promise<Vertex | null> {
    const probe = new Point({ x, y, z: 0, hasZ: true, spatialReference: sr });
    const screen = view.toScreen(probe);
    if (!screen) return null;
    if (
      screen.x < 0 ||
      screen.y < 0 ||
      screen.x > view.width ||
      screen.y > view.height
    ) {
      return null;
    }
    return snapAtScreen(screen.x, screen.y);
  }

  /**
   * Insert vertices spaced ~DENSIFY_SPACING_M apart between `from` and `to`,
   * each snapped to the cloud. Runs the sample hitTests in parallel; falls
   * back to linear z when a sample doesn't snap. Bails early if the outer
   * signal aborts mid-flight.
   */
  async function densifyBetween(from: Vertex, to: Vertex): Promise<Vertex[]> {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= DENSIFY_SPACING_M) return [];
    const steps = Math.floor(length / DENSIFY_SPACING_M);

    const ts: number[] = [];
    for (let k = 1; k < steps; k++) ts.push(k / steps);

    const results = await Promise.all(
      ts.map(async (t) => {
        if (signal?.aborted) return null;
        const xMid = from.x + dx * t;
        const yMid = from.y + dy * t;
        const snap = await snapAtWorld(xMid, yMid);
        return { t, xMid, yMid, snap };
      }),
    );
    if (signal?.aborted) return [];

    const out: Vertex[] = [];
    for (const r of results) {
      if (!r) continue;
      if (r.snap) {
        out.push(r.snap);
      } else {
        out.push({
          x: r.xMid,
          y: r.yMid,
          z: from.z + (to.z - from.z) * r.t,
        });
      }
    }
    return out;
  }

  return new Promise<Polyline>((resolve, reject) => {
    const cleanup = () => {
      moveHandle.remove();
      clickHandle.remove();
      dblHandle.remove();
      document.removeEventListener('keydown', onKey);
      if (!layerDestroyed) {
        layerDestroyed = true;
        map.remove(tempLayer);
        tempLayer.destroy();
      }
    };

    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    }

    const runPendingMove = () => {
      if (!pendingMove || moveInFlight || layerDestroyed) return;
      const next = pendingMove;
      pendingMove = null;
      moveInFlight = true;
      void snapAtScreen(next.x, next.y)
        .then((hit) => {
          if (layerDestroyed) return;
          if (hit) {
            snapped = hit;
            lastGoodSnap = hit;
            lastGoodSnapScreen = { x: next.x, y: next.y };
          } else if (lastGoodSnap && lastGoodSnapScreen) {
            const ddx = next.x - lastGoodSnapScreen.x;
            const ddy = next.y - lastGoodSnapScreen.y;
            const dist = Math.sqrt(ddx * ddx + ddy * ddy);
            snapped = dist <= STICKY_PX ? lastGoodSnap : null;
          } else {
            snapped = null;
          }
          refreshSnapCursor();
          refreshPreview();
        })
        .finally(() => {
          moveInFlight = false;
          // Drain any move that arrived while we were busy.
          if (pendingMove) runPendingMove();
        });
    };

    const moveHandle = view.on('pointer-move', (event) => {
      pendingMove = { x: event.x, y: event.y };
      runPendingMove();
    });

    const clickHandle = view.on('click', (event) => {
      if (event.button !== 0) return;
      if (!snapped) return;
      event.stopPropagation();
      const commit = { ...snapped };
      userClicks.push(commit);

      // Reset sticky-snap so the next pointer-move starts fresh; otherwise
      // the click position carries over and the ring could re-glue onto an
      // old splat 24px after the user pans.
      lastGoodSnap = null;
      lastGoodSnapScreen = null;

      // Chain this commit's densify after any previous in-flight one so the
      // intermediate vertices land in the correct order.
      densifyChain = densifyChain.then(async () => {
        if (signal?.aborted || layerDestroyed) return;
        const previous = allVertices[allVertices.length - 1];
        if (previous) {
          const intermediates = await densifyBetween(previous, commit);
          if (signal?.aborted || layerDestroyed) return;
          allVertices.push(...intermediates);
        }
        allVertices.push(commit);
        rebuildVertexGraphics();
        refreshCommittedLine();
        refreshPreview();
      });
    });

    const dblHandle = view.on('double-click', (event) => {
      event.stopPropagation();
      if (userClicks.length < 2) return;
      // Wait for any pending densify to finish so the resolved polyline
      // includes the intermediates for the last segment.
      void densifyChain.then(() => {
        if (layerDestroyed) return;
        const polyline = new Polyline({
          paths: [allVertices.map((v) => [v.x, v.y, v.z])],
          hasZ: true,
          spatialReference: sr,
        });
        cleanup();
        resolve(polyline);
      });
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        reject(new DOMException('Cancelled', 'AbortError'));
      }
    };
    document.addEventListener('keydown', onKey);
  });
}
