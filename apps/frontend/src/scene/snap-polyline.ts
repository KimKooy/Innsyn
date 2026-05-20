import type SceneView from '@arcgis/core/views/SceneView.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import Point from '@arcgis/core/geometry/Point.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';

/**
 * Densifies a polyline by adding intermediate vertices so that no segment
 * is longer than `maxSegmentLength` in the polyline's XY units.
 *
 * The widget visualizes the analysis line by interpolating linearly between
 * vertices, so a polyline with only 2 endpoints sags between them when the
 * underlying surface curves. Inserting samples every couple of meters lets
 * snapPolylineToPointCloud anchor each one to a splat, producing a line
 * that hugs the cloud rather than floating across it.
 */
function densifyPolyline(polyline: Polyline, maxSegmentLength: number): Polyline {
  const newPaths: number[][][] = [];
  for (const path of polyline.paths) {
    const newPath: number[][] = [];
    for (let i = 0; i < path.length; i++) {
      const v = path[i];
      if (!v) continue;
      const vx = v[0] ?? 0;
      const vy = v[1] ?? 0;
      const vz = v[2] ?? 0;
      newPath.push([vx, vy, vz]);
      const next = path[i + 1];
      if (!next) continue;
      const nx = next[0] ?? 0;
      const ny = next[1] ?? 0;
      const nz = next[2] ?? 0;
      const dx = nx - vx;
      const dy = ny - vy;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length <= maxSegmentLength) continue;
      const steps = Math.floor(length / maxSegmentLength);
      for (let k = 1; k <= steps; k++) {
        const t = k / (steps + 1);
        newPath.push([vx + dx * t, vy + dy * t, vz + (nz - vz) * t]);
      }
    }
    newPaths.push(newPath);
  }
  return new Polyline({
    paths: newPaths,
    hasZ: true,
    spatialReference: polyline.spatialReference,
  });
}

/**
 * Lifts each vertex of a polyline up to the topmost point-cloud splat at
 * the vertex's screen position.
 *
 * The polyline is first densified so every segment is at most ~2m of
 * horizontal distance — that way the snapped line follows the cloud's
 * curvature instead of sagging through straight-line interpolation between
 * widely-spaced endpoints.
 *
 * For each (x, y) vertex we project to screen at z=0 (in front of a
 * downward-looking camera, so toScreen returns a valid pixel), then
 * hitTest filtered to the point-cloud layers. If the camera ray hits a
 * splat on its way down to z=0, that splat is the one the user
 * originally clicked at on screen — use the splat's world (x', y', z')
 * as the corrected vertex.
 *
 * Vertices that don't hit a splat (gaps, outside frustum) are left
 * unchanged.
 */
export async function snapPolylineToPointCloud(
  view: SceneView,
  polyline: Polyline,
  pcLayers: PointCloudLayer[],
  options?: { densifySpacing?: number },
): Promise<Polyline | null> {
  if (pcLayers.length === 0) return null;

  const densified = densifyPolyline(polyline, options?.densifySpacing ?? 2);

  const newPaths: number[][][] = [];
  let didChange = false;

  for (const path of densified.paths) {
    const newPath: number[][] = [];
    for (const vertex of path) {
      const x = vertex[0];
      const y = vertex[1];
      const originalZ = typeof vertex[2] === 'number' ? vertex[2] : 0;
      if (typeof x !== 'number' || typeof y !== 'number') {
        newPath.push([0, 0, originalZ]);
        continue;
      }
      const probe = new Point({
        x,
        y,
        z: 0,
        hasZ: true,
        spatialReference: polyline.spatialReference,
      });
      const screen = view.toScreen(probe);
      if (!screen) {
        newPath.push([x, y, originalZ]);
        continue;
      }
      const hit = await view.hitTest(screen, { include: pcLayers });
      const pcHit = hit.results.find(
        (r) =>
          r.type === 'graphic' &&
          pcLayers.some((layer) => layer === r.graphic.layer),
      );
      if (pcHit?.type === 'graphic' && pcHit.mapPoint) {
        const mp = pcHit.mapPoint;
        const z = typeof mp.z === 'number' ? mp.z : originalZ;
        newPath.push([mp.x, mp.y, z]);
        didChange = true;
      } else {
        newPath.push([x, y, originalZ]);
      }
    }
    newPaths.push(newPath);
  }

  if (!didChange) return null;

  return new Polyline({
    paths: newPaths,
    hasZ: true,
    spatialReference: polyline.spatialReference,
  });
}
