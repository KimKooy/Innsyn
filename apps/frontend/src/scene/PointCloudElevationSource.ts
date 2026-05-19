import type SceneView from '@arcgis/core/views/SceneView.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import Multipoint from '@arcgis/core/geometry/Multipoint.js';
import Point from '@arcgis/core/geometry/Point.js';
import type {
  ElevationQueryOptions,
  ElevationQueryResult,
} from '@arcgis/core/layers/support/types.js';

/**
 * Custom elevation source for ElevationProfileLineQuery that samples
 * z-values from a PointCloudLayer.
 *
 * Why screen-space hitTest instead of layerView.queryFeatures(geometry)?
 * The widget's Multipoint passes (x, y) from the drawn polyline, and those
 * coordinates are projected onto the GROUND plane (z=0) when the user
 * clicks. With a tilted camera and a point cloud rendered hundreds of
 * meters above the ground (NN2000 heights), the polyline's (x, y) is
 * laterally offset from where the cloud actually is — far beyond any
 * reasonable spatial-query radius.
 *
 * Trick: project (x, y, 0) to screen, then hitTest at that screen pixel
 * filtered to the point cloud. The camera ray from screen → (x, y, 0)
 * also crosses the cloud above (x, y, 0) before reaching z=0, so the
 * hit corresponds to the splat the user originally saw under their
 * click. Return that splat's actual (x', y', z') in place of the
 * polyline's (x, y, 0) — the chart distance axis follows the cloud's
 * projected path, which is what the user visually drew.
 *
 * Limitations:
 *   - Samples falling in gaps between splats return noData. Mitigated
 *     by SDK's splat rendering; persistent gaps mean the user should
 *     zoom in for denser LOD before drawing the profile.
 *   - Samples outside the visible canvas return noData.
 *   - Sequential hitTests; one per sample point.
 */

const NO_DATA = -32768;

export class PointCloudElevationSource {
  constructor(
    private readonly view: SceneView,
    private readonly layer: PointCloudLayer,
  ) {}

  async queryElevation(
    geometry: Multipoint,
    options?: ElevationQueryOptions,
  ): Promise<ElevationQueryResult<Multipoint>> {
    const noDataValue = options?.noDataValue ?? NO_DATA;
    const signal = options?.signal;
    const sr = geometry.spatialReference;

    const out: number[][] = [];
    for (const pt of geometry.points) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const x = pt[0];
      const y = pt[1];
      if (typeof x !== 'number' || typeof y !== 'number') {
        out.push([0, 0, noDataValue]);
        continue;
      }
      const hit = await this.sampleAt(x, y, sr);
      if (hit) {
        // Substitute the polyline's ground-projected (x, y) with the actual
        // splat coordinates so the chart's distance axis follows the cloud.
        out.push([hit.x, hit.y, hit.z]);
      } else {
        out.push([x, y, noDataValue]);
      }
    }

    return {
      geometry: new Multipoint({
        points: out,
        hasZ: true,
        spatialReference: sr,
      }),
      noDataValue,
    };
  }

  private async sampleAt(
    x: number,
    y: number,
    spatialReference: Multipoint['spatialReference'],
  ): Promise<{ x: number; y: number; z: number } | null> {
    // z=0 is below the (downward-looking) camera, so the projection is in
    // the view frustum and the camera ray from this screen pixel passes
    // through (x, y, 0). The same ray crosses any splats stacked above
    // (x, y, 0) on its way down — that's exactly what we want.
    const probe = new Point({
      x,
      y,
      z: 0,
      hasZ: true,
      spatialReference,
    });
    const screen = this.view.toScreen(probe);
    if (!screen) return null;
    if (
      screen.x < 0 ||
      screen.y < 0 ||
      screen.x > this.view.width ||
      screen.y > this.view.height
    ) {
      return null;
    }

    const hit = await this.view.hitTest(screen, { include: [this.layer] });
    const pcHit = hit.results.find(
      (r) => r.type === 'graphic' && r.graphic.layer === this.layer,
    );
    if (pcHit && pcHit.type === 'graphic' && pcHit.mapPoint) {
      const mp = pcHit.mapPoint;
      if (typeof mp.z !== 'number') return null;
      return { x: mp.x, y: mp.y, z: mp.z };
    }
    return null;
  }
}
