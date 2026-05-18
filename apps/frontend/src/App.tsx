import { TopBar } from '@/components/TopBar';
import { SceneViewer } from '@/scene/SceneViewer';

const itemId = import.meta.env.VITE_AGOL_ITEM_ID as string | undefined;
const meshServiceUrl = import.meta.env.VITE_AGOL_SCENE_SERVICE_URL as string | undefined;
const hasScene = Boolean(itemId || meshServiceUrl);

export function App() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 relative">
        {hasScene ? (
          <SceneViewer itemId={itemId} meshServiceUrl={meshServiceUrl} />
        ) : (
          <div className="p-8 max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight">Velkommen til Innsyn</h1>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              Sett enten{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">VITE_AGOL_ITEM_ID</code>{' '}
              (AGOL Web Scene) eller{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                VITE_AGOL_SCENE_SERVICE_URL
              </code>{' '}
              (direkte Scene Service-URL) i{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">apps/frontend/.env</code>{' '}
              for å laste en scene.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
