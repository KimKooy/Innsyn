import { useCallback, useEffect, useRef, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type Analysis from '@arcgis/core/analysis/Analysis.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import DirectLineMeasurementAnalysis from '@arcgis/core/analysis/DirectLineMeasurementAnalysis.js';
import AreaMeasurementAnalysis from '@arcgis/core/analysis/AreaMeasurementAnalysis.js';
import VolumeMeasurementAnalysis from '@arcgis/core/analysis/VolumeMeasurementAnalysis.js';
import ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import ElevationProfileLineScene from '@arcgis/core/analysis/ElevationProfile/ElevationProfileLineScene.js';
import ElevationProfileLineGround from '@arcgis/core/analysis/ElevationProfile/ElevationProfileLineGround.js';
import ElevationProfileLineQuery from '@arcgis/core/analysis/ElevationProfile/ElevationProfileLineQuery.js';
import SliceAnalysis from '@arcgis/core/analysis/SliceAnalysis.js';
import { PointCloudElevationSource } from './PointCloudElevationSource';
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

function buildProfileAnalysis(view: SceneView): ElevationProfileAnalysis {
  const analysis = new ElevationProfileAnalysis({
    profiles: [
      new ElevationProfileLineScene({ title: 'Mesh', color: [28, 181, 168] }),
      new ElevationProfileLineGround({ title: 'Terreng', color: [154, 166, 173] }),
    ],
  });

  // Esri's built-in ElevationProfileLineScene does NOT sample point clouds
  // (only volumetric layers like IntegratedMesh / SceneLayer). For each
  // PointCloudLayer in the scene, add a custom query line whose source does
  // a hitTest-per-sample against the layer.
  view.map?.allLayers.forEach((layer) => {
    if (layer.type !== 'point-cloud') return;
    const pcLayer = layer as PointCloudLayer;
    analysis.profiles.push(
      new ElevationProfileLineQuery({
        title: `Punktsky${pcLayer.title ? ` · ${pcLayer.title}` : ''}`,
        color: [219, 51, 74],
        source: new PointCloudElevationSource(view, pcLayer),
      }),
    );
  });

  return analysis;
}

function createAnalysis(tool: ToolId, view: SceneView): Analysis {
  switch (tool) {
    case 'distance':
      return new DirectLineMeasurementAnalysis();
    case 'area':
      return new AreaMeasurementAnalysis();
    case 'volume':
      return new VolumeMeasurementAnalysis();
    case 'profile':
      return buildProfileAnalysis(view);
    case 'slice':
      return new SliceAnalysis();
  }
}

export function useSceneMeasurements(view: SceneView | null) {
  const [items, setItems] = useState<Measurement[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

      const analysis = createAnalysis(tool, view);
      view.analyses.add(analysis);

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
        if (tool === 'profile') return;
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
