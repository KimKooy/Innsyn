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
 * ArcGIS Pro's snap-to-vertex behaviour:
 *
 *   - As the user moves the cursor, hitTest filtered to the point-cloud
 *     layers reports the topmost splat under the pointer. A yellow ring
 *     follows that splat in 3D — preview of where the next click lands.
 *   - "Sticky snap": if hitTest momentarily returns no result (camera ray
 *     hits a gap between splats) we keep the last good snap visible as
 *     long as the cursor has moved less than STICKY_PX pixels — avoids
 *     the ring flickering off as the user moves the mouse.
 *   - Left-click commits a vertex AT the snap point. To make the profile
 *     follow the cloud's curvature even with few clicks, the segment
 *     between the previous vertex and the new one is auto-densified:
 *     every ~DENSIFY_SPACING_M meters along the line we project the
 *     midpoint to screen, hitTest it, and add the snapped result as an
 *     intermediate vertex. Only the user's actual clicks are shown as
 *     visible dots; the densified vertices are silent.
 *   - Double-click finishes the polyline (≥2 user clicks required).
 *     Escape cancels. AbortSignal supported for outside-driven cancel.
 */

type Vertex = { x: number; y: number; z: number };

const TEAL = [28, 181, 168] as const;
const SNAP_YELLOW = [255, 220, 0] as const;
const SNAP_ORANGE = [255, 140, 0] as const;

const STICKY_PX = 24;
const DENSIFY_SPACING_M = 0.25;

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

  const userClicks: Vertex[] = []; // ones the user clicked (rendered as dots)
  const allVertices: Vertex[] = []; // user clicks + auto-densified samples
  let snapped: Vertex | null = null;
  let lastGoodSnap: Vertex | null = null;
  let lastGoodSnapScreen: { x: number; y: number } | null = null;
  let lastHitSeq = 0;

  const tempLayer = new GraphicsLayer({ listMode: 'hide' });
  map.add(tempLayer);

  const snapGraphic = new Graphic({ symbol: snapSymbol() });
  const committedLineGraphic = new Graphic({ symbol: lineSymbol(2.5, 1) });
  const previewLineGraphic = new Graphic({ symbol: lineSymbol(1.5, 0.6) });
  const vertexGraphics: Graphic[] = [];

  function setIncluded(graphic: Graphic, include: boolean) {
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
    for (const g of vertexGraphics) tempLayer.remove(g);
    vertexGraphics.length = 0;
    for (const v of userClicks) {
      const g = new Graphic({ geometry: pointGeometry(v), symbol: vertexSymbol() });
      vertexGraphics.push(g);
      tempLayer.add(g);
    }
  }

  function refreshCommittedLine() {
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
    if (!snapped) {
      setIncluded(snapGraphic, false);
      return;
    }
    snapGraphic.geometry = pointGeometry(snapped);
    setIncluded(snapGraphic, true);
  }

  /**
   * Find the topmost cloud splat at a given screen coordinate.
   */
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

  /**
   * Snap a world-coordinate (x, y) onto the cloud by projecting it to
   * screen at z=0 and hitTest'ing there. Returns null if no splat is
   * under the resulting pixel.
   */
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
   * For the segment between `from` and `to`, insert intermediate vertices
   * spaced ~DENSIFY_SPACING_M apart, each snapped to the cloud. Falls
   * back to linear z interpolation when a sample can't be snapped.
   */
  async function densifyBetween(from: Vertex, to: Vertex): Promise<Vertex[]> {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= DENSIFY_SPACING_M) return [];
    const steps = Math.floor(length / DENSIFY_SPACING_M);
    const out: Vertex[] = [];
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const xMid = from.x + dx * t;
      const yMid = from.y + dy * t;
      const snap = await snapAtWorld(xMid, yMid);
      if (snap) {
        out.push(snap);
      } else {
        out.push({ x: xMid, y: yMid, z: from.z + (to.z - from.z) * t });
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
      map.remove(tempLayer);
      tempLayer.destroy();
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      options.signal.addEventListener(
        'abort',
        () => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    }

    const moveHandle = view.on('pointer-move', (event) => {
      const seq = ++lastHitSeq;
      const screenX = event.x;
      const screenY = event.y;
      void snapAtScreen(screenX, screenY).then((hit) => {
        if (seq !== lastHitSeq) return;
        if (hit) {
          snapped = hit;
          lastGoodSnap = hit;
          lastGoodSnapScreen = { x: screenX, y: screenY };
        } else if (lastGoodSnap && lastGoodSnapScreen) {
          // Sticky snap — keep the last good target visible if the cursor
          // has only drifted a few pixels (likely a gap between splats).
          const ddx = screenX - lastGoodSnapScreen.x;
          const ddy = screenY - lastGoodSnapScreen.y;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          snapped = dist <= STICKY_PX ? lastGoodSnap : null;
        } else {
          snapped = null;
        }
        refreshSnapCursor();
        refreshPreview();
      });
    });

    const clickHandle = view.on('click', (event) => {
      // Only respond to left click; middle/right are for camera nav.
      if (event.button !== 0) return;
      if (!snapped) return; // no snap target → ignore (Pro behaviour)
      event.stopPropagation();
      const commit = { ...snapped };
      userClicks.push(commit);
      void (async () => {
        if (allVertices.length > 0) {
          const previous = allVertices[allVertices.length - 1]!;
          const intermediates = await densifyBetween(previous, commit);
          allVertices.push(...intermediates);
        }
        allVertices.push(commit);
        rebuildVertexGraphics();
        refreshCommittedLine();
        refreshPreview();
      })();
    });

    const dblHandle = view.on('double-click', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      if (userClicks.length < 2) return;
      const polyline = new Polyline({
        paths: [allVertices.map((v) => [v.x, v.y, v.z])],
        hasZ: true,
        spatialReference: sr,
      });
      cleanup();
      resolve(polyline);
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
