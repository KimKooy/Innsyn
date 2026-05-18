import { useCallback, useEffect, useRef, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type Analysis from '@arcgis/core/analysis/Analysis.js';
import DirectLineMeasurementAnalysis from '@arcgis/core/analysis/DirectLineMeasurementAnalysis.js';
import AreaMeasurementAnalysis from '@arcgis/core/analysis/AreaMeasurementAnalysis.js';
import VolumeMeasurementAnalysis from '@arcgis/core/analysis/VolumeMeasurementAnalysis.js';
import ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import SliceAnalysis from '@arcgis/core/analysis/SliceAnalysis.js';
import { formatResult, type FormattedMeasurement } from './measurement-format';

export type ToolId = 'distance' | 'area' | 'volume' | 'profile' | 'slice';

export type Measurement = {
  id: string;
  tool: ToolId;
  primary?: FormattedMeasurement['primary'];
  secondary?: FormattedMeasurement['secondary'];
  analysis: Analysis;
  createdAt: string;
};

type AnalysisViewWithPlace = {
  place: (options?: { signal?: AbortSignal }) => Promise<unknown>;
  result?: unknown;
};

function createAnalysis(tool: ToolId): Analysis {
  switch (tool) {
    case 'distance':
      return new DirectLineMeasurementAnalysis();
    case 'area':
      return new AreaMeasurementAnalysis();
    case 'volume':
      return new VolumeMeasurementAnalysis();
    case 'profile':
      return new ElevationProfileAnalysis();
    case 'slice':
      return new SliceAnalysis();
  }
}

export function useSceneMeasurements(view: SceneView | null) {
  const [items, setItems] = useState<Measurement[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Wipe state when the view changes (e.g. user switches scene)
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setItems([]);
    setActiveTool(null);
  }, [view]);

  // Abort any pending placement when the hook unmounts
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const startTool = useCallback(
    async (tool: ToolId) => {
      if (!view) return;
      abortRef.current?.abort();

      const analysis = createAnalysis(tool);
      view.analyses.add(analysis);
      setActiveTool(tool);

      let av: AnalysisViewWithPlace;
      try {
        av = (await view.whenAnalysisView(analysis)) as unknown as AnalysisViewWithPlace;
      } catch {
        view.analyses.remove(analysis);
        setActiveTool(null);
        return;
      }

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        await av.place({ signal: ac.signal });
        const formatted = formatResult(tool, av.result);
        setItems((curr) => [
          ...curr,
          {
            id:
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            tool,
            primary: formatted?.primary,
            secondary: formatted?.secondary,
            analysis,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch {
        // Aborted (user picked another tool or hit clear) — drop the analysis
        view.analyses.remove(analysis);
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setActiveTool((curr) => (curr === tool ? null : curr));
      }
    },
    [view],
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((curr) => {
        const item = curr.find((m) => m.id === id);
        if (item && view) view.analyses.remove(item.analysis);
        return curr.filter((m) => m.id !== id);
      });
    },
    [view],
  );

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (view) view.analyses.removeAll();
    setItems([]);
    setActiveTool(null);
  }, [view]);

  return { items, activeTool, startTool, removeItem, clearAll };
}
