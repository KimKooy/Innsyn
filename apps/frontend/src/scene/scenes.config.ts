/**
 * Registry of scenes shown in the Innsyn scene picker.
 *
 * For now this is a hand-edited TypeScript module — committed code.
 * Eventually scene management moves to the database (M5 in the
 * implementation plan), at which point this file becomes the seed.
 *
 * Adding a new scene with one or more 3D layers:
 *
 *   {
 *     id: 'short-id',
 *     title: 'Visningsnavn i picker',
 *     type: 'local',
 *     wkid: 25833, // SR for the local SceneView. Use 25832 for UTM 32N.
 *     layers: [
 *       { type: 'integrated-mesh', url: '...SceneServer', title: 'Mesh' },
 *       { type: 'point-cloud',     url: '...SceneServer', title: 'Punktsky' },
 *     ],
 *   }
 *
 * Geodata Online services use the same pattern — just paste their
 * SceneServer URL. All layers in a 'local' scene must share the same
 * spatial reference (no on-the-fly reprojection in local viewing mode).
 *
 * For AGOL Web Scenes (containers with their own basemap/layers/camera):
 *
 *   { id: 'short-id', title: 'Visningsnavn', type: 'web-scene', itemId: '...' }
 */

export type SceneLayerSpec =
  | { type: 'integrated-mesh'; url: string; title?: string }
  | { type: 'point-cloud'; url: string; title?: string };

export type LocalScene = {
  id: string;
  title: string;
  description?: string;
  type: 'local';
  /** SR for the SceneView. All layers must be in this SR. */
  wkid: number;
  layers: SceneLayerSpec[];
};

export type WebScene = {
  id: string;
  title: string;
  description?: string;
  type: 'web-scene';
  itemId: string;
};

export type SceneConfig = LocalScene | WebScene;

const builtIn: SceneConfig[] = [
  {
    id: 'vollsveien',
    title: '20484 Vollsveien Mesh',
    description: 'IntegratedMesh fotogrammetri, Lysaker (ETRS89 / UTM 33N)',
    type: 'local',
    wkid: 25833,
    layers: [
      {
        type: 'integrated-mesh',
        url: 'https://tiles-eu1.arcgis.com/loNHWbbUDaxqMQ4L/arcgis/rest/services/20484_Vollsveien_Mesh/SceneServer',
        title: 'Mesh',
      },
    ],
  },
  {
    id: 'holmenkollen',
    title: '20367 Holmenkollen punktsky',
    description: 'Droneflygning punktsky, Holmenkollen (ETRS89 / UTM 32N)',
    type: 'local',
    wkid: 25832,
    layers: [
      {
        type: 'point-cloud',
        url: 'https://tiles-eu1.arcgis.com/loNHWbbUDaxqMQ4L/arcgis/rest/services/20367_Droneflygning_Holmenkollen/SceneServer',
        title: 'Punktsky',
      },
    ],
  },
];

function envScene(): SceneConfig | null {
  const itemId = import.meta.env.VITE_AGOL_ITEM_ID;
  if (typeof itemId === 'string' && itemId.length > 0) {
    return { id: 'env-webscene', title: 'Web Scene (.env)', type: 'web-scene', itemId };
  }
  const url = import.meta.env.VITE_AGOL_SCENE_SERVICE_URL;
  if (typeof url === 'string' && url.length > 0) {
    return {
      id: 'env-mesh',
      title: 'Scene (.env)',
      type: 'local',
      wkid: 25833,
      layers: [{ type: 'integrated-mesh', url, title: 'Mesh' }],
    };
  }
  return null;
}

const fromEnv = envScene();

export const scenes: SceneConfig[] = fromEnv ? [fromEnv, ...builtIn] : builtIn;
export const defaultScene: SceneConfig | undefined = scenes[0];
