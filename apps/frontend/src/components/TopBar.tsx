import type { SceneConfig } from '@/scene/scenes.config';

type Props = {
  scenes: SceneConfig[];
  activeSceneId?: string;
  onSelectScene: (id: string) => void;
};

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
      <div className="ml-auto text-sm text-ink/60">Ikke pålogget</div>
    </header>
  );
}
