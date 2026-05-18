import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type ArcgisSceneAttributes = {
  'item-id'?: string;
  basemap?: string;
  ground?: string;
  zoom?: number | string;
  'disable-popup'?: boolean;
  'hide-attribution'?: boolean;
};

type WebComponentProps<TAttrs> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> &
  TAttrs;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'arcgis-scene': WebComponentProps<ArcgisSceneAttributes>;
    }
  }
}

export {};
