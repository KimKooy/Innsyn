import { displayQuantity, measurementsToCsv, toolTitle } from './measurement-format';
import type { Measurement } from './useSceneMeasurements';

type Props = {
  items: Measurement[];
  removeItem: (id: string) => void;
};

function downloadCsv(items: Measurement[]) {
  const csv = measurementsToCsv(items);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `innsyn-malinger-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function MeasurementList({ items, removeItem }: Props) {
  if (items.length === 0) return null;

  const exportable = items.filter((m) => m.primary);

  return (
    <aside className="absolute top-3 right-3 z-10 w-72 max-h-[calc(100vh-7rem)] flex flex-col rounded-lg bg-white shadow-md border border-line">
      <header className="px-3 py-2 border-b border-line flex items-center justify-between">
        <span className="text-sm font-semibold">Målinger ({items.length})</span>
        {exportable.length > 0 && (
          <button
            type="button"
            onClick={() => downloadCsv(exportable)}
            className="text-xs text-primary hover:underline"
          >
            Eksporter CSV
          </button>
        )}
      </header>
      <ul className="flex-1 overflow-y-auto divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{toolTitle(item.tool)}</span>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="text-xs text-ink/70 hover:text-red-700"
                aria-label="Fjern måling"
              >
                Fjern
              </button>
            </div>
            {item.primary ? (
              <div className="mt-1 text-ink/80">
                <span>{displayQuantity(item.primary)}</span>
                {item.secondary && (
                  <span className="text-ink/50">
                    {' · '}
                    {displayQuantity(item.secondary)}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-1 text-xs text-ink/50 italic">verktøy aktivt i scenen</div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
