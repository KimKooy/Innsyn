import type { ToolId } from './useSceneMeasurements';

type Props = {
  tool: ToolId | null;
};

const hints: Record<ToolId, string> = {
  distance: 'Klikk to punkter i scenen for å måle avstand.',
  area: 'Klikk hjørner i scenen. Dobbeltklikk for å avslutte polygonet.',
  volume: 'Tegn et polygon (dobbeltklikk for å avslutte), så et flytt-håndtak for målflaten.',
  profile: 'Klikk punkter langs linjen i scenen. Dobbeltklikk for å avslutte og se høydeprofilen.',
  slice: 'Klikk i scenen for å plassere kuttplanet, så dra håndtakene for å justere.',
};

export function ToolHint({ tool }: Props) {
  if (!tool) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-16 left-1/2 -translate-x-1/2 z-10 rounded-full bg-ink text-white text-xs px-4 py-2 shadow-md"
    >
      {hints[tool]}
    </div>
  );
}
