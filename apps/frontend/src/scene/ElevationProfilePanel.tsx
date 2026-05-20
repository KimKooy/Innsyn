import { useEffect, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import type Polyline from '@arcgis/core/geometry/Polyline.js';
import { ProfileChart } from './profile/ProfileChart';
import {
  sampleSlabAlongPolyline,
  type ScatterPoint,
} from './profile/profile-sampling';

type Props = {
  /** Reserved for hover-sync (chart ↔ 3D) in a follow-up commit. */
  view: SceneView;
  analysis: ElevationProfileAnalysis;
  onClose: () => void;
};

function collectPointCloudLayers(view: SceneView): PointCloudLayer[] {
  const result: PointCloudLayer[] = [];
  view.map?.allLayers.forEach((layer) => {
    if (layer.type === 'point-cloud') result.push(layer as PointCloudLayer);
  });
  return result;
}

/**
 * Bottom-left panel housing our own ProfileChart. The widget mount has
 * been replaced — we read analysis.geometry directly and feed the
 * polyline + a slab-sampled scatter of point-cloud splats to the chart.
 */
export function ElevationProfilePanel({ view, analysis, onClose }: Props) {
  const [polyline, setPolyline] = useState<Polyline | null>(
    () => analysis.geometry ?? null,
  );
  const [scatter, setScatter] = useState<ScatterPoint[]>([]);
  const [scatterLoading, setScatterLoading] = useState(false);

  useEffect(() => {
    setPolyline(analysis.geometry ?? null);
    const handle = analysis.watch('geometry', (geom: Polyline | null | undefined) => {
      setPolyline(geom ?? null);
    });
    return () => handle.remove();
  }, [analysis]);

  // Re-sample the slab whenever the polyline changes. Aborts in-flight
  // queries if the polyline updates before they complete.
  useEffect(() => {
    if (!polyline) {
      setScatter([]);
      return;
    }
    const pcLayers = collectPointCloudLayers(view);
    if (pcLayers.length === 0) {
      setScatter([]);
      return;
    }
    const controller = new AbortController();
    setScatterLoading(true);
    void sampleSlabAlongPolyline(view, polyline, pcLayers, {
      signal: controller.signal,
    })
      .then((points) => {
        if (controller.signal.aborted) return;
        setScatter(points);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setScatter([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setScatterLoading(false);
      });
    return () => controller.abort();
  }, [view, polyline]);

  return (
    <section
      className="absolute left-3 right-[19.5rem] bottom-3 z-10 h-64 rounded-lg bg-white shadow-md border border-line flex flex-col overflow-hidden"
      aria-label="Høydeprofil"
    >
      <header className="px-3 py-2 border-b border-line flex items-center justify-between flex-none">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">Høydeprofil</span>
          {scatterLoading && (
            <span className="text-xs text-ink/50">sampler punktsky…</span>
          )}
          {!scatterLoading && scatter.length > 0 && (
            <span className="text-xs text-ink/50">
              {scatter.length.toLocaleString('no-NO')} punkter i ±1m-slab
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Lukk høydeprofil"
          className="text-ink/70 hover:text-ink text-sm"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 min-h-0">
        <ProfileChart polyline={polyline} scatter={scatter} />
      </div>
    </section>
  );
}
