type Props = {
  placeMode: boolean;
  onTogglePlaceMode: () => void;
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  assetCount: number;
};

export function AssetToolbar({
  placeMode,
  onTogglePlaceMode,
  status,
  errorMessage,
  assetCount,
}: Props) {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-white shadow-md border border-line p-1.5">
      <button
        type="button"
        onClick={onTogglePlaceMode}
        aria-pressed={placeMode}
        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
          placeMode ? 'bg-primary text-white shadow-inner' : 'text-ink hover:bg-soft'
        }`}
        title={
          placeMode
            ? 'Klikk i scenen for å plassere asset, eller trykk for å avbryte'
            : 'Aktiver klikkmodus for å plassere et nytt asset'
        }
      >
        {placeMode ? 'Klikk i scene…' : '+ Plasser asset'}
      </button>
      <span className="text-xs text-ink/60 px-2">
        {status === 'loading'
          ? 'Laster…'
          : status === 'error'
            ? `Feil: ${errorMessage ?? 'ukjent'}`
            : `${assetCount} asset${assetCount === 1 ? '' : 's'}`}
      </span>
    </div>
  );
}
