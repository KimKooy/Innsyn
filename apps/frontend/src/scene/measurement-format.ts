import type { ToolId } from './useSceneMeasurements';

type Quantity = { value: number; unit: string };

export type FormattedMeasurement = {
  primary?: Quantity;
  secondary?: Quantity;
};

const unitLabels: Record<string, string> = {
  meters: 'm',
  meter: 'm',
  kilometers: 'km',
  feet: 'ft',
  'square-meters': 'm²',
  'square-kilometers': 'km²',
  hectares: 'ha',
  'cubic-meters': 'm³',
};

function asQuantity(value: unknown): Quantity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = (value as { value?: unknown }).value;
  const u = (value as { unit?: unknown }).unit;
  if (typeof v !== 'number' || typeof u !== 'string') return undefined;
  return { value: v, unit: u };
}

export function formatResult(tool: ToolId, result: unknown): FormattedMeasurement | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  switch (tool) {
    case 'distance':
      return { primary: asQuantity(r.directDistance) };
    case 'area':
      return {
        primary: asQuantity(r.area),
        secondary: asQuantity(r.perimeterLength) ?? asQuantity(r.perimeter),
      };
    case 'volume':
      return {
        primary: asQuantity(r.netVolume) ?? asQuantity(r.totalVolume) ?? asQuantity(r.volume),
        secondary: asQuantity(r.area),
      };
    case 'profile':
    case 'slice':
      return undefined;
  }
}

export function displayQuantity(q: Quantity | undefined): string {
  if (!q) return '—';
  const decimals = q.value >= 100 ? 1 : 2;
  return `${q.value.toFixed(decimals)} ${unitLabels[q.unit] ?? q.unit}`;
}

export function toolTitle(tool: ToolId): string {
  return (
    {
      distance: 'Avstand',
      area: 'Areal',
      volume: 'Volum',
      profile: 'Høydeprofil',
      slice: 'Klippeflate',
    } satisfies Record<ToolId, string>
  )[tool];
}

export function measurementsToCsv(
  rows: { tool: ToolId; primary?: Quantity; secondary?: Quantity; createdAt: string }[],
): string {
  const header = 'type,primary_value,primary_unit,secondary_value,secondary_unit,timestamp';
  const lines = rows.map((r) => {
    const p = r.primary;
    const s = r.secondary;
    return [
      toolTitle(r.tool),
      p?.value ?? '',
      p ? (unitLabels[p.unit] ?? p.unit) : '',
      s?.value ?? '',
      s ? (unitLabels[s.unit] ?? s.unit) : '',
      r.createdAt,
    ].join(',');
  });
  return [header, ...lines].join('\n');
}
