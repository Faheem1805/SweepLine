/** Runs one study case on the engine and writes its numbers as JSON. See scripts/study-all.sh. */
import { writeFileSync } from 'node:fs';
import { ASSUMPTIONS, SPECIES } from '../src/config/assumptions';
import { tideCurrent, tideCurrentVector, TIDE } from '../src/simulation/tide';
import type { SimParams } from '../src/simulation/types';
import { run } from './study-core';

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
  debris: {
    over: {},
    hook: (t, s) => {
      if (t >= 40 * 60) s.nets[0].debrisTarget = 0.975;
    },
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

// One-at-a-time changes to an assumption: `sens:<key>:<low|high>`.
const mutable = ASSUMPTIONS.net as unknown as Record<string, number>;
const species = SPECIES.catostylus as unknown as Record<string, number>;
const plant = ASSUMPTIONS.plant as unknown as Record<string, number>;
const SENS: Record<string, { low: () => void; high: () => void }> = {
  slide: { low: () => (mutable.slide = 0.5), high: () => (mutable.slide = 0.9) },
  leak: {
    low: () => {
      species.leakPerPanel *= 0.2;
      mutable.jointLeak *= 0.2;
    },
    high: () => {
      species.leakPerPanel *= 10;
      mutable.jointLeak *= 10;
    },
  },
  snag: { low: () => (mutable.snagRate *= 0.2), high: () => (mutable.snagRate *= 5) },
  swim: {
    low: () => {
      species.swimMin *= 0.5;
      species.swimMax *= 0.5;
    },
    high: () => {
      species.swimMin *= 2.5;
      species.swimMax *= 2.5;
    },
  },
  flow: { low: () => (plant.unitFlowM3s = 100), high: () => (plant.unitFlowM3s = 160) },
};
let c = cases[name];
if (name.startsWith('sens:')) {
  const [, key, side] = name.split(':');
  SENS[key][side as 'low' | 'high']();
  c = cases.reference;
}
if (name.startsWith('leak10')) {
  species.leakPerPanel *= 10;
  mutable.jointLeak *= 10;
}
let reliefAt: number | null = null;
let peakOnNet = 0;
const r = run(
  c.over,
  seed,
  (t, s, b) => {
    c.hook?.(t, s, b);
    if (reliefAt === null && (s.nets[0].reliefFraction > 0 || s.nets[1].reliefFraction > 0)) reliefAt = t;
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
