import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type ArcgisSceneAttributes = {
  'item-id'?: string;
  basemap?: string;
  ground?: string;
  zoom?: number | string;
  'viewing-mode'?: 'global' | 'local';
  'disable-popup'?: boolean;
  'hide-attribution'?: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'arcgis-scene': DetailedHTMLProps<
        HTMLAttributes<HTMLArcgisSceneElement>,
        HTMLArcgisSceneElement
      > &
        ArcgisSceneAttributes;
    }
  }
}

export {};
