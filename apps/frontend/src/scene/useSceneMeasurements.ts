import { useCallback, useEffect, useRef, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type Analysis from '@arcgis/core/analysis/Analysis.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import DirectLineMeasurementAnalysis from '@arcgis/core/analysis/DirectLineMeasurementAnalysis.js';
import AreaMeasurementAnalysis from '@arcgis/core/analysis/AreaMeasurementAnalysis.js';
import VolumeMeasurementAnalysis from '@arcgis/core/analysis/VolumeMeasurementAnalysis.js';
import ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import SliceAnalysis from '@arcgis/core/analysis/SliceAnalysis.js';
import { drawPolylineWithPointCloudSnap } from './draw-polyline';
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

function buildProfileAnalysis(_view: SceneView): ElevationProfileAnalysis {
  // Profil 2.0 uses Esri's analysis only as a typed container for the
  // polyline geometry — the chart is rendered by our own ProfileChart
  // and the 3D line by a dedicated GraphicsLayer in ElevationProfilePanel.
  // No profile-lines are configured here, which keeps Esri from drawing
  // its own (jittery, per-camera-move-resampled) lines in the scene.
  return new ElevationProfileAnalysis();
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

      // For elevation profile on a scene that has a point cloud, replace
      // Esri's place() with our own snap-to-splat drawing loop. place()
      // captures clicks at the camera-ray intersection with the ground
      // (z=0 when world-elevation doesn't cover the area), so vertices
      // never land on the splats the user is visually clicking. Our
      // custom flow shows a yellow snap ring under the cursor and commits
      // each click AT that ring's splat. For mesh-only scenes place()
      // works fine.
      if (tool === 'profile' && analysis instanceof ElevationProfileAnalysis) {
        const pcLayers: PointCloudLayer[] = [];
        view.map?.allLayers.forEach((layer) => {
          if (layer.type === 'point-cloud') pcLayers.push(layer as PointCloudLayer);
        });
        if (pcLayers.length > 0) {
          try {
            const polyline = await drawPolylineWithPointCloudSnap(view, pcLayers, {
              signal: ac.signal,
            });
            if (ac.signal.aborted) {
              view.analyses.remove(analysis);
              removeEarlyItem();
              return;
            }
            analysis.geometry = polyline;
          } catch {
            view.analyses.remove(analysis);
            removeEarlyItem();
          } finally {
            if (abortRef.current === ac) {
              abortRef.current = null;
              setActiveTool((curr) => (curr === tool ? null : curr));
            }
          }
          return;
        }
      }

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
          // Mesh-only profile uses Esri's place() which captures clicks
          // against the mesh surface directly — no post-snap needed.
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
