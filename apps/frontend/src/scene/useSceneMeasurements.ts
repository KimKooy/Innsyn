import { useCallback, useEffect, useRef, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type Analysis from '@arcgis/core/analysis/Analysis.js';
import DirectLineMeasurementAnalysis from '@arcgis/core/analysis/DirectLineMeasurementAnalysis.js';
import AreaMeasurementAnalysis from '@arcgis/core/analysis/AreaMeasurementAnalysis.js';
import VolumeMeasurementAnalysis from '@arcgis/core/analysis/VolumeMeasurementAnalysis.js';
import ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import ElevationProfileLineScene from '@arcgis/core/analysis/ElevationProfile/ElevationProfileLineScene.js';
import ElevationProfileLineGround from '@arcgis/core/analysis/ElevationProfile/ElevationProfileLineGround.js';
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
// list still surfaces the row so the user can remove it. ElevationProfileAnalysis
// is similar — its "result" is the chart, not a numeric measurement.
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
      // The analysis needs profile-line configs or it computes nothing and
      // the chart in <arcgis-elevation-profile> stays empty.
      return new ElevationProfileAnalysis({
        profiles: [
          new ElevationProfileLineScene({ title: 'Mesh', color: [28, 181, 168] }),
          new ElevationProfileLineGround({ title: 'Terreng', color: [154, 166, 173] }),
        ],
      });
    case 'slice':
      return new SliceAnalysis();
  }
}

export function useSceneMeasurements(view: SceneView | null) {
  const [items, setItems] = useState<Measurement[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // When the view changes (scene swap) or unmounts, abort any in-flight
  // placement and clear analyses on the *previous* view.
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

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setActiveTool(tool);

      const analysis = createAnalysis(tool);
      view.analyses.add(analysis);

      // Profile is a special case: the result is a chart, not a number, so we
      // add the list entry IMMEDIATELY. That mounts the elevation-profile
      // widget so the user can see the chart populate live while they draw,
      // and gives them the widget's own UI hints (e.g. "Done" button).
      const earlyItemId = tool === 'profile' ? crypto.randomUUID() : null;
      if (earlyItemId) {
        setItems((curr) => [
          ...curr,
          {
            id: earlyItemId,
            tool,
            analysis,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      const removeEarlyItem = () => {
        if (earlyItemId) setItems((curr) => curr.filter((m) => m.id !== earlyItemId));
      };

      let av: AnalysisViewWithPlace;
      try {
        av = (await view.whenAnalysisView(analysis)) as unknown as AnalysisViewWithPlace;
      } catch {
        view.analyses.remove(analysis);
        removeEarlyItem();
        if (abortRef.current === ac) {
          abortRef.current = null;
          setActiveTool(null);
        }
        return;
      }

      if (ac.signal.aborted) {
        view.analyses.remove(analysis);
        removeEarlyItem();
        return;
      }

      try {
        await av.place({ signal: ac.signal });
        if (ac.signal.aborted) {
          view.analyses.remove(analysis);
          removeEarlyItem();
          return;
        }
        if (tool === 'profile') {
          // The early item already holds the analysis — chart updates from
          // analysis.result automatically through the widget binding.
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
        removeEarlyItem();
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
          setActiveTool((curr) => (curr === tool ? null : curr));
        }
      }
    },
    [view],
  );

  const removeItem = useCallback(
    (id: string) => {
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
