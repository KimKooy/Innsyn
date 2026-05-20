import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D.js';
import IconSymbol3DLayer from '@arcgis/core/symbols/IconSymbol3DLayer.js';
import type { AssetDTO, CreateAssetInput, ScenePosition } from '@innsyn/shared';
import { useAccount } from '@/auth/useAccount';
import {
  ApiError,
  createAsset,
  deleteAsset,
  finalizeAsset,
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
  const { isAuthenticated, acquireToken } = useAccount();
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<ScenePosition | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const layerRef = useRef<GraphicsLayer | null>(null);
  // placeMode lives in a ref too so the view.on('click') listener doesn't
  // need to be re-attached every time the user toggles the toolbar button.
  const placeModeRef = useRef(false);
  useEffect(() => {
    placeModeRef.current = placeMode;
  }, [placeMode]);

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

  // Load assets from API whenever sceneId, view or auth state changes.
  useEffect(() => {
    if (!view) return;
    if (!isAuthenticated) {
      // No token available — skip the call; users see an empty list
      // (the toolbar status badge surfaces "ikke pålogget" separately).
      setAssets([]);
      setStatus('idle');
      setErrorMessage(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);
    void (async () => {
      try {
        const token = await acquireToken();
        if (cancelled) return;
        const res = await listAssetsForScene(sceneId, token);
        if (cancelled) return;
        setAssets(res.assets);
        setStatus('ready');
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `${err.status}: ${err.message}` : String(err);
        setAssets([]);
        setStatus('error');
        setErrorMessage(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, sceneId, isAuthenticated, acquireToken]);

  // Re-render graphics whenever the asset list or view changes.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !view) return;
    layer.removeAll();
    for (const asset of assets) {
      layer.add(assetToGraphic(asset, view));
    }
  }, [assets, view]);

  // Click handler: attached ONCE per view (placeMode read via ref so toggling
  // it doesn't tear down the listener).
  useEffect(() => {
    if (!view) return;
    const layer = layerRef.current;
    const handle = view.on('click', async (event) => {
      if (placeModeRef.current) {
        const p = event.mapPoint;
        if (!p) return;
        setPendingPosition({ x: p.x, y: p.y, z: p.z ?? 0 });
        setPlaceMode(false);
        return;
      }
      const hit = await view.hitTest(event);
      // Reference-equality check on the layer instance is more robust than
      // matching layer.id (in case a future webscene also exposes a layer
      // named "innsyn-asset-markers").
      const graphicHit = hit.results.find(
        (r) => r.type === 'graphic' && r.graphic.layer === layer,
      );
      if (graphicHit && graphicHit.type === 'graphic') {
        const raw: unknown = graphicHit.graphic.attributes?.assetId;
        if (typeof raw === 'string') setSelectedAssetId(raw);
      }
    });
    return () => handle.remove();
  }, [view]);

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
      const token = await acquireToken();
      const result = await createAsset(payload, token);
      try {
        await uploadToBlob(result.uploadUrl, result.uploadHeaders, file);
      } catch (err) {
        // The DB row exists but the blob is missing. The row stays
        // uploadedAt=null and stays hidden from list/download. A later sweep
        // job can GC orphans. Re-throw so the modal surfaces the error.
        throw err;
      }
      // Tell the backend the blob is in place — it flips uploadedAt and the
      // asset becomes visible to list/download.
      const finalizeToken = await acquireToken();
      const finalized = await finalizeAsset(result.asset.id, finalizeToken);
      setAssets((curr) => [finalized.asset, ...curr]);
      setPendingPosition(null);
      setSelectedAssetId(finalized.asset.id);
    },
    [pendingPosition, acquireToken],
  );

  const removeAsset = useCallback(
    async (id: string) => {
      const token = await acquireToken();
      await deleteAsset(id, token);
      setAssets((curr) => curr.filter((a) => a.id !== id));
      setSelectedAssetId((curr) => (curr === id ? null : curr));
    },
    [acquireToken],
  );

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
