import { useEffect, useRef } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import Collection from '@arcgis/core/core/Collection.js';
import ElevationProfileLineScene from '@arcgis/core/analysis/ElevationProfile/ElevationProfileLineScene.js';
import ElevationProfileLineGround from '@arcgis/core/analysis/ElevationProfile/ElevationProfileLineGround.js';
import type { ElevationProfileLineUnion } from '@arcgis/core/analysis/ElevationProfile/types.js';

type Props = {
  view: SceneView;
  analysis: ElevationProfileAnalysis;
  onClose: () => void;
};

export function ElevationProfilePanel({ view, analysis, onClose }: Props) {
  const ref = useRef<HTMLArcgisElevationProfileElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.view = view;
    el.analysis = analysis;
    // For an IntegratedMesh scene the most useful profile line samples the
    // scene's volumetric geometry (the mesh itself); the world-elevation
    // ground gives the underlying terrain for comparison.
    el.profiles = new Collection<ElevationProfileLineUnion>([
      new ElevationProfileLineScene({ title: 'Mesh', color: '#1cb5a8' }),
      new ElevationProfileLineGround({ title: 'Terreng', color: '#9aa6ad' }),
    ]);
  }, [view, analysis]);

  return (
    <section
      className="absolute left-3 right-[19.5rem] bottom-3 z-10 h-56 rounded-lg bg-white shadow-md border border-line flex flex-col overflow-hidden"
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
        <arcgis-elevation-profile
          ref={ref}
          hide-clear-button
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
    </section>
  );
}
