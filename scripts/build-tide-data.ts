/**
 * Build the tidal-current and wind data for the twin (run manually, not at app runtime):
 *
 *   npm run build:tide            # uses the cached downloads in .cache/tide
 *   npm run build:tide -- --refresh
 *
 * Sources:
 *   - Copernicus Marine global ocean currents (SMOC: total surface current including tides)
 *     through the Open-Meteo Marine API, hourly 2022–2025, at the model cell nearest the
 *     reference site. Both components are projected onto the site frame (along-shore +x,
 *     offshore +z), a tidal harmonic fit (11 constituents) is made over the four years, and the
 *     bloom-season window (Oct–Nov 2025) is written as the fitted tide plus the 25 h low-passed
 *     residual: the record's tide and its slow drift, without the 0.03 m/s quantisation of the
 *     published values.
 *   - ERA5 10 m wind through the Open-Meteo archive API, hourly, same window, for windage in the
 *     released-animal drift model.
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
const USER_AGENT = 'SweepLine-tide-build/1.0 (one-off build-time data preparation)';

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

interface WindResponse {
  latitude: number;
  longitude: number;
  hourly: { time: string[]; wind_speed_10m: Array<number | null>; wind_direction_10m: Array<number | null> };
}

async function cached<T>(name: string, url: string): Promise<T> {
  mkdirSync(CACHE, { recursive: true });
  const file = resolve(CACHE, name);
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  console.log(`  ↓ ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
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
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Harmonic fit of one current component (t in hours since the first sample): the fitted tide plus
 * the 25 h centred moving average of the residual, and the variance each explains.
 */
function fitComponent(x: Float64Array) {
  const n = x.length;
  const m = 1 + 2 * CONSTITUENTS.length;
  const AtA = new Float64Array(m * m);
  const Atx = new Float64Array(m);
  const row = new Float64Array(m);
  let samples = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(x[i])) continue;
    basis(i, row);
    for (let r = 0; r < m; r++) {
      Atx[r] += row[r] * x[i];
      for (let c = 0; c < m; c++) AtA[r * m + c] += row[r] * row[c];
    }
    samples++;
  }
  const coef = solve(AtA, Atx, m);
  const tide = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    basis(i, row);
    let s = 0;
    for (let r = 0; r < m; r++) s += row[r] * coef[r];
    tide[i] = s;
  }
  const low = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 12); j++) {
      if (Number.isNaN(x[j])) continue;
      s += x[j] - tide[j];
      k++;
    }
    low[i] = k > 0 ? s / k : 0;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) if (!Number.isNaN(x[i])) mean += x[i] / samples;
  let ssTot = 0;
  let ssTide = 0;
  let ssBoth = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(x[i])) continue;
    ssTot += (x[i] - mean) ** 2;
    ssTide += (x[i] - tide[i]) ** 2;
    ssBoth += (x[i] - tide[i] - low[i]) ** 2;
  }
  return {
    samples,
    mean,
    r2: 1 - ssTide / ssTot,
    r2WithResidual: 1 - ssBoth / ssTot,
    amps: CONSTITUENTS.map(([name], i) => ({ name, amp: round4(Math.hypot(coef[1 + 2 * i], coef[2 + 2 * i])) })),
    at: (i: number) => tide[i] + low[i],
  };
}

async function main(): Promise<void> {
  console.log('tidal current');
  const d = await cached<MarineResponse>(
    `smoc_${FIT_START}_${FIT_END}.json`,
    `https://marine-api.open-meteo.com/v1/marine?latitude=${SITE_LAT.toFixed(3)}&longitude=${SITE_LON.toFixed(3)}` +
      `&hourly=ocean_current_velocity,ocean_current_direction&start_date=${FIT_START}&end_date=${FIT_END}` +
      `&timezone=GMT&cell_selection=sea&wind_speed_unit=ms`,
  );
  const h = d.hourly;
  const n = h.time.length;
  // Site-frame components (Open-Meteo gives the direction the current flows toward; bearings turn
  // clockwise from +x toward +z, offshore).
  const u = new Float64Array(n).fill(NaN);
  const v = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const s = h.ocean_current_velocity[i];
    const dir = h.ocean_current_direction[i];
    if (s === null || dir === null) continue;
    u[i] = s * Math.cos((dir - BEARING_X) * DEG);
    v[i] = s * Math.sin((dir - BEARING_X) * DEG);
  }
  const fu = fitComponent(u);
  const fv = fitComponent(v);

  // Bloom-season window.
  const i0 = h.time.indexOf(WINDOW_START);
  const i1 = h.time.indexOf(WINDOW_END);
  if (i0 < 0 || i1 < 0) throw new Error('Window not in the record');
  const series: number[] = [];
  const offshore: number[] = [];
  for (let i = i0; i <= i1; i++) {
    series.push(round4(fu.at(i)));
    offshore.push(round4(fv.at(i)));
  }
  let reversals = 0;
  for (let i = 1; i < series.length; i++) if (Math.sign(series[i]) !== Math.sign(series[i - 1]) && series[i] !== 0) reversals++;

  // Reference turn: a clear spring-tide reversal from +x to −x that holds for at least four hours.
  let referenceTurn = -1;
  for (let i = 7 * 24; i < series.length - 6; i++) {
    if (!(series[i - 1] > 0 && series[i] <= 0)) continue;
    const before = Math.max(...series.slice(i - 5, i));
    const after = series.slice(i, i + 5);
    if (before >= 0.09 && Math.min(...after) <= -0.1 && after.slice(1).every((x) => x < 0)) {
      referenceTurn = i - 1 + series[i - 1] / (series[i - 1] - series[i]);
      break;
    }
  }
  if (referenceTurn < 0) throw new Error('No reference turn found');

  console.log('wind');
  const w = await cached<WindResponse>(
    `era5_wind_${WINDOW_START.slice(0, 10)}_${WINDOW_END.slice(0, 10)}.json`,
    `https://archive-api.open-meteo.com/v1/archive?latitude=${SITE_LAT.toFixed(3)}&longitude=${SITE_LON.toFixed(3)}` +
      `&hourly=wind_speed_10m,wind_direction_10m&start_date=${WINDOW_START.slice(0, 10)}&end_date=${WINDOW_END.slice(0, 10)}` +
      `&models=era5&timezone=GMT&wind_speed_unit=ms`,
  );
  if (w.hourly.time.length !== series.length) throw new Error('Wind window does not match the current window');
  const windX: number[] = [];
  const windZ: number[] = [];
  let lastX = 0;
  let lastZ = 0;
  for (let i = 0; i < w.hourly.time.length; i++) {
    const s = w.hourly.wind_speed_10m[i];
    const from = w.hourly.wind_direction_10m[i];
    if (s !== null && from !== null) {
      // Meteorological direction is where the wind comes from; it blows toward from + 180°.
      lastX = s * Math.cos((from + 180 - BEARING_X) * DEG);
      lastZ = s * Math.sin((from + 180 - BEARING_X) * DEG);
    }
    windX.push(Math.round(lastX * 100) / 100);
    windZ.push(Math.round(lastZ * 100) / 100);
  }
  const meanOf = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

  const data: TideData = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Copernicus Marine global ocean currents (SMOC, total surface current incl. tides) via the Open-Meteo Marine API',
    cell: { lat: d.latitude, lon: d.longitude, distanceKm: Math.round(haversineKm(SITE_LAT, SITE_LON, d.latitude, d.longitude) * 10) / 10 },
    bearingX: BEARING_X,
    start: `${WINDOW_START}Z`,
    stepHours: 1,
    u: series,
    v: offshore,
    fit: {
      period: `${FIT_START} to ${FIT_END}`,
      samples: fu.samples,
      r2: Math.round(fu.r2 * 1000) / 1000,
      r2WithResidual: Math.round(fu.r2WithResidual * 1000) / 1000,
      constituents: fu.amps,
      offshore: { r2: Math.round(fv.r2 * 1000) / 1000, r2WithResidual: Math.round(fv.r2WithResidual * 1000) / 1000, mean: round4(fv.mean) },
    },
    stats: {
      p5: quantile(series, 0.05),
      p50: quantile(series, 0.5),
      p95: quantile(series, 0.95),
      reversalsPerDay: Math.round((reversals / (series.length / 24)) * 10) / 10,
      offshoreMean: round4(meanOf(offshore)),
    },
    wind: {
      source: 'ERA5 10 m wind via the Open-Meteo archive API',
      x: windX,
      z: windZ,
      meanX: Math.round(meanOf(windX) * 100) / 100,
      meanZ: Math.round(meanOf(windZ) * 100) / 100,
    },
    referenceTurn: Math.round(referenceTurn * 1000) / 1000,
  };
  console.log(
    `  cell ${data.cell.lat}N ${data.cell.lon}E (${data.cell.distanceKm} km) · ${fu.samples} hours · along-shore tide R² ${data.fit.r2}, with residual ${data.fit.r2WithResidual}` +
      ` · M2 ${data.fit.constituents[0].amp} m/s · reversals ${data.stats.reversalsPerDay}/day · reference turn at +${data.referenceTurn} h`,
  );
  console.log(
    `  offshore component: tide R² ${data.fit.offshore.r2}, with residual ${data.fit.offshore.r2WithResidual}, record mean ${data.fit.offshore.mean} m/s, season mean ${data.stats.offshoreMean} m/s` +
      ` · wind season mean ${data.wind.meanX} m/s along-shore, ${data.wind.meanZ} m/s offshore`,
  );
  const arrays = { u: series, v: offshore };
  let json = JSON.stringify({ ...data, u: [], v: [], wind: { ...data.wind, x: [], z: [] } });
  json = json.replace('"u":[]', `"u":[${arrays.u.join(',')}]`).replace('"v":[]', `"v":[${arrays.v.join(',')}]`);
  json = json.replace('"x":[]', `"x":[${windX.join(',')}]`).replace('"z":[]', `"z":[${windZ.join(',')}]`);
  const body =
    `// Generated by scripts/build-tide-data.ts on ${data.generatedAt} — do not edit by hand.\n` +
    `// Sources: ${data.source}; ${data.wind.source}. Currents: fitted tide plus 25 h low-passed residual in the site frame.\n` +
    `import type { TideData } from './tideTypes';\n\n` +
    `export const TIDE_DATA: TideData = ${json};\n`;
  writeFileSync(OUT, body);
  console.log(`  wrote ${OUT} (${(body.length / 1024).toFixed(0)} KB)`);
}

await main();
