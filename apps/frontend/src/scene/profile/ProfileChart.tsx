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

function computeDomain(samples: Sample[], scatter: ScatterPoint[]): Domain | null {
  if (samples.length === 0) return null;
  const dMax = samples[samples.length - 1]!.d;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const s of samples) {
    if (s.z < zMin) zMin = s.z;
    if (s.z > zMax) zMax = s.z;
  }
  // Let the scatter expand the z range so vegetation / structures aren't
  // clipped, but only above the line (vegetation is up); below is usually
  // ground we already see in the curve.
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

type Props = {
  polyline: Polyline | null;
  scatter?: ScatterPoint[];
};

export function ProfileChart({ polyline, scatter }: Props) {
  const scatterPoints = scatter ?? [];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const samples = useMemo(
    () => (polyline ? polylineToSamples(polyline) : []),
    [polyline],
  );
  const domain = useMemo(
    () => computeDomain(samples, scatterPoints),
    [samples, scatterPoints],
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
    const plotW = Math.max(plotRight - plotLeft, 1);
    const plotH = Math.max(plotBottom - plotTop, 1);

    const xScale = (v: number) =>
      plotLeft + (v / Math.max(domain.dMax, 1)) * plotW;
    const yScale = (v: number) =>
      plotBottom - ((v - domain.zMin) / (domain.zMax - domain.zMin || 1)) * plotH;

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
  const plotW = Math.max(plotRight - plotLeft, 1);
  const plotH = Math.max(plotBottom - plotTop, 1);

  return (
    <div ref={containerRef} className="relative w-full h-full">
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
        </svg>
      )}
    </div>
  );
}
