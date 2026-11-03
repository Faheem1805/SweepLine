/**
 * Build the tidal-current data for the twin (run manually, not at app runtime):
 *
 *   npm run build:tide            # uses the cached download in .cache/tide
 *   npm run build:tide -- --refresh
 *
 * Source: Copernicus Marine global ocean currents (SMOC: total surface current
 * including tides) through the Open-Meteo Marine API, hourly 2022–2025, at the
 * model cell nearest the reference site. The current is projected onto the
 * site's along-shore axis, a tidal harmonic fit (11 constituents) is made over
 * the four years, and the bloom-season window (Oct–Nov 2025) is written as the
 * fitted tide plus the 25 h low-passed residual: the record's tide and its slow
 * drift, without the 0.03 m/s quantisation of the published values.
 *
 * Output: src/data/tide.generated.ts. Nothing here is fetched by the app.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP_INTRO_DATA } from '../src/data/mapIntro.generated';
import type { TideData } from '../src/data/tideTypes';

const REFRESH = process.argv.includes('--refresh');
const CACHE = resolve(process.cwd(), '.cache/tide');
const OUT = resolve(process.cwd(), 'src/data/tide.generated.ts');

/** Reference site (the map intro's site origin) and the bearing of its +x axis. */
const SITE_LAT = MAP_INTRO_DATA.projection.lat0;
const SITE_LON = MAP_INTRO_DATA.projection.lon0;
const BEARING_X = MAP_INTRO_DATA.site.bearingX;

const FIT_START = '2022-01-01';
const FIT_END = '2025-12-31';
const WINDOW_START = '2025-10-01T00:00';
const WINDOW_END = '2025-11-30T23:00';

/** Tidal constituents and their speeds (degrees per hour). */
const CONSTITUENTS: Array<[string, number]> = [
  ['M2', 28.9841042],
  ['S2', 30.0],
  ['N2', 28.4397295],
  ['K2', 30.0821373],
  ['K1', 15.0410686],
  ['O1', 13.9430356],
  ['P1', 14.9589314],
  ['Q1', 13.3986609],
  ['M4', 57.9682084],
  ['MS4', 58.9841042],
  ['M6', 86.9523127],
];

interface MarineResponse {
  latitude: number;
  longitude: number;
  hourly: { time: string[]; ocean_current_velocity: Array<number | null>; ocean_current_direction: Array<number | null> };
}

async function download(): Promise<MarineResponse> {
  mkdirSync(CACHE, { recursive: true });
  const file = resolve(CACHE, `smoc_${FIT_START}_${FIT_END}.json`);
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${SITE_LAT.toFixed(3)}&longitude=${SITE_LON.toFixed(3)}` +
    `&hourly=ocean_current_velocity,ocean_current_direction&start_date=${FIT_START}&end_date=${FIT_END}` +
    `&timezone=GMT&cell_selection=sea&wind_speed_unit=ms`;
  console.log(`  ↓ ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'SweepLine-tide-build/1.0 (one-off build-time data preparation)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  writeFileSync(file, body);
  return JSON.parse(body);
}

/** Solve A x = b (n × n, row-major) by Gaussian elimination with partial pivoting. */
function solve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[piv * n + c])) piv = r;
    if (piv !== c) {
      for (let k = 0; k < n; k++) [A[c * n + k], A[piv * n + k]] = [A[piv * n + k], A[c * n + k]];
      [b[c], b[piv]] = [b[piv], b[c]];
    }
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / A[c * n + c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    x[r] = s / A[r * n + r];
  }
  return x;
}

const DEG = Math.PI / 180;
const basis = (t: number, out: Float64Array) => {
  out[0] = 1;
  CONSTITUENTS.forEach(([, w], i) => {
    out[1 + 2 * i] = Math.cos(w * t * DEG);
    out[2 + 2 * i] = Math.sin(w * t * DEG);
  });
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(((lat2 - lat1) * DEG) / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(((lon2 - lon1) * DEG) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(a));
}

const quantile = (v: number[], q: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

async function main(): Promise<void> {
  console.log('tidal current');
  const d = await download();
  const h = d.hourly;
  const n = h.time.length;
  // Along-shore component toward +x (Open-Meteo gives the direction the current flows toward).
  const u = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const v = h.ocean_current_velocity[i];
    const dir = h.ocean_current_direction[i];
    if (v !== null && dir !== null) u[i] = v * Math.cos((dir - BEARING_X) * DEG);
  }

  // Least-squares harmonic fit (normal equations), t in hours since the first sample.
  const m = 1 + 2 * CONSTITUENTS.length;
  const AtA = new Float64Array(m * m);
  const Aty = new Float64Array(m);
  const row = new Float64Array(m);
  let samples = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(u[i])) continue;
    basis(i, row);
    for (let r = 0; r < m; r++) {
      Aty[r] += row[r] * u[i];
      for (let c = 0; c < m; c++) AtA[r * m + c] += row[r] * row[c];
    }
    samples++;
  }
  const coef = solve(AtA, Aty, m);
  const tide = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    basis(i, row);
    let s = 0;
    for (let r = 0; r < m; r++) s += row[r] * coef[r];
    tide[i] = s;
  }
  // 25 h centred moving average of the residual: the sub-tidal drift.
  const low = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 12); j++) {
      if (Number.isNaN(u[j])) continue;
      s += u[j] - tide[j];
      k++;
    }
    low[i] = k > 0 ? s / k : 0;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) if (!Number.isNaN(u[i])) mean += u[i] / samples;
  let ssTot = 0;
  let ssTide = 0;
  let ssBoth = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(u[i])) continue;
    ssTot += (u[i] - mean) ** 2;
    ssTide += (u[i] - tide[i]) ** 2;
    ssBoth += (u[i] - tide[i] - low[i]) ** 2;
  }
  const r2 = 1 - ssTide / ssTot;
  const r2WithResidual = 1 - ssBoth / ssTot;

  // Bloom-season window.
  const i0 = h.time.indexOf(WINDOW_START);
  const i1 = h.time.indexOf(WINDOW_END);
  if (i0 < 0 || i1 < 0) throw new Error('Window not in the record');
  const series: number[] = [];
  for (let i = i0; i <= i1; i++) series.push(Math.round((tide[i] + low[i]) * 10000) / 10000);
  let reversals = 0;
  for (let i = 1; i < series.length; i++) if (Math.sign(series[i]) !== Math.sign(series[i - 1]) && series[i] !== 0) reversals++;

  // Reference turn: a clear spring-tide reversal from +x to −x that holds for at least four hours.
  let referenceTurn = -1;
  for (let i = 7 * 24; i < series.length - 6; i++) {
    if (!(series[i - 1] > 0 && series[i] <= 0)) continue;
    const before = Math.max(...series.slice(i - 5, i));
    const after = series.slice(i, i + 5);
    if (before >= 0.09 && Math.min(...after) <= -0.1 && after.slice(1).every((v) => v < 0)) {
      referenceTurn = i - 1 + series[i - 1] / (series[i - 1] - series[i]);
      break;
    }
  }
  if (referenceTurn < 0) throw new Error('No reference turn found');

  const data: TideData = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Copernicus Marine global ocean currents (SMOC, total surface current incl. tides) via the Open-Meteo Marine API',
    cell: { lat: d.latitude, lon: d.longitude, distanceKm: Math.round(haversineKm(SITE_LAT, SITE_LON, d.latitude, d.longitude) * 10) / 10 },
    bearingX: BEARING_X,
    start: `${WINDOW_START}Z`,
    stepHours: 1,
    u: series,
    fit: {
      period: `${FIT_START} to ${FIT_END}`,
      samples,
      r2: Math.round(r2 * 1000) / 1000,
      r2WithResidual: Math.round(r2WithResidual * 1000) / 1000,
      constituents: CONSTITUENTS.map(([name], i) => ({ name, amp: Math.round(Math.hypot(coef[1 + 2 * i], coef[2 + 2 * i]) * 10000) / 10000 })),
    },
    stats: {
      p5: quantile(series, 0.05),
      p50: quantile(series, 0.5),
      p95: quantile(series, 0.95),
      reversalsPerDay: Math.round((reversals / (series.length / 24)) * 10) / 10,
    },
    referenceTurn: Math.round(referenceTurn * 1000) / 1000,
  };
  console.log(
    `  cell ${data.cell.lat}N ${data.cell.lon}E (${data.cell.distanceKm} km) · ${samples} hours · tide R² ${data.fit.r2}, with residual ${data.fit.r2WithResidual}` +
      ` · M2 ${data.fit.constituents[0].amp} m/s · reversals ${data.stats.reversalsPerDay}/day · reference turn at +${data.referenceTurn} h`,
  );
  const body =
    `// Generated by scripts/build-tide-data.ts on ${data.generatedAt} — do not edit by hand.\n` +
    `// Source: ${data.source}. Fitted tide plus 25 h low-passed residual, along-shore component toward the site's +x axis.\n` +
    `import type { TideData } from './tideTypes';\n\n` +
    `export const TIDE_DATA: TideData = ${JSON.stringify({ ...data, u: [] }).replace('"u":[]', `"u":[${series.join(',')}]`)};\n`;
  writeFileSync(OUT, body);
  console.log(`  wrote ${OUT} (${(body.length / 1024).toFixed(0)} KB)`);
}

await main();
