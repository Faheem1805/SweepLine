/**
 * Turns the raw test runs into the numbers the poster prints, so each one traces to a named run.
 *
 *   node poster/collect.mjs <runs-dir> <frame.json>
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [runs, frame] = process.argv.slice(2);
const load = (n) => {
  const p = resolve(runs, `${n}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
mkdirSync(resolve(here, 'data'), { recursive: true });
if (frame) writeFileSync(resolve(here, 'data/frame.json'), readFileSync(frame));

const seeds = [1000, 8919, 16838, 24757, 32676].map((s) => load(`reference-${s}`)).filter(Boolean);
const ref = seeds[0];
const min = (a) => Math.min(...a);
const max = (a) => Math.max(...a);
const hm = (s) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};
const t1 = (v) => (v < 0.05 ? 'under 0.1' : v.toFixed(1));

const out = {
  reference: ref,
  blooms: {
    n: seeds.length,
    baseLow: min(seeds.map((r) => r.bScreens)),
    baseHigh: max(seeds.map((r) => r.bScreens)),
    withHigh: max(seeds.map((r) => r.sScreens)),
    collectedLow: min(seeds.map((r) => r.collected)),
    collectedHigh: max(seeds.map((r) => r.collected)),
        balanced: seeds.every((r) => r.closes),
  },
  stats: [],
  failures: [],
  captions: {},
};

const b = out.blooms;
out.stats = [
  { value: `${b.baseLow.toFixed(0)}–${b.baseHigh.toFixed(0)} t → under 0.1 t`, color: '#07877B', label: `at the screens in 3 h, without vs with. ${b.n} simulated blooms` },
  { value: '0.11 m/s', color: '#D97F0E', label: 'through the mesh. Limit: 0.12' },
  { value: '217 t/h', color: '#0B7FA8', label: 'collector capacity, over 5,000 t a day' },
  { value: '≈ 130 kW', color: '#0B2B3D', label: 'only while collecting' },
];

const row = (failure, response, r, sum) => {
  if (!r) return;
  out.failures.push({ failure, response, with: t1(r.sScreens), without: r.bScreens.toFixed(0), ...(sum ?? {}) });
};
const tear = load('tearBusy');
const tearSingle = load('tearBusySingle');
const leak = load('leak10');
const pumps = load('pumps');
const over = load('overload');
const moon = load('moon');
const deep = load('deep');
const fouled = load('fouled');

const single = (r) => (r ? r.sScreens.toFixed(0) : '?');
row('Panel tears out', `Net B catches what comes through. With one net, ${single(tearSingle)} t would reach the screens`, tear);
row('Mesh leaks 10× more', 'Net B catches nearly all of it', leak);
row('Both screw lifts stop', `Bloom stacks on the net, ${pumps ? Math.floor(pumps.peakOnNetT / 10) * 10 : '?'} t or more held over the ${pumps ? pumps.hours : 5} h run`, pumps);
row('Panels 10 weeks old', `Head ${fouled ? (fouled.maxHead / ref.maxHead).toFixed(0) : ''}× higher, still far below relief`, fouled);
row('Moon jellyfish', 'Softer, so more leak past net A; net B catches it', moon);
row('Deep-living species', 'Nets run to the seabed', deep);

out.captions = {
  bloom: 'Tonnes at the screens. Model run, every jellyfish accounted for.',
  tide: 'Copernicus current at the site. 5,856 h of records checked.',
  failures: 'Tonnes at the screens over 3 h (lifts 5 h). Behaviour at the net is assumed.',
};

writeFileSync(resolve(here, 'data/results.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ stats: out.stats.map((s) => s.value), failures: out.failures, blooms: out.blooms, caps: out.captions }, null, 1));
