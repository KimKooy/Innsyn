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
 * Assumes the input Multipoint's (x, y) are already at the correct
 * horizontal position of the cloud — see snapPolylineToPointCloud in
 * useSceneMeasurements, which lifts the user-drawn polyline up to the
 * splats before the widget starts querying. The input's z is used as
 * the probe height; ray-cast from screen-of-(x,y,z) through the cloud
 * finds the actual splat under each sample.
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
      const probeZ = typeof pt[2] === 'number' ? pt[2] : 0;
      if (typeof x !== 'number' || typeof y !== 'number') {
        out.push([0, 0, noDataValue]);
        continue;
      }
      const z = await this.sampleAt(x, y, probeZ, sr);
      out.push([x, y, z ?? noDataValue]);
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
    probeZ: number,
    spatialReference: Multipoint['spatialReference'],
  ): Promise<number | null> {
    const probe = new Point({
      x,
      y,
      z: probeZ,
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
      const z = pcHit.mapPoint.z;
      return typeof z === 'number' ? z : null;
    }
    return null;
  }
}
