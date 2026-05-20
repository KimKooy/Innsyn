import type SceneView from '@arcgis/core/views/SceneView.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import type { PointCloudLayerView } from '@arcgis/core/views/layers/PointCloudLayerView.js';
import type Polyline from '@arcgis/core/geometry/Polyline.js';
import type Polygon from '@arcgis/core/geometry/Polygon.js';
import type Point from '@arcgis/core/geometry/Point.js';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine.js';

/**
 * Cross-section sampling: build a thin slab (±SLAB_M) around the user's
 * profile polyline, query the point cloud for every splat inside that
 * slab, and project each splat onto the polyline's local (distance, z)
 * coordinate system so ProfileChart can scatter them behind the curve.
 *
 * Why: the profile *line* shows one z per distance — fine for terrain,
 * useless for showing vegetation density, building setbacks, parallel
 * pipes, the whole reason we have a point cloud. Plotting every nearby
 * splat reveals the cloud's structure on the chart instead of hiding it.
 */

export type ScatterPoint = { d: number; z: number };

type Cumulative = { x: number; y: number; d: number };

/** Half-width of the slab in meters. Total slab thickness = 2 × this. */
export const DEFAULT_SLAB_M = 1.0;

/** Hard cap on returned features per layer to keep the chart responsive. */
const MAX_FEATURES_PER_LAYER = 20000;

export async function sampleSlabAlongPolyline(
  view: SceneView,
  polyline: Polyline,
  pcLayers: PointCloudLayer[],
  options?: { slabM?: number; signal?: AbortSignal },
): Promise<ScatterPoint[]> {
  if (pcLayers.length === 0 || polyline.paths.length === 0) return [];
  const slabM = options?.slabM ?? DEFAULT_SLAB_M;
  const signal = options?.signal;

  // Pre-compute vertices with cumulative distance along the polyline so
  // each splat can be projected onto a known (d) coordinate without
  // re-walking the polyline per point.
  const vertices = buildCumulativeVertices(polyline);
  if (vertices.length < 2) return [];

  // Buffer the polyline into a polygon slab. The polyline is already in
  // the view's local SR (UTM in our Norwegian scenes), so planar buffer
  // in meters is exact.
  const buffered = geometryEngine.buffer(polyline, slabM, 'meters');
  if (!buffered) return [];
  const slabPolygon: Polygon = Array.isArray(buffered) ? buffered[0]! : buffered;

  const out: ScatterPoint[] = [];

  for (const layer of pcLayers) {
    if (signal?.aborted) return out;
    let layerView: PointCloudLayerView;
    try {
      layerView = (await view.whenLayerView(layer)) as PointCloudLayerView;
    } catch {
      continue;
    }
    if (signal?.aborted) return out;

    const query = layerView.createQuery();
    query.geometry = slabPolygon;
    query.spatialRelationship = 'intersects';
    query.returnGeometry = true;
    query.num = MAX_FEATURES_PER_LAYER;

    let result;
    try {
      result = await layerView.queryFeatures(
        query,
        signal ? { signal } : undefined,
      );
    } catch {
      continue;
    }
    if (signal?.aborted) return out;

    for (const feature of result.features) {
      const p = feature.geometry as Point | null;
      if (!p) continue;
      const z = p.z;
      if (typeof z !== 'number') continue;
      const proj = projectPointOntoPolyline({ x: p.x, y: p.y }, vertices);
      // Defensive: even though the buffer should have filtered, drop
      // anything outside the slab (e.g. when buffer is approximated).
      if (proj.offset > slabM) continue;
      out.push({ d: proj.u, z });
    }
  }

  return out;
}

function buildCumulativeVertices(polyline: Polyline): Cumulative[] {
  const out: Cumulative[] = [];
  let cumulative = 0;
  let last: [number, number] | null = null;
  for (const path of polyline.paths) {
    for (const v of path) {
      const x = v[0];
      const y = v[1];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      if (last) {
        const dx = x - last[0];
        const dy = y - last[1];
        cumulative += Math.sqrt(dx * dx + dy * dy);
      }
      out.push({ x, y, d: cumulative });
      last = [x, y];
    }
  }
  return out;
}

function projectPointOntoPolyline(
  p: { x: number; y: number },
  vertices: Cumulative[],
): { u: number; offset: number } {
  let bestU = 0;
  let bestOffset = Infinity;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const t =
      lenSq > 0
        ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq))
        : 0;
    const closestX = a.x + t * abx;
    const closestY = a.y + t * aby;
    const dx = p.x - closestX;
    const dy = p.y - closestY;
    const offset = Math.sqrt(dx * dx + dy * dy);
    if (offset < bestOffset) {
      bestOffset = offset;
      const segLen = Math.sqrt(lenSq);
      bestU = a.d + t * segLen;
    }
  }
  return { u: bestU, offset: bestOffset };
}
