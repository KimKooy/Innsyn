import type SceneView from '@arcgis/core/views/SceneView.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import Point from '@arcgis/core/geometry/Point.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';

/**
 * Lifts each vertex of a polyline up to the topmost point-cloud splat at
 * the vertex's screen position.
 *
 * Use case: when the user draws an elevation-profile line over a scene
 * that only has a PointCloudLayer (no continuous surface to absorb
 * clicks), each click lands on z=0 (ground at sea level in local UTM
 * viewing mode where world-elevation doesn't activate). The polyline
 * then sits at the ground plane, laterally offset from where the user
 * visually clicked on the cloud (perspective error grows with camera
 * tilt — at 65° tilt and z=360m above ground, ≈770m offset).
 *
 * For each (x, y) vertex we project to screen at z=0 (in front of a
 * downward-looking camera, so toScreen returns a valid pixel), then
 * hitTest filtered to the point-cloud layers. If the camera ray hits a
 * splat on its way down to z=0, that splat is the one the user
 * originally clicked at — use the splat's world (x', y', z') as the
 * corrected vertex.
 *
 * Vertices that don't hit a splat (gaps, outside frustum) are left
 * unchanged.
 */
export async function snapPolylineToPointCloud(
  view: SceneView,
  polyline: Polyline,
  pcLayers: PointCloudLayer[],
): Promise<Polyline | null> {
  if (pcLayers.length === 0) return null;

  const newPaths: number[][][] = [];
  let didChange = false;

  for (const path of polyline.paths) {
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
