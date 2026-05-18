/**
 * Registry of scenes shown in the Innsyn scene picker.
 *
 * For now this is a hand-edited TypeScript module — committed code.
 * Eventually scene management moves to the database (M5 in the
 * implementation plan), at which point this file becomes the seed.
 *
 * Adding a new scene from Geodata Online or any other ArcGIS host:
 *
 *   {
 *     id: 'short-id',
 *     title: 'Visningsnavn i picker',
 *     type: 'integrated-mesh',
 *     serviceUrl: 'https://services.geodataonline.no/.../SceneServer',
 *     wkid: 25833, // UTM 33N. Use 25832 for UTM 32N etc.
 *   }
 *
 * For AGOL Web Scenes (containers with their own basemap/layers/camera):
 *
 *   {
 *     id: 'short-id',
 *     title: 'Visningsnavn',
 *     type: 'web-scene',
 *     itemId: 'ea74021dcbd94fb4995145ac54ee0519',
 *   }
 */

export type IntegratedMeshScene = {
  id: string;
  title: string;
  description?: string;
  type: 'integrated-mesh';
  serviceUrl: string;
  /** SR for the SceneView in local viewing mode. Required for non-global meshes. */
  wkid: number;
};

export type WebScene = {
  id: string;
  title: string;
  description?: string;
  type: 'web-scene';
  itemId: string;
};

export type SceneConfig = IntegratedMeshScene | WebScene;

const builtIn: SceneConfig[] = [
  {
    id: 'vollsveien',
    title: '20484 Vollsveien Mesh',
    description: 'IntegratedMesh fotogrammetri, Lysaker (ETRS89 / UTM 33N)',
    type: 'integrated-mesh',
    serviceUrl:
      'https://tiles-eu1.arcgis.com/loNHWbbUDaxqMQ4L/arcgis/rest/services/20484_Vollsveien_Mesh/SceneServer',
    wkid: 25833,
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
      title: 'Mesh (.env)',
      type: 'integrated-mesh',
      serviceUrl: url,
      wkid: 25833,
    };
  }
  return null;
}

const fromEnv = envScene();

// Env-defined scene is prepended so VITE_AGOL_* still works as an override for
// ad-hoc testing without editing this file.
export const scenes: SceneConfig[] = fromEnv ? [fromEnv, ...builtIn] : builtIn;
export const defaultScene: SceneConfig | undefined = scenes[0];
