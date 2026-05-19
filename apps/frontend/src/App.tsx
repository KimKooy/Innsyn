import { useMemo, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import { TopBar } from '@/components/TopBar';
import { SceneViewer } from '@/scene/SceneViewer';
import { MeasurementToolbar } from '@/scene/MeasurementToolbar';
import { MeasurementList } from '@/scene/MeasurementList';
import { ToolHint } from '@/scene/ToolHint';
import { ElevationProfilePanel } from '@/scene/ElevationProfilePanel';
import { AssetToolbar } from '@/scene/AssetToolbar';
import { AssetUploadModal } from '@/scene/AssetUploadModal';
import { AssetDetails } from '@/scene/AssetDetails';
import { useSceneMeasurements } from '@/scene/useSceneMeasurements';
import { useSceneAssets } from '@/scene/useSceneAssets';
import { defaultScene, scenes } from '@/scene/scenes.config';

export function App() {
  const [activeSceneId, setActiveSceneId] = useState<string | undefined>(defaultScene?.id);
  const [view, setView] = useState<SceneView | null>(null);
  const activeScene = scenes.find((s) => s.id === activeSceneId);
  const measurements = useSceneMeasurements(view);
  const assets = useSceneAssets(view, activeScene?.id ?? '');

  // The most-recent profile measurement drives the elevation-profile widget.
  const lastProfile = useMemo(() => {
    for (let i = measurements.items.length - 1; i >= 0; i--) {
      const item = measurements.items[i];
      if (item?.tool === 'profile') return item;
    }
    return undefined;
  }, [measurements.items]);

  return (
    <div className="h-screen flex flex-col">
      <TopBar
        scenes={scenes}
        activeSceneId={activeSceneId}
        onSelectScene={setActiveSceneId}
      />
      <main className={`flex-1 relative ${assets.placeMode ? 'placing-asset' : ''}`}>
        {activeScene ? (
          <>
            <SceneViewer scene={activeScene} onViewChange={setView} />
            {view && (
              <>
                <MeasurementToolbar
                  activeTool={measurements.activeTool}
                  startTool={(t) => void measurements.startTool(t)}
                  hasItems={measurements.items.length > 0}
                  clearAll={measurements.clearAll}
                />
                <MeasurementList items={measurements.items} removeItem={measurements.removeItem} />
                <ToolHint tool={measurements.activeTool} />
                {lastProfile && (
                  <ElevationProfilePanel
                    view={view}
                    analysis={lastProfile.analysis as ElevationProfileAnalysis}
                    onClose={() => measurements.removeItem(lastProfile.id)}
                  />
                )}
                <AssetToolbar
                  placeMode={assets.placeMode}
                  onTogglePlaceMode={assets.togglePlaceMode}
                  status={assets.status}
                  errorMessage={assets.errorMessage}
                  assetCount={assets.assets.length}
                />
                {assets.selectedAsset && (
                  <AssetDetails
                    asset={assets.selectedAsset}
                    onClose={() => assets.setSelectedAssetId(null)}
                    onDelete={(id) => assets.removeAsset(id)}
                  />
                )}
                {assets.pendingPosition && (
                  <AssetUploadModal
                    sceneId={activeScene.id}
                    position={assets.pendingPosition}
                    onCancel={assets.cancelPending}
                    onUpload={assets.upload}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <div className="p-8 max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight">Ingen scener tilgjengelig</h1>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              Legg til en scene i{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                apps/frontend/src/scene/scenes.config.ts
              </code>{' '}
              eller sett <code className="rounded bg-white px-1.5 py-0.5 text-xs">VITE_AGOL_SCENE_SERVICE_URL</code> i{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">apps/frontend/.env</code>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
