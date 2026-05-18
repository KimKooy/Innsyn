import { useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import DirectLineMeasurementAnalysis from '@arcgis/core/analysis/DirectLineMeasurementAnalysis.js';

type Props = {
  view: SceneView;
};

export function MeasurementToolbar({ view }: Props) {
  const [count, setCount] = useState(0);

  const addDistance = async () => {
    const analysis = new DirectLineMeasurementAnalysis();
    view.analyses.add(analysis);
    setCount((c) => c + 1);
    const av = await view.whenAnalysisView(analysis);
    void av.place();
  };

  const clearAll = () => {
    view.analyses.removeAll();
    setCount(0);
  };

  return (
    <div className="absolute top-3 left-3 z-10 flex gap-1 rounded-lg bg-white shadow-md border border-line p-1">
      <button
        type="button"
        onClick={() => void addDistance()}
        className="px-3 py-2 rounded text-sm font-medium text-ink hover:bg-soft"
        title="Klikk to punkter i scenen for å måle en avstand"
      >
        Mål avstand
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="px-3 py-2 rounded text-sm text-ink hover:bg-soft"
        >
          Tøm ({count})
        </button>
      )}
    </div>
  );
}
