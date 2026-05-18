import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D.js';
import IconSymbol3DLayer from '@arcgis/core/symbols/IconSymbol3DLayer.js';
import type { AssetDTO, CreateAssetInput, ScenePosition } from '@innsyn/shared';
import {
  ApiError,
  createAsset,
  deleteAsset,
  listAssetsForScene,
  uploadToBlob,
} from './asset-api';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export type SceneAssets = ReturnType<typeof useSceneAssets>;

const ASSET_LAYER_ID = 'innsyn-asset-markers';

function buildMarkerSymbol() {
  return new PointSymbol3D({
    symbolLayers: [
      new IconSymbol3DLayer({
        size: 18,
        resource: { primitive: 'circle' },
        material: { color: '#1cb5a8' },
        outline: { color: '#ffffff', size: 2 },
      }),
    ],
  });
}

function assetToGraphic(asset: AssetDTO, view: SceneView) {
  const point = new Point({
    x: asset.position.x,
    y: asset.position.y,
    z: asset.position.z,
    spatialReference: view.spatialReference,
  });
  return new Graphic({
    geometry: point,
    symbol: buildMarkerSymbol(),
    attributes: { assetId: asset.id },
  });
}

export function useSceneAssets(view: SceneView | null, sceneId: string) {
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<ScenePosition | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const layerRef = useRef<GraphicsLayer | null>(null);

  // Wire up a dedicated GraphicsLayer for asset markers when the view appears.
  useEffect(() => {
    if (!view) return;
    const map = view.map;
    if (!map) return;
    const layer = new GraphicsLayer({ id: ASSET_LAYER_ID, title: 'Assets' });
    map.add(layer);
    layerRef.current = layer;
    return () => {
      map.remove(layer);
      layerRef.current = null;
    };
  }, [view]);

  // Load assets from API whenever sceneId or view changes.
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);
    void listAssetsForScene(sceneId)
      .then((res) => {
        if (cancelled) return;
        setAssets(res.assets);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `${err.status}: ${err.message}` : String(err);
        setAssets([]);
        setStatus('error');
        setErrorMessage(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [view, sceneId]);

  // Re-render graphics whenever the asset list or view changes.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !view) return;
    layer.removeAll();
    for (const asset of assets) {
      layer.add(assetToGraphic(asset, view));
    }
  }, [assets, view]);

  // Click handler: place mode captures position, otherwise click selects an asset.
  useEffect(() => {
    if (!view) return;
    const handle = view.on('click', async (event) => {
      if (placeMode) {
        const p = event.mapPoint;
        if (!p) return;
        setPendingPosition({ x: p.x, y: p.y, z: p.z ?? 0 });
        setPlaceMode(false);
        return;
      }
      // Otherwise, select asset if the click hit one of our markers
      const hit = await view.hitTest(event);
      const graphicHit = hit.results.find(
        (r) => r.type === 'graphic' && r.graphic.layer?.id === ASSET_LAYER_ID,
      );
      if (graphicHit && graphicHit.type === 'graphic') {
        const id = graphicHit.graphic.attributes?.assetId;
        if (typeof id === 'string') setSelectedAssetId(id);
      }
    });
    return () => handle.remove();
  }, [view, placeMode]);

  const togglePlaceMode = useCallback(() => {
    setPlaceMode((m) => !m);
    setPendingPosition(null);
  }, []);

  const cancelPending = useCallback(() => setPendingPosition(null), []);

  const upload = useCallback(
    async (
      input: Omit<CreateAssetInput, 'position' | 'fileName' | 'contentType' | 'sizeBytes'>,
      file: File,
    ) => {
      if (!pendingPosition) throw new Error('No position captured');
      const payload: CreateAssetInput = {
        ...input,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        position: pendingPosition,
      };
      const result = await createAsset(payload);
      try {
        await uploadToBlob(result.uploadUrl, result.uploadHeaders, file);
      } catch (err) {
        // The DB row exists but the blob is missing — leave a follow-up cleanup
        // for a later sweep. Surface the error to the user.
        throw err;
      }
      setAssets((curr) => [result.asset, ...curr]);
      setPendingPosition(null);
      setSelectedAssetId(result.asset.id);
    },
    [pendingPosition],
  );

  const removeAsset = useCallback(async (id: string) => {
    await deleteAsset(id);
    setAssets((curr) => curr.filter((a) => a.id !== id));
    setSelectedAssetId((curr) => (curr === id ? null : curr));
  }, []);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  return {
    assets,
    status,
    errorMessage,
    placeMode,
    pendingPosition,
    selectedAsset,
    togglePlaceMode,
    cancelPending,
    setSelectedAssetId,
    upload,
    removeAsset,
  };
}
