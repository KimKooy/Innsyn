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

// SliceAnalysis is a tool (clipping plane), not a measurement — place() resolves
// but av.result is undefined. formatResult returns undefined for 'slice'; the
// list still surfaces the row so the user can remove it.
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

  // When the view changes (scene swap) or unmounts, abort any in-flight
  // placement and clear analyses on the *previous* view. Closing over `view`
  // in the cleanup captures the right instance.
  useEffect(() => {
    const previousView = view;
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (previousView) previousView.analyses.removeAll();
    };
  }, [view]);

  const startTool = useCallback(
    async (tool: ToolId) => {
      if (!view) return;

      // Install AbortController BEFORE any await so a concurrent click can
      // cancel us during whenAnalysisView (which is racy on slow first load).
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setActiveTool(tool);

      const analysis = createAnalysis(tool);
      view.analyses.add(analysis);

      let av: AnalysisViewWithPlace;
      try {
        av = (await view.whenAnalysisView(analysis)) as unknown as AnalysisViewWithPlace;
      } catch {
        view.analyses.remove(analysis);
        if (abortRef.current === ac) {
          abortRef.current = null;
          setActiveTool(null);
        }
        return;
      }

      // If a concurrent tool click landed during whenAnalysisView, bail out.
      if (ac.signal.aborted) {
        view.analyses.remove(analysis);
        return;
      }

      try {
        await av.place({ signal: ac.signal });
        if (ac.signal.aborted) {
          view.analyses.remove(analysis);
          return;
        }
        const formatted = formatResult(tool, av.result);
        setItems((curr) => [
          ...curr,
          {
            id: crypto.randomUUID(),
            tool,
            primary: formatted?.primary,
            secondary: formatted?.secondary,
            analysis,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch {
        view.analyses.remove(analysis);
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
          setActiveTool(null);
        }
      }
    },
    [view],
  );

  const removeItem = useCallback(
    (id: string) => {
      // Resolve analysis outside setItems so React 18 StrictMode's double-
      // invoke of the updater doesn't remove it twice from view.analyses.
      const target = items.find((m) => m.id === id);
      if (target && view) view.analyses.remove(target.analysis);
      setItems((curr) => curr.filter((m) => m.id !== id));
    },
    [items, view],
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
