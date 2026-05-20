import { useAccount } from '@/auth/useAccount';
import { useMe } from '@/auth/useMe';
import type { SceneConfig } from '@/scene/scenes.config';

type Props = {
  scenes: SceneConfig[];
  activeSceneId?: string;
  onSelectScene: (id: string) => void;
};

function UserChip() {
  const { isReady, isAuthenticated, account, signIn, signOut } = useAccount();
  const me = useMe();

  if (!isReady) {
    return <span className="text-sm text-ink/60">Ikke konfigurert</span>;
  }

  if (!isAuthenticated || !account) {
    return (
      <button
        type="button"
        onClick={() => void signIn()}
        className="rounded bg-primary text-white text-sm px-3 py-1.5 hover:bg-primary/90"
      >
        Logg inn
      </button>
    );
  }

  const display =
    (me.status === 'ready' && me.user.displayName) || account.name || account.username;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-ink/80" title={account.username}>
        {display}
      </span>
      {me.status === 'error' && (
        <span className="text-red-700 text-xs" title={me.message}>
          (API: feil)
        </span>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-xs text-ink/60 hover:text-ink"
      >
        Logg ut
      </button>
    </div>
  );
}

export function TopBar({ scenes, activeSceneId, onSelectScene }: Props) {
  return (
    <header className="bg-white border-b border-line h-14 flex items-center px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full bg-primary" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">Innsyn</span>
      </div>
      {scenes.length > 0 && (
        <label className="ml-6 flex items-center gap-2 text-sm">
          <span className="text-ink/60">Scene</span>
          <select
            value={activeSceneId ?? ''}
            onChange={(e) => onSelectScene(e.target.value)}
            className="rounded border border-line bg-white px-2 py-1 hover:border-ink/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="ml-auto">
        <UserChip />
      </div>
    </header>
  );
}
