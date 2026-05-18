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

function promoteUnit(q: Quantity): Quantity {
  if (q.unit === 'meters' || q.unit === 'meter') {
    if (q.value >= 1000) return { value: q.value / 1000, unit: 'kilometers' };
  }
  if (q.unit === 'square-meters') {
    if (q.value >= 1_000_000) return { value: q.value / 1_000_000, unit: 'square-kilometers' };
    if (q.value >= 10_000) return { value: q.value / 10_000, unit: 'hectares' };
  }
  return q;
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
  const p = promoteUnit(q);
  const decimals = p.value >= 100 ? 1 : 2;
  return `${p.value.toFixed(decimals)} ${unitLabels[p.unit] ?? p.unit}`;
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

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function measurementsToCsv(
  rows: { tool: ToolId; primary?: Quantity; secondary?: Quantity; createdAt: string }[],
): string {
  const BOM = '﻿'; // makes Excel on Windows treat the file as UTF-8
  const header = [
    'type',
    'primary_value',
    'primary_unit',
    'secondary_value',
    'secondary_unit',
    'timestamp',
  ].join(',');
  const lines = rows.map((r) =>
    [
      csvCell(toolTitle(r.tool)),
      csvCell(r.primary?.value ?? ''),
      csvCell(r.primary ? (unitLabels[r.primary.unit] ?? r.primary.unit) : ''),
      csvCell(r.secondary?.value ?? ''),
      csvCell(r.secondary ? (unitLabels[r.secondary.unit] ?? r.secondary.unit) : ''),
      csvCell(r.createdAt),
    ].join(','),
  );
  return BOM + [header, ...lines].join('\n');
}
