import esriConfig from '@arcgis/core/config.js';
import { setAssetPath } from '@arcgis/map-components';
import '@arcgis/map-components/components/arcgis-scene';

const ARCGIS_VERSION = '5.0';

// During dev we point ArcGIS at the CDN instead of bundling its assets.
// For production we'll switch to a Vite plugin that copies the assets.
esriConfig.assetsPath = `https://js.arcgis.com/${ARCGIS_VERSION}/@arcgis/core/assets/`;
setAssetPath(`https://js.arcgis.com/map-components/${ARCGIS_VERSION}/dist/arcgis-map-components/`);
