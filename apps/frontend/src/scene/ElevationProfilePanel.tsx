import { useEffect, useRef } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';

type Props = {
  view: SceneView;
  analysis: ElevationProfileAnalysis;
  onClose: () => void;
};

export function ElevationProfilePanel({ view, analysis, onClose }: Props) {
  const ref = useRef<HTMLArcgisElevationProfileElement | null>(null);

  // The widget reads view + analysis from properties (not attributes); both
  // must be set imperatively after the element is in the DOM. The analysis
  // already carries the profile-line config so we don't touch widget.profiles.
  //
  // uniformChartScaling=false: the previous default (true) forced 1:1 axis
  // ratio and collapsed short paths into a tiny box on a wide canvas. The
  // proper vertical-exaggeration UX (1×/2×/5×/10× picker) lands in the
  // own-chart replacement (ProfileChart) — for the widget we keep its
  // default fit-to-canvas behaviour.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.view = view;
    el.analysis = analysis;
    el.uniformChartScaling = false;
  }, [view, analysis]);

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
        <arcgis-elevation-profile
          ref={ref}
          hide-clear-button
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
    </section>
  );
}
