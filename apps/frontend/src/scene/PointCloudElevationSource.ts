import type SceneView from '@arcgis/core/views/SceneView.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import Point from '@arcgis/core/geometry/Point.js';
import Multipoint from '@arcgis/core/geometry/Multipoint.js';
import type {
  ElevationQueryOptions,
  ElevationQueryResult,
} from '@arcgis/core/layers/support/types.js';

/**
 * Custom elevation source for ElevationProfileLineQuery that samples
 * z-values from a PointCloudLayer using SceneView.hitTest.
 *
 * Limitations of this hitTest-based approach:
 *   - Sampling ray follows the camera's view direction, not strictly
 *     vertical. Top-down views give the best results; at heavy tilt the
 *     sampled point may be off-laterally from the requested (x,y).
 *   - Samples outside the current view frustum return noDataValue.
 *   - One hitTest per sample → for many samples on a long polyline the
 *     query is sequential and can take a few seconds.
 *
 * A more correct implementation would traverse the SLPK's i3s node tree
 * directly (REST) and query points within a vertical column around each
 * sample. We can swap to that later — the ElevationProfileLineQuery
 * source contract stays the same.
 */
export class PointCloudElevationSource {
  constructor(
    private readonly view: SceneView,
    private readonly layer: PointCloudLayer,
  ) {}

  async queryElevation(
    geometry: Multipoint,
    options?: ElevationQueryOptions,
  ): Promise<ElevationQueryResult<Multipoint>> {
    const noDataValue = -32768;
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
      const z = await this.sampleAt(x, y, sr);
      out.push([x, y, z ?? noDataValue]);
    }

    const result = new Multipoint({
      points: out,
      hasZ: true,
      spatialReference: sr,
    });

    return { geometry: result, noDataValue };
  }

  private async sampleAt(
    x: number,
    y: number,
    spatialReference: Multipoint['spatialReference'],
  ): Promise<number | null> {
    // Project (x, y) at a high z so the screen position approximates
    // a top-of-frustum point. The hitTest ray runs from that screen
    // position toward whatever is under the camera ray.
    const probe = new Point({
      x,
      y,
      z: 10000,
      hasZ: true,
      spatialReference,
    });
    const screen = this.view.toScreen(probe);
    if (!screen) return null;
    // Reject samples that land outside the visible canvas.
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
      return pcHit.mapPoint.z ?? null;
    }
    return null;
  }
}
