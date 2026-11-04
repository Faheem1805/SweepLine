/** Runs one poster case on the channel-net engine and writes its numbers as JSON. */
import { writeFileSync } from 'node:fs';
import { ASSUMPTIONS, SPECIES } from '../src/config/assumptions';
import { tideCurrent, tideCurrentVector, TIDE } from '../src/simulation/tide';
import type { SimParams } from '../src/simulation/types';
import { run } from './_v2probe';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`${k}=`))?.split('=')[1];
const name = arg('case') ?? 'reference';
const seed = Number(arg('seed') ?? 1000);
const out = arg('out')!;
const sp = (k: keyof typeof SPECIES): Partial<SimParams> => ({ species: k, bloomMeanDepth: SPECIES[k].meanDepth, bloomDepthSD: SPECIES[k].depthSD });

const tideStart = TIDE.referenceTurn - 1.2;
const cases: Record<string, { over: Partial<SimParams>; hook?: Parameters<typeof run>[2]; hours?: number }> = {
  reference: { over: {} },
  single: { over: { secondNet: false } },
  moon: { over: { ...sp('aurelia'), bloomRate: 18 } },
  deep: { over: { ...sp('crambionella'), bloomRate: 20 } },
  fouled: { over: { foulingWeeks: 10 } },
  storm: { over: { waveHeight: 1.82 } },
  tide: {
    over: { tide: true, tideStart, bloomRate: 18 },
    hook: (t, s, b) => {
      const v = tideCurrentVector(tideCurrent(tideStart + t / 3600));
      s.setCurrent(v.speed, v.bearing);
      b.setCurrent(v.speed, v.bearing);
    },
  },
  tear: {
    over: {},
    hook: (t, s) => {
      if (t >= 40 * 60) s.tearPanel(0, 10);
    },
  },
  tearSingle: {
    over: { secondNet: false },
    hook: (t, s) => {
      if (t >= 40 * 60) s.tearPanel(0, 10);
    },
  },
  tearBusy: {
    over: {},
    hook: (t, s) => {
      if (t >= 40 * 60) s.tearPanel(0, 17);
    },
  },
  tearBusySingle: {
    over: { secondNet: false },
    hook: (t, s) => {
      if (t >= 40 * 60) s.tearPanel(0, 17);
    },
  },
  leak10: { over: {} },
  leak10Single: { over: { secondNet: false } },
  pumps: {
    over: {},
    hook: (t, s) => {
      if (t >= 30 * 60) {
        s.transfer!.primaryFault = true;
        s.transfer!.standbyFault = true;
      }
    },
    hours: 5,
  },
  overload: {
    over: { foulingWeeks: 6 },
    hook: (t, s, b) => {
      if (t >= 20 * 60) {
        s.transfer!.primaryFault = true;
        s.transfer!.standbyFault = true;
      }
      if (t >= 30 * 60) {
        s.surge = 3;
        b.surge = 3;
      }
    },
    hours: 5,
  },
};

const c = cases[name];
if (name.startsWith('leak10')) {
  (SPECIES.catostylus as { leakPerPanel: number }).leakPerPanel *= 10;
  (ASSUMPTIONS.net as { jointLeak: number }).jointLeak *= 10;
}
let reliefAt: number | null = null;
let peakOnNet = 0;
const r = run(
  c.over,
  seed,
  (t, s, b) => {
    c.hook?.(t, s, b);
    if (reliefAt === null && s.nets[0].reliefFraction > 0) reliefAt = t;
    peakOnNet = Math.max(peakOnNet, (s.onNet[0] + s.onNet[1]) * s.kgPerAgent);
  },
  c.hours ?? 3,
);
const { b, s } = r;
writeFileSync(
  out,
  JSON.stringify({
    name,
    seed,
    hours: c.hours ?? 3,
    enteredT: b.enteredT,
    bScreens: b.screensT,
    sScreens: s.screensT,
    bDerate: b.deratedAt,
    bTrip: b.trippedAt,
    sDerate: s.deratedAt,
    sTrip: s.trippedAt,
    collected: s.collectedT,
    released: s.releasedT,
    leaked: s.leakedT,
    maxHead: r.maxHead,
    reliefAt,
    peakOnNetT: peakOnNet / 1000,
    closes: s.balance.closes && b.balance.closes,
    dropped: r.sEng.counters.dropped,
    series: r.series,
  }),
);
console.log(name, seed, 'done');
