import { useEffect, useRef } from 'react';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer.js';
import './setup';

type SceneViewerProps = {
  /** AGOL Web Scene item-ID. Takes precedence over meshServiceUrl. */
  itemId?: string;
  /** Direct Scene Service URL for an IntegratedMesh layer. */
  meshServiceUrl?: string;
};

const sceneStyle = { display: 'block', width: '100%', height: '100%' } as const;

export function SceneViewer({ itemId, meshServiceUrl }: SceneViewerProps) {
  const ref = useRef<HTMLArcgisSceneElement | null>(null);

  useEffect(() => {
    if (!meshServiceUrl) return;
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    let layer: IntegratedMeshLayer | null = null;

    const addLayer = () => {
      if (cancelled) return;
      const view = el.view;
      const map = view?.map;
      if (!view || !map) return;
      layer = new IntegratedMeshLayer({ url: meshServiceUrl });
      map.add(layer);
      void layer.when(() => {
        if (cancelled || !layer?.fullExtent) return;
        void view.goTo(layer.fullExtent, { duration: 1500 });
      });
    };

    if (el.ready) addLayer();
    else el.addEventListener('arcgisViewReadyChange', addLayer, { once: true });

    return () => {
      cancelled = true;
      el.removeEventListener('arcgisViewReadyChange', addLayer);
      if (layer && el.view?.map) el.view.map.remove(layer);
    };
  }, [meshServiceUrl]);

  if (itemId) {
    return <arcgis-scene ref={ref} item-id={itemId} style={sceneStyle} />;
  }
  return (
    <arcgis-scene ref={ref} basemap="hybrid" ground="world-elevation" style={sceneStyle} />
  );
}
