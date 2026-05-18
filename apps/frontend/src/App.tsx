import { TopBar } from '@/components/TopBar';
import { SceneViewer } from '@/scene/SceneViewer';

const itemId = import.meta.env.VITE_AGOL_ITEM_ID as string | undefined;

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 relative">
        {itemId ? (
          <SceneViewer itemId={itemId} />
        ) : (
          <div className="p-8 max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight">Velkommen til Innsyn</h1>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              Sett <code className="rounded bg-white px-1.5 py-0.5 text-xs">VITE_AGOL_ITEM_ID</code>{' '}
              i <code className="rounded bg-white px-1.5 py-0.5 text-xs">apps/frontend/.env</code>{' '}
              for å laste en AGOL WebScene.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
