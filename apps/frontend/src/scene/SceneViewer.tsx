import './setup';

type SceneViewerProps = {
  itemId: string;
  className?: string;
};

export function SceneViewer({ itemId, className }: SceneViewerProps) {
  return (
    <arcgis-scene
      item-id={itemId}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}
