import { useEffect, useMemo, useRef, useState } from 'react';
import type Polyline from '@arcgis/core/geometry/Polyline.js';
import type { ScatterPoint } from './profile-sampling';

/**
 * Custom elevation-profile chart. Replaces <arcgis-elevation-profile>
 * which couldn't give us 1:1 axes without collapsing short profiles
 * into a tiny box and locked us out of overlays (point-cloud scatter,
 * vertical-exaggeration picker, hover-sync to 3D — all coming in
 * follow-up commits).
 *
 * v1 scope: render the user-drawn polyline as a single Canvas line with
 * SVG axis labels. No d3 dep — linear scales are trivial enough to
 * inline. High-DPI aware (canvas resolution × devicePixelRatio).
 */

type Sample = { d: number; z: number };

const MARGIN = { top: 12, right: 16, bottom: 28, left: 56 } as const;
const LINE_COLOR = '#1cb5a8';
const GRID_COLOR = 'rgba(26, 39, 51, 0.06)';
const AXIS_COLOR = 'rgba(26, 39, 51, 0.6)';
const SCATTER_COLOR = 'rgba(26, 39, 51, 0.22)';
const SCATTER_RADIUS = 1.4;

function polylineToSamples(polyline: Polyline): Sample[] {
  const samples: Sample[] = [];
  let cumulative = 0;
  let last: [number, number] | null = null;
  for (const path of polyline.paths) {
    for (const v of path) {
      const x = v[0];
      const y = v[1];
      const z = v[2];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      if (last) {
        const dx = x - last[0];
        const dy = y - last[1];
        cumulative += Math.sqrt(dx * dx + dy * dy);
      }
      samples.push({ d: cumulative, z: typeof z === 'number' ? z : 0 });
      last = [x, y];
    }
  }
  return samples;
}

/**
 * Generate "nice" tick values for an axis spanning [min, max] aiming at
 * roughly `target` ticks. Returns rounded multiples of 1/2/5×10^n.
 */
function niceTicks(min: number, max: number, target: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const rough = (max - min) / Math.max(target, 1);
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const fraction = rough / base;
  let step: number;
  if (fraction < 1.5) step = base;
  else if (fraction < 3) step = base * 2;
  else if (fraction < 7) step = base * 5;
  else step = base * 10;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

type Domain = {
  dMax: number;
  zMin: number;
  zMax: number;
};

export type VerticalExaggeration = 'auto' | 1 | 2 | 5 | 10;

function computeDataRange(
  samples: Sample[],
  scatter: ScatterPoint[],
): { dMax: number; zMin: number; zMax: number } | null {
  if (samples.length === 0) return null;
  const dMax = samples[samples.length - 1]!.d;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const s of samples) {
    if (s.z < zMin) zMin = s.z;
    if (s.z > zMax) zMax = s.z;
  }
  for (const p of scatter) {
    if (p.z > zMax) zMax = p.z;
    if (p.z < zMin) zMin = p.z;
  }
  if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) return null;
  if (zMin === zMax) {
    zMin -= 0.5;
    zMax += 0.5;
  } else {
    const pad = (zMax - zMin) * 0.08;
    zMin -= pad;
    zMax += pad;
  }
  return { dMax, zMin, zMax };
}

function computeDomain(
  samples: Sample[],
  scatter: ScatterPoint[],
  plotW: number,
  plotH: number,
  exaggeration: VerticalExaggeration,
): Domain | null {
  const raw = computeDataRange(samples, scatter);
  if (!raw) return null;
  if (exaggeration === 'auto' || plotW <= 0 || plotH <= 0) {
    return raw;
  }
  // Exaggeration is the multiple of vertical scale relative to horizontal:
  //   vPxPerM = k × hPxPerM
  // Centre the data within the resulting visible z-range; the surrounding
  // padding stays empty so the chart's visible tilt actually matches k.
  const hPxPerM = plotW / Math.max(raw.dMax, 1);
  const vPxPerM = exaggeration * hPxPerM;
  const zRangeVisible = plotH / Math.max(vPxPerM, 1e-9);
  const centre = (raw.zMin + raw.zMax) / 2;
  return {
    dMax: raw.dMax,
    zMin: centre - zRangeVisible / 2,
    zMax: centre + zRangeVisible / 2,
  };
}

type Props = {
  polyline: Polyline | null;
  scatter?: ScatterPoint[];
  /** 'auto' fits the data to the canvas; numeric k forces v-scale = k × h-scale. */
  verticalExaggeration?: VerticalExaggeration;
  /** Notified on cursor hover. `d` is the polyline distance in meters, or null when off the chart. */
  onHover?: (d: number | null) => void;
  /** Notified when the user clicks a point on the chart. */
  onClick?: (d: number) => void;
};

export function ProfileChart({
  polyline,
  scatter,
  verticalExaggeration = 'auto',
  onHover,
  onClick,
}: Props) {
  const scatterPoints = scatter ?? [];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const samples = useMemo(
    () => (polyline ? polylineToSamples(polyline) : []),
    [polyline],
  );
  const plotW = Math.max(size.width - MARGIN.left - MARGIN.right, 1);
  const plotH = Math.max(size.height - MARGIN.top - MARGIN.bottom, 1);
  const domain = useMemo(
    () => computeDomain(samples, scatterPoints, plotW, plotH, verticalExaggeration),
    [samples, scatterPoints, plotW, plotH, verticalExaggeration],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = size;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!domain || samples.length === 0) return;

    const plotLeft = MARGIN.left;
    const plotRight = width - MARGIN.right;
    const plotTop = MARGIN.top;
    const plotBottom = height - MARGIN.bottom;
    const innerW = Math.max(plotRight - plotLeft, 1);
    const innerH = Math.max(plotBottom - plotTop, 1);

    const xScale = (v: number) =>
      plotLeft + (v / Math.max(domain.dMax, 1)) * innerW;
    const yScale = (v: number) =>
      plotBottom - ((v - domain.zMin) / (domain.zMax - domain.zMin || 1)) * innerH;

    // Grid (y-axis horizontal lines)
    const yTicks = niceTicks(domain.zMin, domain.zMax, 5);
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (const t of yTicks) {
      const y = yScale(t);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    // Axis line (left + bottom)
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    // Scatter (point-cloud splats inside the slab). Drawn BEFORE the
    // line so the line stays on top — gives a "density cloud" effect.
    if (scatterPoints.length > 0) {
      ctx.fillStyle = SCATTER_COLOR;
      for (const p of scatterPoints) {
        if (p.d < 0 || p.d > domain.dMax + 1e-6) continue;
        const x = xScale(p.d);
        const y = yScale(p.z);
        ctx.beginPath();
        ctx.arc(x, y, SCATTER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Profile line
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const x = xScale(s.d);
      const y = yScale(s.z);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [domain, samples, scatterPoints, size]);

  const ticks = useMemo(() => {
    if (!domain || size.width === 0) return null;
    return {
      x: niceTicks(0, domain.dMax, 6),
      y: niceTicks(domain.zMin, domain.zMax, 5),
    };
  }, [domain, size]);

  const hasData = samples.length > 0 && domain !== null;
  const plotLeft = MARGIN.left;
  const plotRight = size.width - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = size.height - MARGIN.bottom;

  const [hoverD, setHoverD] = useState<number | null>(null);

  // Sample at the hovered d via interpolation between adjacent dense
  // polyline samples.
  const hoverSample = useMemo<Sample | null>(() => {
    if (hoverD === null || samples.length === 0) return null;
    if (hoverD <= samples[0]!.d) return samples[0]!;
    const last = samples[samples.length - 1]!;
    if (hoverD >= last.d) return last;
    // Binary search for the segment containing hoverD.
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid]!.d <= hoverD) lo = mid;
      else hi = mid;
    }
    const a = samples[lo]!;
    const b = samples[hi]!;
    const span = b.d - a.d;
    const t = span > 0 ? (hoverD - a.d) / span : 0;
    return { d: hoverD, z: a.z + (b.z - a.z) * t };
  }, [hoverD, samples]);

  const xPxScale = (v: number) =>
    plotLeft + (v / Math.max(domain?.dMax ?? 1, 1)) * Math.max(plotW, 1);
  const yPxScale = (v: number) =>
    plotBottom -
    ((v - (domain?.zMin ?? 0)) / Math.max((domain?.zMax ?? 1) - (domain?.zMin ?? 0), 1)) *
      Math.max(plotH, 1);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onMouseMove={(e) => {
        if (!hasData || !containerRef.current || !domain) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < plotLeft || x > plotRight) {
          if (hoverD !== null) {
            setHoverD(null);
            onHover?.(null);
          }
          return;
        }
        const d = ((x - plotLeft) / Math.max(plotW, 1)) * domain.dMax;
        setHoverD(d);
        onHover?.(d);
      }}
      onMouseLeave={() => {
        if (hoverD !== null) {
          setHoverD(null);
          onHover?.(null);
        }
      }}
      onClick={(e) => {
        if (!hasData || !containerRef.current || !domain) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < plotLeft || x > plotRight) return;
        const d = ((x - plotLeft) / Math.max(plotW, 1)) * domain.dMax;
        onClick?.(d);
      }}
      style={{ cursor: hasData ? 'crosshair' : 'default' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink/50">
          Tegn en linje for å se profil
        </div>
      )}
      {hasData && ticks && size.width > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={size.width}
          height={size.height}
        >
          {ticks.x.map((t) => {
            const x = plotLeft + (t / Math.max(domain.dMax, 1)) * plotW;
            if (x < plotLeft - 1 || x > plotRight + 1) return null;
            return (
              <text
                key={`x-${t}`}
                x={x}
                y={size.height - 8}
                textAnchor="middle"
                className="fill-ink/60"
                style={{ fontSize: 10 }}
              >
                {t.toFixed(0)} m
              </text>
            );
          })}
          {ticks.y.map((t) => {
            const y =
              plotBottom -
              ((t - domain.zMin) / (domain.zMax - domain.zMin || 1)) * plotH;
            return (
              <text
                key={`y-${t}`}
                x={plotLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-ink/60"
                style={{ fontSize: 10 }}
              >
                {t.toFixed(1)} m
              </text>
            );
          })}
          {hoverSample && hoverD !== null && (
            <>
              <line
                x1={xPxScale(hoverD)}
                x2={xPxScale(hoverD)}
                y1={plotTop}
                y2={plotBottom}
                stroke="rgba(26, 39, 51, 0.5)"
                strokeDasharray="3 3"
              />
              <circle
                cx={xPxScale(hoverSample.d)}
                cy={yPxScale(hoverSample.z)}
                r={4}
                fill="#1cb5a8"
                stroke="white"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      )}
      {hoverSample && hoverD !== null && size.width > 0 && domain && (
        <div
          className="absolute pointer-events-none rounded bg-ink text-white text-[11px] px-2 py-1 shadow-md"
          style={{
            left: Math.min(xPxScale(hoverD) + 10, size.width - 110),
            top: Math.max(yPxScale(hoverSample.z) - 28, 4),
          }}
        >
          {hoverSample.d.toFixed(1)} m · {hoverSample.z.toFixed(2)} m
        </div>
      )}
    </div>
  );
}
