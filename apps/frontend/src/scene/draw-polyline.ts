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
 *   - Left-click commits a vertex AT the snap point (not at the camera-
 *     ray-vs-ground intersection like Esri's place() does). If there's no
 *     snap target under the cursor, the click is ignored.
 *   - A teal preview segment is drawn from the last committed vertex to
 *     the current snap target.
 *   - Double-click finishes the polyline; Escape cancels.
 *
 * Replaces ElevationProfileAnalysisView3D.place() when the active scene
 * contains a PointCloudLayer. Returns the finished polyline so the
 * caller can set analysis.geometry directly.
 */

type Vertex = { x: number; y: number; z: number };

const TEAL = [28, 181, 168] as const;
const SNAP_YELLOW = [255, 220, 0] as const;
const SNAP_ORANGE = [255, 140, 0] as const;

function snapSymbol() {
  return new PointSymbol3D({
    symbolLayers: [
      new IconSymbol3DLayer({
        size: 14,
        resource: { primitive: 'circle' },
        material: { color: [...SNAP_YELLOW, 0.55] },
        outline: { color: [...SNAP_ORANGE, 1], size: 2.5 },
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

  const vertices: Vertex[] = [];
  let snapped: Vertex | null = null;
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
    for (const v of vertices) {
      const g = new Graphic({ geometry: pointGeometry(v), symbol: vertexSymbol() });
      vertexGraphics.push(g);
      tempLayer.add(g);
    }
  }

  function refreshCommittedLine() {
    if (vertices.length < 2) {
      setIncluded(committedLineGraphic, false);
      return;
    }
    committedLineGraphic.geometry = new Polyline({
      paths: [vertices.map((v) => [v.x, v.y, v.z])],
      hasZ: true,
      spatialReference: sr,
    });
    setIncluded(committedLineGraphic, true);
  }

  function refreshPreview() {
    if (vertices.length === 0 || !snapped) {
      setIncluded(previewLineGraphic, false);
      return;
    }
    const last = vertices[vertices.length - 1]!;
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
      void view.hitTest(event, { include: pcLayers }).then((hit) => {
        if (seq !== lastHitSeq) return;
        const pcHit = hit.results.find(
          (r) =>
            r.type === 'graphic' &&
            pcLayers.some((layer) => layer === r.graphic.layer),
        );
        if (pcHit?.type === 'graphic' && pcHit.mapPoint && typeof pcHit.mapPoint.z === 'number') {
          snapped = {
            x: pcHit.mapPoint.x,
            y: pcHit.mapPoint.y,
            z: pcHit.mapPoint.z,
          };
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
      vertices.push({ ...snapped });
      rebuildVertexGraphics();
      refreshCommittedLine();
      refreshPreview();
    });

    const dblHandle = view.on('double-click', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      if (vertices.length < 2) return;
      const polyline = new Polyline({
        paths: [vertices.map((v) => [v.x, v.y, v.z])],
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
