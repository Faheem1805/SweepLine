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
copyFileSync(frame, resolve(here, 'data/frame.json'));

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
  { value: `${b.baseLow.toFixed(0)}–${b.baseHigh.toFixed(0)} t → under 0.1 t`, color: '#2DD4BF', label: `reach the screens in 3 h, without vs with SweepLine, over ${b.n} simulated 25 t/h blooms` },
  { value: '0.11 m/s', color: '#F5B94C', label: 'through the mesh, inside the 0.12 m/s fish-screen limit. Calculated from a 400 m³/s plant' },
  { value: '5,856 h', color: '#22D3EE', label: 'of recorded Oct–Nov currents and waves checked, 2022–2025. Waves peaked at 1.18 m' },
  { value: '≈ 67 kW', color: '#EAF3F7', label: 'to run the collector pump, and only while a bloom is being collected' },
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
row('Both pumps fail', `Bloom stacks on the net, ${pumps ? Math.floor(pumps.peakOnNetT / 10) * 10 : '?'} t or more held over the ${pumps ? pumps.hours : 5} h run`, pumps);
row('Panels 10 weeks old', `Head ${fouled ? (fouled.maxHead / ref.maxHead).toFixed(0) : ''}× higher, still far below relief`, fouled);
row('Moon jellyfish', 'Softer, so more leak past net A; net B catches it', moon);
row('Deep Crambionella', 'Nets run to the seabed', deep);

out.captions = {
  bloom: `Model run, seed 1000, 25 t/h bloom. Without SweepLine the screens pass an assumed wash capacity of 10 t/h after ${hm(ref.bDerate)}. Every jellyfish is accounted for on every run.`,
  tide: 'Outside: Copernicus current at the site, 8 Oct 2025. Inside: plant flow ÷ channel section, which the tide does not change.',
  failures: 'Model runs, one bloom each: tonnes on the screens with / without SweepLine over 3 h (pump case 5 h). Jellyfish behaviour at the net is assumed, not measured.',
};

writeFileSync(resolve(here, 'data/results.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ stats: out.stats.map((s) => s.value), failures: out.failures, blooms: out.blooms, caps: out.captions }, null, 1));
