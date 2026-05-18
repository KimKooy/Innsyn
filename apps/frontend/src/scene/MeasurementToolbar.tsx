import type { ToolId } from './useSceneMeasurements';

type Props = {
  activeTool: ToolId | null;
  startTool: (tool: ToolId) => void;
  hasItems: boolean;
  clearAll: () => void;
};

const tools: { id: ToolId; label: string; hint: string }[] = [
  { id: 'distance', label: 'Avstand', hint: 'Klikk to punkter' },
  { id: 'area', label: 'Areal', hint: 'Klikk hjørner, dobbeltklikk for å avslutte' },
  { id: 'volume', label: 'Volum', hint: 'Tegn polygon, juster målflate' },
  { id: 'profile', label: 'Høydeprofil', hint: 'Tegn en linje i scenen' },
  { id: 'slice', label: 'Klippeflate', hint: 'Klikk for å plassere kuttplan' },
];

export function MeasurementToolbar({ activeTool, startTool, hasItems, clearAll }: Props) {
  return (
    <div className="absolute top-3 left-3 z-10 flex items-stretch gap-1 rounded-lg bg-white shadow-md border border-line p-1">
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => startTool(tool.id)}
            title={tool.hint}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-white shadow-inner'
                : 'text-ink hover:bg-soft'
            }`}
          >
            {tool.label}
          </button>
        );
      })}
      {hasItems && (
        <>
          <div className="w-px bg-line mx-0.5" aria-hidden />
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-2 rounded text-sm text-ink hover:bg-soft"
          >
            Tøm alle
          </button>
        </>
      )}
    </div>
  );
}
