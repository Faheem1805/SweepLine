/**
 * The "Funnel assist" scenario, run on the same seeds with the experimental sweep assist Off and on
 * Auto, through the app's own controller, so every number is what the twin shows. Writes
 * src/data/assist.generated.ts, which the app reads.
 *
 *   npm run study:assist            all seeds, both modes, in parallel (a few minutes)
 *   tsx scripts/assist-study.ts seed=1000 mode=off out=x.json      one run
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSUMPTIONS } from '../src/config/assumptions';
import { getScenario } from '../src/simulation/scenarios';
import { SimController } from '../src/simulation/SimController';
import { DEFAULT_PARAMS, type AssistMode } from '../src/simulation/types';

const SEEDS = [1000, 8919, 16838, 24757, 32676];
/** Seconds after the run starts: weak sweep from 30 to 630 s, then the units return and Auto goes back to idle. */
const WINDOW = 1200;
const WEAK: [number, number] = [30, 630];

export interface AssistRun {
  seed: number;
  mode: AssistMode;
  /** Mouth-to-throat time of animals that reached a pocket while the sweep was weak (s). */
  transitMean: number | null;
  transitP90: number | null;
  transits: number;
  /** Time-averaged over the window: stalled, snagged, and at the mouth (kg). */
  stalledKg: number;
  snaggedKg: number;
  mouthKg: number;
  /** Over the window (t). */
  collectedT: number;
  screensT: number;
  baselineScreensT: number;
  /** Assist pump, net A and B together. */
  runtimeS: number;
  energyKWh: number;
  starts: number;
  /** When Auto first ran and when it went back to idle (s after the run started). */
  onAt: number | null;
  idleAt: number | null;
  balanced: boolean;
}

export async function runAssist(seed: number, mode: AssistMode): Promise<AssistRun> {
  const c = new SimController();
  c.preRollSliceMs = 1e9;
  const sc = getScenario('funnel')!;
  c.params = { ...DEFAULT_PARAMS, seed, ...sc.params, assistMode: mode };
  await c.restart(sc.start, sc);
  const step = (c as unknown as { stepAll(dt: number): void }).stepAll.bind(c);
  const s = c.sweepline;
  const t0 = s.time;
  const col0 = s.counters.diverted;
  const scr0 = s.screens.totalT;
  const bscr0 = c.baseline.screens.totalT;
  const stall0 = s.stallKgS;
  const snag0 = s.snagKgS;
  const times: number[] = [];
  let seen = s.transitCount;
  let mouth = 0;
  let onAt: number | null = null;
  let idleAt: number | null = null;
  const h = ASSUMPTIONS.timeStep;
  while (s.time - t0 < WINDOW - 1e-6) {
    step(h);
    const t = s.time - t0;
    const k = s.transitCount - seen;
    seen = s.transitCount;
    if (k > 0 && t >= WEAK[0] && t <= WEAK[1] + 60) times.push(...s.transits.slice(-k));
    mouth += (s.assist[0].sensors.mouthKg + s.assist[1].sensors.mouthKg) * h;
    const running = s.assist.some((a) => a.speed > 0.01);
    if (running && onAt === null) onAt = t;
    if (!running && onAt !== null && idleAt === null) idleAt = t;
  }
  times.sort((a, b) => a - b);
  const kg = s.kgPerAgent / 1000;
  const r = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    seed,
    mode,
    transitMean: times.length ? r(times.reduce((a, b) => a + b, 0) / times.length, 1) : null,
    transitP90: times.length ? r(times[Math.floor(times.length * 0.9)], 1) : null,
    transits: times.length,
    stalledKg: r((s.stallKgS - stall0) / WINDOW, 1),
    snaggedKg: r((s.snagKgS - snag0) / WINDOW, 1),
    mouthKg: r(mouth / WINDOW, 1),
    collectedT: r((s.counters.diverted - col0) * kg),
    screensT: r(s.screens.totalT - scr0),
    baselineScreensT: r(c.baseline.screens.totalT - bscr0, 2),
    runtimeS: r(s.assist.reduce((a, u) => a + u.runtime, 0), 0),
    energyKWh: r(s.assist.reduce((a, u) => a + u.energyKWh, 0), 2),
    starts: s.assist.reduce((a, u) => a + u.starts, 0),
    onAt: onAt === null ? null : r(onAt, 0),
    idleAt: idleAt === null ? null : r(idleAt, 0),
    balanced: s.balance().closes && c.baseline.balance().closes,
  };
}

const arg = (k: string) => process.argv.find((a) => a.startsWith(`${k}=`))?.split('=')[1];

async function main(): Promise<void> {
  const seed = arg('seed');
  if (seed) {
    const res = await runAssist(Number(seed), (arg('mode') ?? 'off') as AssistMode);
    writeFileSync(arg('out')!, JSON.stringify(res));
    return;
  }
  const dir = join(tmpdir(), `sweepline-assist-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const self = fileURLToPath(import.meta.url);
  const jobs = SEEDS.flatMap((sd) => (['off', 'auto'] as const).map((m) => ({ sd, m, out: join(dir, `${m}-${sd}.json`) })));
  await Promise.all(
    jobs.map(
      (j) =>
        new Promise<void>((done, fail) => {
          const p = spawn(process.execPath, ['--import', 'tsx', self, `seed=${j.sd}`, `mode=${j.m}`, `out=${j.out}`], { stdio: 'inherit' });
          p.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${j.m} ${j.sd} exited ${code}`))));
        }),
    ),
  );
  const runs: AssistRun[] = jobs.map((j) => JSON.parse(readFileSync(j.out, 'utf8')));
  const mean = (m: AssistMode, f: (x: AssistRun) => number | null) => {
    const v = runs.filter((x) => x.mode === m).map(f).filter((x): x is number => x !== null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;
  };
  const summary = (m: AssistMode) => ({
    transitMean: mean(m, (x) => x.transitMean),
    transitP90: mean(m, (x) => x.transitP90),
    stalledKg: mean(m, (x) => x.stalledKg),
    snaggedKg: mean(m, (x) => x.snaggedKg),
    mouthKg: mean(m, (x) => x.mouthKg),
    collectedT: mean(m, (x) => x.collectedT),
    screensT: mean(m, (x) => x.screensT),
    runtimeS: mean(m, (x) => x.runtimeS),
    energyKWh: mean(m, (x) => x.energyKWh),
    onAt: mean(m, (x) => x.onAt),
    idleAt: mean(m, (x) => x.idleAt),
  });
  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    scenario: 'funnel',
    windowS: WINDOW,
    weakS: WEAK,
    seeds: SEEDS,
    off: summary('off'),
    auto: summary('auto'),
    balanced: runs.every((x) => x.balanced),
    runs,
  };
  const file = new URL('../src/data/assist.generated.ts', import.meta.url);
  writeFileSync(
    file,
    `// Generated by scripts/assist-study.ts on ${out.generatedAt} — do not edit by hand.\n// The Funnel assist scenario on the same seeds, sweep assist Off against Auto. Model results, not field results.\nexport const ASSIST_STUDY = ${JSON.stringify(out, null, 1)} as const;\n`,
  );
  console.log('off ', JSON.stringify(out.off));
  console.log('auto', JSON.stringify(out.auto));
  for (const x of runs) console.log(x.mode.padEnd(4), x.seed, JSON.stringify(x));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
