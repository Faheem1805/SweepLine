import { ASSUMPTIONS } from '../config/assumptions';
import { SITE } from '../config/site';
import { MAP_INTRO_DATA } from '../data/mapIntro.generated';
import { TIDE_DATA } from '../data/tide.generated';
import { SeededRandom } from './seededRandom';

/**
 * Far-field drift of released jellyfish, followed for days after they leave the outlet.
 *
 * The twin itself follows a released animal for under a minute; whether it comes back is decided
 * over days and kilometres. Here each animal drifts with the recorded current at the site (both
 * components of the Copernicus record, fitted tide plus slow residual), a share of the recorded
 * ERA5 wind (windage) and turbulent spreading (a random walk), against the real coastline from the
 * map intro's OpenStreetMap data. The current is taken as uniform over the area, and near land its
 * onshore part fades out so it runs along the shore. An animal is:
 *   - back at the site once it re-enters the intake's approach band (after a grace period),
 *   - stranded once it reaches land,
 *   - carried away once it leaves the mapped area.
 * Kinematic drift model, not a hydrodynamic model: a first estimate to be checked with drifters.
 */

const D = ASSUMPTIONS.drift;

/** Land mask in the site frame (x along-shore, z offshore), with each cell's distance to land. */
export interface LandMask {
  x0: number;
  z0: number;
  cell: number;
  cols: number;
  rows: number;
  /** 0 sea, 1 land, 2 outside the mapped area. */
  kind: Uint8Array;
  /** Distance to the nearest land cell (m). */
  dist: Float32Array;
}

/** Decode the map intro's local-level land paths into rings in site metres. */
export function landRings(): Array<Array<[number, number]>> {
  const L = MAP_INTRO_DATA.levels.local;
  const B = (MAP_INTRO_DATA.site.bearingX * Math.PI) / 180;
  const tx = Math.sin(B);
  const ty = Math.cos(B);
  // Map km (east, north) to site metres: +x along the shore, +z offshore.
  const toSite = (east: number, north: number): [number, number] => [(east * tx + north * ty) * 1000, (east * ty - north * tx) * 1000];
  const tokens = L.land.match(/[Mlz]|-?\d+(?:\.\d+)?/g) ?? [];
  const rings: Array<Array<[number, number]>> = [];
  let ring: Array<[number, number]> = [];
  let X = 0;
  let Y = 0;
  let cmd = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'M' || t === 'l' || t === 'z') {
      cmd = t;
      if (t === 'z' && ring.length > 2) {
        rings.push(ring);
        ring = [];
      }
      continue;
    }
    const a = Number(t);
    const b = Number(tokens[++i]);
    if (cmd === 'M') {
      if (ring.length > 2) rings.push(ring);
      ring = [];
      X = a;
      Y = b;
      cmd = 'l';
    } else {
      X += a;
      Y += b;
    }
    // SVG y points south; the path is in multiples of the level unit (km).
    ring.push(toSite(X * L.unit, -Y * L.unit));
  }
  if (ring.length > 2) rings.push(ring);
  return rings;
}

/** Rasterise the coastline (even-odd scanline fill) and compute each sea cell's distance to land. */
export function buildLandMask(extent = { x0: -16000, x1: 16000, z0: -6000, z1: 20000 }, cell = 25): LandMask {
  const cols = Math.ceil((extent.x1 - extent.x0) / cell);
  const rows = Math.ceil((extent.z1 - extent.z0) / cell);
  const kind = new Uint8Array(cols * rows);
  const rings = landRings();
  const xs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const z = extent.z0 + (r + 0.5) * cell;
    xs.length = 0;
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k++) {
        const [ax, az] = ring[k];
        const [bx, bz] = ring[(k + 1) % ring.length];
        if (az <= z === bz <= z) continue;
        xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - extent.x0) / cell - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - extent.x0) / cell - 0.5));
      for (let c = c0; c <= c1; c++) kind[r * cols + c] = 1;
    }
  }
  // Outside the mapped area (the local level's rectangle in map km) is not known: drifting there counts as carried away.
  const R = MAP_INTRO_DATA.levels.local.rect;
  const B = (MAP_INTRO_DATA.site.bearingX * Math.PI) / 180;
  const tx = Math.sin(B);
  const ty = Math.cos(B);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (extent.x0 + (c + 0.5) * cell) / 1000;
      const z = (extent.z0 + (r + 0.5) * cell) / 1000;
      // Inverse of the site transform: east = x tx + z ty, north = x ty − z tx.
      const east = x * tx + z * ty;
      const north = x * ty - z * tx;
      if (east < R.x0 || east > R.x1 || north < R.y0 || north > R.y1) kind[r * cols + c] = 2;
    }
  }
  // Two-pass chamfer distance transform (metres) to the nearest land cell.
  const INF = 1e9;
  const dist = new Float32Array(cols * rows);
  for (let i = 0; i < dist.length; i++) dist[i] = kind[i] === 1 ? 0 : INF;
  const a = cell;
  const b = cell * Math.SQRT2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let d = dist[i];
      if (c > 0) d = Math.min(d, dist[i - 1] + a);
      if (r > 0) {
        d = Math.min(d, dist[i - cols] + a);
        if (c > 0) d = Math.min(d, dist[i - cols - 1] + b);
        if (c < cols - 1) d = Math.min(d, dist[i - cols + 1] + b);
      }
      dist[i] = d;
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      let d = dist[i];
      if (c < cols - 1) d = Math.min(d, dist[i + 1] + a);
      if (r < rows - 1) {
        d = Math.min(d, dist[i + cols] + a);
        if (c < cols - 1) d = Math.min(d, dist[i + cols + 1] + b);
        if (c > 0) d = Math.min(d, dist[i + cols - 1] + b);
      }
      dist[i] = d;
    }
  }
  return { x0: extent.x0, z0: extent.z0, cell, cols, rows, kind, dist };
}

/** A release policy: where an animal leaves the pipe, given the along-shore current at that moment. */
export interface ReleasePolicy {
  id: string;
  label: string;
  /** Release point (site metres) for a current u toward +x (m/s); `rand` draws uniform 0..1 for spread-out starts. */
  point: (u: number, rand: () => number) => { x: number; z: number };
}

export interface DriftOutcome {
  id: string;
  label: string;
  released: number;
  /** Shares of the released animals (0..1). */
  backAtSite: number;
  stranded: number;
  carriedAway: number;
  atSea: number;
  /** Share back at the site within 1 and 3 days. */
  backWithin1d: number;
  backWithin3d: number;
  /** Median time to return, for those that come back (h). */
  medianReturnH: number | null;
}

const HOUR = 3600;
const lerpSeries = (s: number[], h: number) => {
  const i = Math.min(Math.max(Math.floor(h), 0), s.length - 2);
  const t = Math.min(Math.max(h - i, 0), 1);
  return s[i] + (s[i + 1] - s[i]) * t;
};

/**
 * Release `perRelease` animals every `everyH` hours across the recorded season (stopping
 * `horizon` before its end) under `policy`, and follow each for the drift horizon.
 * Optionally record `tracks` sample tracks (one point per hour).
 */
export function runDrift(
  policy: ReleasePolicy,
  mask: LandMask,
  opts: { perRelease?: number; everyH?: number; seed?: number; windage?: number; diffusivity?: number; tracks?: number } = {},
): { outcome: DriftOutcome; tracks: Array<Array<[number, number]>> } {
  const perRelease = opts.perRelease ?? 20;
  const everyH = opts.everyH ?? 1;
  const windage = opts.windage ?? D.windage;
  const K = opts.diffusivity ?? D.diffusivity;
  const rng = new SeededRandom(opts.seed ?? 7);
  const T = TIDE_DATA;
  const dt = D.step;
  const steps = Math.round(D.horizon / dt);
  const lastStart = T.u.length - 1 - D.horizon / HOUR;
  const sigma = Math.sqrt(2 * K * dt);
  const xc = (SITE.intake.x0 + SITE.intake.x1) / 2;
  const { x0, z0, cell, cols, rows, kind, dist } = mask;
  const at = (x: number, z: number) => {
    const c = Math.floor((x - x0) / cell);
    const r = Math.floor((z - z0) / cell);
    return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
  };
  let released = 0;
  let back = 0;
  let back1 = 0;
  let back3 = 0;
  let stranded = 0;
  let away = 0;
  const returnTimes: number[] = [];
  const tracks: Array<Array<[number, number]>> = [];
  const wantTracks = opts.tracks ?? 0;
  const trackEvery = Math.max(1, Math.floor(lastStart / everyH / Math.max(1, wantTracks)));
  let releaseIndex = 0;
  for (let h0 = 0; h0 <= lastStart; h0 += everyH, releaseIndex++) {
    const u0 = lerpSeries(T.u, h0);
    const rand = () => rng.next();
    for (let n = 0; n < perRelease; n++) {
      released++;
      // A start on land (spread-out starts near the shore) is drawn again.
      let p0 = policy.point(u0, rand);
      for (let k = 0; k < 20; k++) {
        const j = at(p0.x, p0.z);
        if (j >= 0 && kind[j] === 0) break;
        p0 = policy.point(u0, rand);
      }
      let x = p0.x + (rng.next() - 0.5) * 6;
      let z = p0.z + (rng.next() - 0.5) * 6;
      const track: Array<[number, number]> | null = n === 0 && tracks.length < wantTracks && releaseIndex % trackEvery === 0 ? [[x, z]] : null;
      let fate = 0;
      for (let s = 1; s <= steps; s++) {
        const age = s * dt;
        const h = h0 + age / HOUR;
        let ux = lerpSeries(T.u, h);
        let uz = lerpSeries(T.v, h);
        const i = at(x, z);
        if (i >= 0 && dist[i] < D.coastDamping) {
          // Near land the current runs along the shore: fade its component toward land.
          const gx = (dist[Math.min(i + 1, dist.length - 1)] - dist[Math.max(i - 1, 0)]) / (2 * cell);
          const gz = (dist[Math.min(i + cols, dist.length - 1)] - dist[Math.max(i - cols, 0)]) / (2 * cell);
          const g = Math.hypot(gx, gz) || 1;
          const toLand = -(ux * gx + uz * gz) / g;
          if (toLand > 0) {
            const k = 1 - dist[i] / D.coastDamping;
            ux += (gx / g) * toLand * k;
            uz += (gz / g) * toLand * k;
          }
        }
        x += (ux + windage * lerpSeries(T.wind.x, h)) * dt + sigma * rng.normal();
        z += (uz + windage * lerpSeries(T.wind.z, h)) * dt + sigma * rng.normal();
        if (track && s % (HOUR / dt) === 0) track.push([x, z]);
        const j = at(x, z);
        if (j < 0 || kind[j] === 2) {
          fate = 3;
          break;
        }
        if (kind[j] === 1) {
          fate = 2;
          break;
        }
        if (age >= D.returnGrace && Math.abs(x - xc) <= D.returnHalfWidth && z <= D.returnMaxZ) {
          fate = 1;
          returnTimes.push(age / HOUR);
          if (age <= 86400) back1++;
          if (age <= 3 * 86400) back3++;
          break;
        }
      }
      if (fate === 1) back++;
      else if (fate === 2) stranded++;
      else if (fate === 3) away++;
      if (track) tracks.push(track);
    }
  }
  returnTimes.sort((a, b) => a - b);
  const share = (v: number) => v / released;
  return {
    outcome: {
      id: policy.id,
      label: policy.label,
      released,
      backAtSite: share(back),
      stranded: share(stranded),
      carriedAway: share(away),
      atSea: share(released - back - stranded - away),
      backWithin1d: share(back1),
      backWithin3d: share(back3),
      medianReturnH: returnTimes.length ? returnTimes[Math.floor(returnTimes.length / 2)] : null,
    },
    tracks,
  };
}
