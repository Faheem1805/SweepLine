/**
 * Could SweepLine have been deployed when a bloom came? Checks every hour of four recorded bloom
 * seasons (Oct–Nov 2022–2025) against the operating envelope's environmental hard limits: wave
 * height (Copernicus/ECMWF wave model) and current speed (Copernicus SMOC), both through the
 * Open-Meteo Marine API at the model cell nearest the site. The whole 2022–2025 record is checked
 * too, for context. Current direction is not judged: the model cell lies offshore, while next to
 * the revetment the shore sets the direction (an ADCP on the curtain line settles it).
 *
 *   npm run study:hindcast              # uses the downloads cached in .cache/tide
 *   npm run study:hindcast -- --refresh
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATING_ENVELOPE } from '../src/config/operatingEnvelope';
import { MAP_INTRO_DATA } from '../src/data/mapIntro.generated';
import type { HindcastData, HindcastPeriod } from '../src/data/hindcastTypes';

const REFRESH = process.argv.includes('--refresh');
const CACHE = resolve(process.cwd(), '.cache/tide');
const OUT = resolve(process.cwd(), 'src/data/hindcast.generated.ts');
const USER_AGENT = 'SweepLine-hindcast-build/1.0 (one-off build-time data preparation)';
const LAT = MAP_INTRO_DATA.projection.lat0;
const LON = MAP_INTRO_DATA.projection.lon0;
const START = '2022-01-01';
const END = '2025-12-31';

interface Marine {
  latitude: number;
  longitude: number;
  hourly: { time: string[]; ocean_current_velocity?: Array<number | null>; wave_height?: Array<number | null> };
}

async function cached(name: string, hourly: string): Promise<Marine> {
  mkdirSync(CACHE, { recursive: true });
  const file = resolve(CACHE, name);
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT.toFixed(3)}&longitude=${LON.toFixed(3)}` +
    `&hourly=${hourly}&start_date=${START}&end_date=${END}&timezone=GMT&cell_selection=sea&wind_speed_unit=ms`;
  console.log(`  ↓ ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  writeFileSync(file, body);
  return JSON.parse(body);
}

// The current download is shared with npm run build:tide (same file name and request).
const cur = await cached(`smoc_${START}_${END}.json`, 'ocean_current_velocity,ocean_current_direction');
const wav = await cached(`waves_${START}_${END}.json`, 'wave_height');
const time = cur.hourly.time;
if (wav.hourly.time.length !== time.length || wav.hourly.time[0] !== time[0]) throw new Error('Wave and current records do not line up');

const E = OPERATING_ENVELOPE;
const limits = { wave: E.waveHeight.max, waveNear: E.waveHeight.near, current: E.currentSpeed.max, currentNear: E.currentSpeed.near };

function period(label: string, keep: (t: string) => boolean): HindcastPeriod {
  const p: HindcastPeriod = { label, hours: 0, maxWave: 0, maxCurrent: 0, overWave: 0, nearWave: 0, overCurrent: 0, nearCurrent: 0, longestStandDown: 0 };
  let run = 0;
  for (let i = 0; i < time.length; i++) {
    if (!keep(time[i])) continue;
    const h = wav.hourly.wave_height![i];
    const s = cur.hourly.ocean_current_velocity![i];
    if (h === null || s === null) continue;
    p.hours++;
    p.maxWave = Math.max(p.maxWave, h);
    p.maxCurrent = Math.max(p.maxCurrent, s);
    if (h > limits.wave) p.overWave++;
    else if (h > limits.waveNear) p.nearWave++;
    if (s > limits.current) p.overCurrent++;
    else if (s > limits.currentNear) p.nearCurrent++;
    run = h > limits.wave || s > limits.current ? run + 1 : 0;
    p.longestStandDown = Math.max(p.longestStandDown, run);
  }
  p.maxWave = Math.round(p.maxWave * 100) / 100;
  p.maxCurrent = Math.round(p.maxCurrent * 100) / 100;
  return p;
}

const seasons = [2022, 2023, 2024, 2025].map((y) => period(`Oct–Nov ${y}`, (t) => t.startsWith(`${y}-10`) || t.startsWith(`${y}-11`)));
const allYear = period('All of 2022–2025', () => true);

const R = 6371;
const dLat = ((cur.latitude - LAT) * Math.PI) / 180;
const dLon = ((cur.longitude - LON) * Math.PI) / 180;
const a = Math.sin(dLat / 2) ** 2 + Math.cos((LAT * Math.PI) / 180) * Math.cos((cur.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
const distanceKm = Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;

const data: HindcastData = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Open-Meteo Marine API: Copernicus SMOC surface current and hourly significant wave height, 2022–2025',
  cell: { lat: cur.latitude, lon: cur.longitude, distanceKm },
  limits,
  seasons,
  allYear,
};
for (const p of [...seasons, allYear])
  console.log(
    `${p.label.padEnd(18)} ${String(p.hours).padStart(6)} h · waves max ${p.maxWave} m, over ${p.overWave} h, near ${p.nearWave} h · current max ${p.maxCurrent} m/s, over ${p.overCurrent} h · longest stand-down ${p.longestStandDown} h`,
  );
writeFileSync(
  OUT,
  `// Generated by scripts/hindcast.ts on ${data.generatedAt} — do not edit by hand.\n` +
    `// Hours of four recorded bloom seasons inside SweepLine's wave and current limits.\n` +
    `import type { HindcastData } from './hindcastTypes';\n\n` +
    `export const HINDCAST_DATA: HindcastData = ${JSON.stringify(data, null, 2)};\n`,
);
console.log(`wrote ${OUT}`);
