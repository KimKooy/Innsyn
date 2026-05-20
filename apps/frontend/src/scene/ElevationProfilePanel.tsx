import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type ElevationProfileAnalysis from '@arcgis/core/analysis/ElevationProfileAnalysis.js';
import type PointCloudLayer from '@arcgis/core/layers/PointCloudLayer.js';
import type Polyline from '@arcgis/core/geometry/Polyline.js';
import Graphic from '@arcgis/core/Graphic.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Point from '@arcgis/core/geometry/Point.js';
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D.js';
import IconSymbol3DLayer from '@arcgis/core/symbols/IconSymbol3DLayer.js';
import LineSymbol3D from '@arcgis/core/symbols/LineSymbol3D.js';
import LineSymbol3DLayer from '@arcgis/core/symbols/LineSymbol3DLayer.js';
import { ProfileChart, type VerticalExaggeration } from './profile/ProfileChart';
import {
  sampleSlabAlongPolyline,
  DEFAULT_SLAB_M,
  type ScatterPoint,
} from './profile/profile-sampling';

type Props = {
  /** Reserved for hover-sync (chart ↔ 3D) in a follow-up commit. */
  view: SceneView;
  analysis: ElevationProfileAnalysis;
  onClose: () => void;
};

function collectPointCloudLayers(view: SceneView): PointCloudLayer[] {
  const result: PointCloudLayer[] = [];
  view.map?.allLayers.forEach((layer) => {
    if (layer.type === 'point-cloud') result.push(layer as PointCloudLayer);
  });
  return result;
}

function hoverMarkerSymbol() {
  return new PointSymbol3D({
    symbolLayers: [
      new IconSymbol3DLayer({
        size: 14,
        resource: { primitive: 'circle' },
        material: { color: [255, 220, 0, 0.85] },
        outline: { color: [255, 140, 0, 1], size: 2.5 },
      }),
    ],
  });
}

function profileLineSymbol() {
  return new LineSymbol3D({
    symbolLayers: [
      new LineSymbol3DLayer({
        size: 2.5,
        material: { color: [28, 181, 168, 1] },
      }),
    ],
  });
}

/**
 * Walks the polyline accumulating distance and interpolates a world point
 * at the given distance `d` from the start. Returns null if d is outside
 * the polyline's length or the polyline is empty.
 */
function worldPointAtDistance(
  polyline: Polyline,
  d: number,
): { x: number; y: number; z: number } | null {
  let cumulative = 0;
  for (const path of polyline.paths) {
    let last: number[] | null = null;
    for (const v of path) {
      if (last) {
        const dx = (v[0] ?? 0) - (last[0] ?? 0);
        const dy = (v[1] ?? 0) - (last[1] ?? 0);
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (cumulative + segLen >= d) {
          const t = segLen > 0 ? (d - cumulative) / segLen : 0;
          return {
            x: (last[0] ?? 0) + dx * t,
            y: (last[1] ?? 0) + dy * t,
            z: (last[2] ?? 0) + (((v[2] ?? 0) - (last[2] ?? 0)) * t),
          };
        }
        cumulative += segLen;
      }
      last = v;
    }
  }
  return null;
}

/**
 * Returns the compass azimuth (degrees, 0=N, 90=E) of the polyline segment
 * containing distance `d`. Used to point the camera perpendicular to the
 * line so click-to-fly lands on a useful cross-section view.
 */
function azimuthAtDistance(polyline: Polyline, d: number): number {
  let cumulative = 0;
  for (const path of polyline.paths) {
    let last: number[] | null = null;
    for (const v of path) {
      if (last) {
        const dx = (v[0] ?? 0) - (last[0] ?? 0);
        const dy = (v[1] ?? 0) - (last[1] ?? 0);
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (cumulative + segLen >= d) {
          return (Math.atan2(dx, dy) * 180) / Math.PI;
        }
        cumulative += segLen;
      }
      last = v;
    }
  }
  return 0;
}

type ProfileStats = {
  length: number;
  zMin: number;
  zMax: number;
  dMin: number; // distance where zMin lives
  dMax: number; // distance where zMax lives
  steepestD: number;
  steepestPercent: number;
};

function computeStats(polyline: Polyline | null): ProfileStats | null {
  if (!polyline) return null;
  let length = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  let dMin = 0;
  let dMaxAt = 0;
  let steepestD = 0;
  let steepest = 0;
  let cumulative = 0;
  let last: number[] | null = null;
  for (const path of polyline.paths) {
    for (const v of path) {
      const x = v[0];
      const y = v[1];
      const z = v[2] ?? 0;
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      if (last) {
        const dx = x - (last[0] ?? 0);
        const dy = y - (last[1] ?? 0);
        const segLen = Math.sqrt(dx * dx + dy * dy);
        const dz = Math.abs(z - (last[2] ?? 0));
        if (segLen > 0) {
          const slope = dz / segLen;
          if (slope > steepest) {
            steepest = slope;
            steepestD = cumulative + segLen / 2;
          }
        }
        cumulative += segLen;
      }
      if (z < zMin) {
        zMin = z;
        dMin = cumulative;
      }
      if (z > zMax) {
        zMax = z;
        dMaxAt = cumulative;
      }
      last = [x, y, z];
    }
  }
  length = cumulative;
  if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) return null;
  return {
    length,
    zMin,
    zMax,
    dMin,
    dMax: dMaxAt,
    steepestD,
    steepestPercent: steepest * 100,
  };
}

/**
 * Bottom-left panel housing our own ProfileChart. The widget mount has
 * been replaced — we read analysis.geometry directly and feed the
 * polyline + a slab-sampled scatter of point-cloud splats to the chart.
 */
export function ElevationProfilePanel({ view, analysis, onClose }: Props) {
  const [polyline, setPolyline] = useState<Polyline | null>(
    () => analysis.geometry ?? null,
  );
  const [scatter, setScatter] = useState<ScatterPoint[]>([]);
  const [scatterLoading, setScatterLoading] = useState(false);
  const [exaggeration, setExaggeration] = useState<VerticalExaggeration>('auto');

  // 3D hover marker — a GraphicsLayer that holds a single yellow ring
  // moved to the world point corresponding to the chart cursor.
  const hoverLayerRef = useRef<GraphicsLayer | null>(null);
  const hoverGraphicRef = useRef<Graphic | null>(null);

  useEffect(() => {
    const map = view.map;
    if (!map) return;
    const layer = new GraphicsLayer({ listMode: 'hide' });
    map.add(layer);
    hoverLayerRef.current = layer;
    return () => {
      map.remove(layer);
      layer.destroy();
      hoverLayerRef.current = null;
      hoverGraphicRef.current = null;
    };
  }, [view]);

  // Stable 3D rendering of the drawn polyline. The analysis itself ships
  // with no profile-lines (see buildProfileAnalysis), so Esri draws
  // nothing for it — this GraphicsLayer is the entire 3D rendering of
  // the profile.
  const lineLayerRef = useRef<GraphicsLayer | null>(null);
  const lineGraphicRef = useRef<Graphic | null>(null);

  useEffect(() => {
    const map = view.map;
    if (!map) return;
    const layer = new GraphicsLayer({ listMode: 'hide' });
    map.add(layer);
    lineLayerRef.current = layer;
    return () => {
      map.remove(layer);
      layer.destroy();
      lineLayerRef.current = null;
      lineGraphicRef.current = null;
    };
  }, [view]);

  useEffect(() => {
    const layer = lineLayerRef.current;
    if (!layer) return;
    if (!polyline) {
      if (lineGraphicRef.current) {
        layer.remove(lineGraphicRef.current);
        lineGraphicRef.current = null;
      }
      return;
    }
    if (!lineGraphicRef.current) {
      lineGraphicRef.current = new Graphic({
        geometry: polyline,
        symbol: profileLineSymbol(),
      });
      layer.add(lineGraphicRef.current);
    } else {
      lineGraphicRef.current.geometry = polyline;
    }
  }, [polyline]);

  useEffect(() => {
    setPolyline(analysis.geometry ?? null);
    const handle = analysis.watch('geometry', (geom: Polyline | null | undefined) => {
      setPolyline(geom ?? null);
    });
    return () => handle.remove();
  }, [analysis]);

  // Re-sample the slab whenever the polyline changes. Aborts in-flight
  // queries if the polyline updates before they complete.
  useEffect(() => {
    if (!polyline) {
      setScatter([]);
      return;
    }
    const pcLayers = collectPointCloudLayers(view);
    if (pcLayers.length === 0) {
      setScatter([]);
      return;
    }
    const controller = new AbortController();
    setScatterLoading(true);
    void sampleSlabAlongPolyline(view, polyline, pcLayers, {
      signal: controller.signal,
    })
      .then((points) => {
        if (controller.signal.aborted) return;
        setScatter(points);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setScatter([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setScatterLoading(false);
      });
    return () => controller.abort();
  }, [view, polyline]);

  const stats = useMemo(() => computeStats(polyline), [polyline]);

  const flyToDistance = useCallback(
    (d: number) => {
      if (!polyline) return;
      const pos = worldPointAtDistance(polyline, d);
      if (!pos) return;
      const azimuth = azimuthAtDistance(polyline, d);
      const target = new Point({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        hasZ: true,
        spatialReference: polyline.spatialReference,
      });
      // Heading perpendicular to the segment so we see the cross-section
      // dead-on. Scale picks a comfortable close-up.
      view
        .goTo(
          { target, tilt: 65, heading: azimuth + 90, scale: 500 },
          { duration: 800 },
        )
        .catch(() => {
          // user-cancellable; ignore
        });
    },
    [polyline, view],
  );

  const handleHover = useCallback(
    (d: number | null) => {
      const layer = hoverLayerRef.current;
      if (!layer || !polyline) return;
      if (d === null) {
        if (hoverGraphicRef.current) {
          layer.remove(hoverGraphicRef.current);
          hoverGraphicRef.current = null;
        }
        return;
      }
      const pos = worldPointAtDistance(polyline, d);
      if (!pos) return;
      const point = new Point({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        hasZ: true,
        spatialReference: polyline.spatialReference,
      });
      if (!hoverGraphicRef.current) {
        hoverGraphicRef.current = new Graphic({
          geometry: point,
          symbol: hoverMarkerSymbol(),
        });
        layer.add(hoverGraphicRef.current);
      } else {
        hoverGraphicRef.current.geometry = point;
      }
    },
    [polyline],
  );

  return (
    <section
      className="absolute left-3 right-[19.5rem] bottom-3 z-10 h-72 rounded-lg bg-white shadow-md border border-line flex flex-col overflow-hidden"
      aria-label="Høydeprofil"
    >
      <header className="px-3 py-2 border-b border-line flex items-center justify-between flex-none gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-semibold">Høydeprofil</span>
          {scatterLoading && (
            <span className="text-xs text-ink/50">sampler punktsky…</span>
          )}
          {!scatterLoading && scatter.length > 0 && (
            <span className="text-xs text-ink/50">
              {scatter.length.toLocaleString('no-NO')} punkter i ±{DEFAULT_SLAB_M.toFixed(1)}m-slab
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-none">
          <label className="flex items-center gap-1 text-xs text-ink/60">
            Vertikal
            <select
              value={String(exaggeration)}
              onChange={(e) => {
                const v = e.target.value;
                setExaggeration(
                  v === 'auto' ? 'auto' : (Number(v) as Exclude<VerticalExaggeration, 'auto'>),
                );
              }}
              className="rounded border border-line bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="auto">Auto</option>
              <option value="1">1:1</option>
              <option value="2">2×</option>
              <option value="5">5×</option>
              <option value="10">10×</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk høydeprofil"
            className="text-ink/70 hover:text-ink text-sm"
          >
            ✕
          </button>
        </div>
      </header>
      {stats && (
        <div className="px-3 py-1.5 border-b border-line text-[11px] text-ink/70 flex items-center gap-3 flex-wrap">
          <span>
            Lengde <strong className="text-ink">{stats.length.toFixed(1)} m</strong>
          </span>
          <span>
            Δh{' '}
            <strong className="text-ink">{(stats.zMax - stats.zMin).toFixed(1)} m</strong>
          </span>
          <button
            type="button"
            onClick={() => flyToDistance(stats.dMin)}
            className="rounded px-1.5 py-0.5 hover:bg-soft text-ink"
            title="Fly til laveste punkt"
          >
            ↓ Lavest <span className="text-ink/60">{stats.zMin.toFixed(1)} m</span>
          </button>
          <button
            type="button"
            onClick={() => flyToDistance(stats.dMax)}
            className="rounded px-1.5 py-0.5 hover:bg-soft text-ink"
            title="Fly til høyeste punkt"
          >
            ↑ Høyest <span className="text-ink/60">{stats.zMax.toFixed(1)} m</span>
          </button>
          <button
            type="button"
            onClick={() => flyToDistance(stats.steepestD)}
            className="rounded px-1.5 py-0.5 hover:bg-soft text-ink"
            title="Fly til bratteste segment"
          >
            ↗ Brattest{' '}
            <span className="text-ink/60">{stats.steepestPercent.toFixed(0)}%</span>
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ProfileChart
          polyline={polyline}
          scatter={scatter}
          verticalExaggeration={exaggeration}
          onHover={handleHover}
          onClick={flyToDistance}
        />
      </div>
    </section>
  );
}
