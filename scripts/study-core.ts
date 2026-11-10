/** Headless probe of the channel-net engine: same bloom with and without SweepLine. */
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { computeEngineMetrics } from '../src/simulation/metrics';
import { DEFAULT_PARAMS, type SimParams } from '../src/simulation/types';

const arg = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`${k}=`))?.split('=')[1] ?? d);
const HOURS = arg('hours', 3);
const h = 0.4;

export function run(over: Partial<SimParams>, seed: number, hook?: (t: number, s: SimulationEngine, b: SimulationEngine) => void, hours = HOURS) {
  const p: SimParams = { ...DEFAULT_PARAMS, ...over, seed };
  const b = new SimulationEngine('baseline', p);
  const s = new SimulationEngine('sweepline', p);
  b.reset(p, 'approach');
  s.reset(p, 'approach');
  s.transfer!.armed = true;
  const series: Array<{ t: number; b: number; s: number; head: number; on: number; col: number }> = [];
  let t = 0;
  let nextSample = 0;
  let maxHead = 0;
  while (t < hours * 3600) {
    hook?.(t, s, b);
    b.step(h);
    s.step(h);
    t += h;
    maxHead = Math.max(maxHead, s.nets[0].head);
    if (t >= nextSample) {
      nextSample += 300;
      series.push({ t, b: b.screens.totalT, s: s.screens.totalT, head: s.nets[0].head, on: (s.onNet[0] + s.onNet[1]) * s.kgPerAgent / 1000, col: s.counters.diverted * s.kgPerAgent / 1000 });
    }
  }
  return { b: computeEngineMetrics(b), s: computeEngineMetrics(s), series, maxHead, sEng: s, bEng: b };
}

if (process.argv[1]?.includes('_v2probe')) {
  const t0 = performance.now();
  const r = run({}, 1000);
  const { b, s } = r;
  console.log('entered t', b.enteredT.toFixed(1), s.enteredT.toFixed(1));
  console.log('screens t', b.screensT.toFixed(1), s.screensT.toFixed(2), 'status', b.screenStatus, s.screenStatus, 'derate/trip', b.deratedAt, b.trippedAt);
  console.log('collected', s.collectedT.toFixed(1), 'released', s.releasedT.toFixed(1), 'onNet', s.onNetT.map((v) => v.toFixed(1)), 'leaked', s.leakedT.map((v) => v.toFixed(2)), 'pipe', s.inPipeT.toFixed(1));
  console.log('balance', s.balance, b.balance.closes);
  console.log('head max', r.maxHead.toFixed(4), 'through', Math.max(...r.sEng.nets[0].through).toFixed(3));
  console.log('active', s.active, b.active, 'pool', r.sEng.pool.capacity, 'dropped', r.sEng.counters.dropped);
  console.log(r.series.filter((_, i) => i % 4 === 0).map((x) => `${(x.t / 60).toFixed(0)}m b${x.b.toFixed(1)} s${x.s.toFixed(2)} on${x.on.toFixed(1)} col${x.col.toFixed(1)}`).join(' | '));
  console.log(((performance.now() - t0) / 1000).toFixed(1), 's');
}
