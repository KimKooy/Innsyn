import { useEffect, useRef } from 'react';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer.js';
import SpatialReference from '@arcgis/core/geometry/SpatialReference.js';
import * as projectOperator from '@arcgis/core/geometry/operators/projectOperator.js';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type Map from '@arcgis/core/Map.js';
import type { SceneConfig } from './scenes.config';
import './setup';

type SceneViewerProps = {
  scene: SceneConfig;
  /** Called once the SceneView is ready. Called again with null on unmount/scene change. */
  onViewChange?: (view: SceneView | null) => void;
};

const sceneStyle = { display: 'block', width: '100%', height: '100%' } as const;

export function SceneViewer({ scene, onViewChange }: SceneViewerProps) {
  const ref = useRef<HTMLArcgisSceneElement | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    let layer: IntegratedMeshLayer | null = null;
    // Capture the map in this closure so cleanup detaches the layer from
    // the right Map instance even if React has already remounted the
    // <arcgis-scene> element (via the key prop below).
    let capturedMap: Map | null | undefined = null;

    const run = async () => {
      if (scene.type === 'integrated-mesh') {
        if (!projectOperator.isLoaded()) await projectOperator.load();
        if (cancelled) return;
        el.spatialReference = new SpatialReference({ wkid: scene.wkid });
      }

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
      capturedMap = map;
      onViewChangeRef.current?.(view);

      if (scene.type !== 'integrated-mesh' || !map) return;

      layer = new IntegratedMeshLayer({ url: scene.serviceUrl });
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
      onViewChangeRef.current?.(null);
      if (layer && capturedMap) {
        capturedMap.remove(layer);
        layer.destroy();
      }
    };
  }, [scene]);

  // key={scene.id} forces React to fully unmount + remount the <arcgis-scene>
  // when the active scene changes, so the web component's destructor runs and
  // the SceneView is recreated from scratch.
  if (scene.type === 'web-scene') {
    return <arcgis-scene key={scene.id} ref={ref} item-id={scene.itemId} style={sceneStyle} />;
  }
  return (
    <arcgis-scene
      key={scene.id}
      ref={ref}
      viewing-mode="local"
      ground="world-elevation"
      style={sceneStyle}
    />
  );
}
