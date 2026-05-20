import { useEffect, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import type Polyline from '@arcgis/core/geometry/Polyline.js';
import { ProfileChart } from './profile/ProfileChart';

type Props = {
  /** Reserved for hover-sync (chart ↔ 3D) in a follow-up commit. */
  view: SceneView;
  analysis: ElevationProfileAnalysis;
  onClose: () => void;
};

/**
 * Bottom-left panel housing our own ProfileChart. The widget mount has
 * been replaced — we now read analysis.geometry directly and feed the
 * polyline to ProfileChart. Future commits add point-cloud scatter
 * overlay, vertical-exaggeration picker, hover-sync, click-to-fly.
 */
export function ElevationProfilePanel({ view, analysis, onClose }: Props) {
  // `view` is wired in via props now so commit 5 (hover-sync) doesn't
  // need to change this component's signature. Side-effect for now to
  // keep noUnusedParameters silent if it ever lands.
  void view;

  const [polyline, setPolyline] = useState<Polyline | null>(
    () => analysis.geometry ?? null,
  );

  useEffect(() => {
    setPolyline(analysis.geometry ?? null);
    const handle = analysis.watch('geometry', (geom: Polyline | null | undefined) => {
      setPolyline(geom ?? null);
    });
    return () => handle.remove();
  }, [analysis]);

  return (
    <section
      className="absolute left-3 right-[19.5rem] bottom-3 z-10 h-64 rounded-lg bg-white shadow-md border border-line flex flex-col overflow-hidden"
      aria-label="Høydeprofil"
    >
      <header className="px-3 py-2 border-b border-line flex items-center justify-between flex-none">
        <span className="text-sm font-semibold">Høydeprofil</span>
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
        <ProfileChart polyline={polyline} />
      </div>
    </section>
  );
}
