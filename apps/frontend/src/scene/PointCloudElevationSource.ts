import type SceneView from '@arcgis/core/views/SceneView.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import type { PointCloudLayerView } from '@arcgis/core/views/layers/PointCloudLayerView.js';
import Multipoint from '@arcgis/core/geometry/Multipoint.js';
import Extent from '@arcgis/core/geometry/Extent.js';
import type Point from '@arcgis/core/geometry/Point.js';
import type {
  ElevationQueryOptions,
  ElevationQueryResult,
} from '@arcgis/core/layers/support/types.js';

/**
 * Custom elevation source for ElevationProfileLineQuery that samples
 * z-values from a PointCloudLayer using PointCloudLayerView.queryFeatures.
 *
 * For each (x,y) sample we run a spatial query against a tiny extent
 * around the point and pick the topmost z value of the points returned.
 * This is a TRUE vertical query (no camera-ray dependence), so accuracy
 * is independent of view tilt — but it only sees points the layer view
 * has streamed to the client at the current LOD. Zoom in for denser
 * sampling if the chart looks gappy.
 */

const SAMPLE_RADIUS_METERS = 1.5;
const NO_DATA = -32768;

export class PointCloudElevationSource {
  private layerViewPromise: Promise<PointCloudLayerView> | null = null;

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

    const layerView = await this.getLayerView();

    const out: number[][] = [];
    for (const pt of geometry.points) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const x = pt[0];
      const y = pt[1];
      if (typeof x !== 'number' || typeof y !== 'number') {
        out.push([0, 0, noDataValue]);
        continue;
      }
      const z = await this.sampleAt(layerView, x, y, sr, signal);
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

  private getLayerView() {
    if (!this.layerViewPromise) {
      this.layerViewPromise = this.view.whenLayerView(this.layer) as Promise<PointCloudLayerView>;
    }
    return this.layerViewPromise;
  }

  private async sampleAt(
    layerView: PointCloudLayerView,
    x: number,
    y: number,
    spatialReference: Multipoint['spatialReference'],
    signal: AbortSignal | null | undefined,
  ): Promise<number | null> {
    const query = layerView.createQuery();
    query.geometry = new Extent({
      xmin: x - SAMPLE_RADIUS_METERS,
      ymin: y - SAMPLE_RADIUS_METERS,
      xmax: x + SAMPLE_RADIUS_METERS,
      ymax: y + SAMPLE_RADIUS_METERS,
      spatialReference,
    });
    query.spatialRelationship = 'intersects';
    query.returnGeometry = true;

    const result = await layerView.queryFeatures(
      query,
      signal ? { signal } : undefined,
    );
    let topZ: number | null = null;
    for (const feature of result.features) {
      const z = (feature.geometry as Point | null)?.z;
      if (typeof z === 'number' && (topZ === null || z > topZ)) {
        topZ = z;
      }
    }
    return topZ;
  }
}
