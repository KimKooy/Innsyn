import { useEffect, useRef } from 'react';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer.js';
import SpatialReference from '@arcgis/core/geometry/SpatialReference.js';
import * as projectOperator from '@arcgis/core/geometry/operators/projectOperator.js';
import type SceneView from '@arcgis/core/views/SceneView.js';
import './setup';

type SceneViewerProps = {
  /** AGOL Web Scene item-ID. Takes precedence over meshServiceUrl. */
  itemId?: string;
  /** Direct Scene Service URL for an IntegratedMesh layer. */
  meshServiceUrl?: string;
  /**
   * Spatial reference WKID for the local SceneView. Required when meshServiceUrl
   * points to a layer in a non-global projection (e.g. UTM). Defaults to 25833
   * (ETRS89 / UTM zone 33N) which covers most of Origon's Norwegian surveys.
   */
  wkid?: number;
  /** Called once the SceneView is ready. Called again with null on unmount. */
  onViewChange?: (view: SceneView | null) => void;
};

const sceneStyle = { display: 'block', width: '100%', height: '100%' } as const;

export function SceneViewer({
  itemId,
  meshServiceUrl,
  wkid = 25833,
  onViewChange,
}: SceneViewerProps) {
  const ref = useRef<HTMLArcgisSceneElement | null>(null);

  useEffect(() => {
    if (!meshServiceUrl) return;
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    let layer: IntegratedMeshLayer | null = null;

    const run = async () => {
      // The view's spatial reference can only be changed once projectOperator
      // has the projection engine loaded.
      if (!projectOperator.isLoaded()) await projectOperator.load();
      if (cancelled) return;

      el.spatialReference = new SpatialReference({ wkid });

      while (!el.view && !cancelled) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (cancelled || !el.view) return;

      try {
        await el.view.when();
      } catch {
        return;
      }
      if (cancelled) return;

      const view = el.view;
      const map = view.map;
      if (!map) return;

      onViewChange?.(view);

      layer = new IntegratedMeshLayer({ url: meshServiceUrl });
      map.add(layer);

      try {
        await layer.when();
      } catch {
        return;
      }
      if (cancelled || !layer?.fullExtent) return;

      try {
        await view.goTo(
          { target: layer.fullExtent, tilt: 65, heading: 30 },
          { duration: 1500 },
        );
      } catch {
        // user interaction can abort goTo — not fatal
      }
    };

    void run();

    return () => {
      cancelled = true;
      onViewChange?.(null);
      if (layer && ref.current?.view?.map) {
        ref.current.view.map.remove(layer);
      }
    };
  }, [meshServiceUrl, wkid, onViewChange]);

  if (itemId) {
    return <arcgis-scene ref={ref} item-id={itemId} style={sceneStyle} />;
  }
  return (
    <arcgis-scene
      ref={ref}
      viewing-mode="local"
      ground="world-elevation"
      style={sceneStyle}
    />
  );
}
