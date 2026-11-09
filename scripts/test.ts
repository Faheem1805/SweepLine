/**
 * Checks the claims the app makes against the engine. Run with `npm test`; exits non-zero on failure.
 *
 * Short runs only: the full results come from `npm run study`.
 */
import { readFileSync } from 'node:fs';
import { ASSUMPTIONS } from '../src/config/assumptions';
import { CHALLENGES } from '../src/config/challenges';
import { capexAllIn, runningTotal } from '../src/config/costs';
import { SITE, seabedDepth, seabedDepthFast } from '../src/config/site';
import { F_ENCOUNTERED, F_ENTERED, F_SNAGGED, S_FUNNEL, S_GUIDED, S_TRANSFER_QUEUE } from '../src/simulation/Agent';
import { AssistUnit, assistFlowM3s, assistPowerKW, type AssistSensors } from '../src/simulation/assist';
import { FUNNELS, NETS, netArc, netDistance, wallGap } from '../src/simulation/geometry';
import { SimulationEngine, SUCTION_REACH } from '../src/simulation/SimulationEngine';
import { DEFAULT_PARAMS, type SimParams } from '../src/simulation/types';
import { SCENARIOS } from '../src/simulation/scenarios';
import { sizeLine, sizeNet } from '../src/simulation/sizing';
import { TRANSFER_TPH } from '../src/simulation/transfer';
import { run } from './study-core';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

// Sizing: the sums behind the design.
const Q = ASSUMPTIONS.plant.unitFlowM3s * ASSUMPTIONS.plant.units;
const s = sizeNet(Q, SITE.channel.halfWidth * 2, SITE.channel.depth, SITE.net.angle);
check('design flow is 2 million m³/h', Math.abs(Q * 3600 - 2e6) < 5000, `${(Q * 3600).toFixed(0)} m³/h`);
check('through-mesh speed is inside the fish-screen limit', s.through <= ASSUMPTIONS.screenCriteria.approachMax, `${s.through.toFixed(3)} m/s`);
check('sweep beats through-mesh speed', s.sweep > s.through * 2, `${s.sweep.toFixed(3)} m/s`);
check('both nets fit ahead of the intake', Math.min(NETS[0].bz, NETS[1].bz) > SITE.intake.mouthZ + 40, `net B ends at z ${NETS[1].bz.toFixed(0)}`);
check('the shortest net does not depend on width', Math.abs(sizeNet(Q, 140, 12, 20).minNetLength - sizeNet(Q, 300, 12, 20).minNetLength) < 1e-9);
const L = sizeLine();
check('the line carries its stated capacity', Math.abs(L.capacityTph - TRANSFER_TPH) < 1, `${L.capacityTph.toFixed(0)} t/h`);
check('the head tank stands above the pipe crest and the line loss', ASSUMPTIONS.transfer.headTankLevel > SITE.breakwater.crestY + 1 && ASSUMPTIONS.transfer.headTankLevel > L.head);

// The poster is printed: the twin must keep saying what it says.
const poster = JSON.parse(readFileSync(new URL('../poster/content.json', import.meta.url), 'utf8'));
const results = JSON.parse(readFileSync(new URL('../poster/data/results.json', import.meta.url), 'utf8'));
const stats: string = results.stats.map((x: { value: string }) => x.value).join(' ');
const tech: string = poster.technical;
const said = (name: string, text: string, needle: string) => check(`poster: ${name}`, text.includes(needle), needle);
said('channel', tech, `${SITE.channel.halfWidth * 2} × ${SITE.channel.depth} m channel`);
said('channel speed', tech, `${s.channelSpeed.toFixed(2)} m/s`);
said('angle', tech, `${SITE.net.angle}° net`);
said('through-mesh speed', tech, `${s.through.toFixed(2)} m/s through the mesh`);
said('sweep', tech, `${s.sweep.toFixed(2)} m/s along it`);
said('relief head', tech, `${ASSUMPTIONS.net.reliefHead} m of head`);
said('line capacity', stats, `${L.capacityTph.toFixed(0)} t/h`);
said('power', stats, `≈ ${Math.round(L.kW / 10) * 10} kW`);
const cost: string = poster.future.at(-1)[1];
said('capital cost', cost, `US$${Math.round(capexAllIn().low)}–${Math.round(capexAllIn().high)}M`);
said('running cost', cost, `US$${(runningTotal().low / 1000).toFixed(1)}–${(runningTotal().high / 1000).toFixed(1)}M`);

// Every problem card runs something real.
const ids = new Set(Object.values(SCENARIOS).map((x) => x.id));
for (const c of CHALLENGES) check(`card "${c.problem}" has a scenario`, ids.has(c.scenario), c.scenario);

// The same bloom, with and without.
const r = run({}, 1000, undefined, 1.5);
check('every jellyfish is accounted for', r.s.balance.closes && r.b.balance.closes);
check('the bloom reaches the screens without SweepLine', r.b.screensT > 5, `${r.b.screensT.toFixed(1)} t`);
check('almost nothing reaches them with it', r.s.screensT < 0.1, `${r.s.screensT.toFixed(3)} t`);
check('nothing was dropped by the agent pool', r.sEng.counters.dropped === 0);

// A torn panel and one net against two.
const tear = (secondNet: boolean) =>
  run({ secondNet }, 1000, (t, e) => {
    if (t >= 20 * 60) e.tearPanel(0, 17);
  }, 1.5).s.screensT;
const two = tear(true);
const one = tear(false);
check('a second net catches a torn panel', two < 0.5 && one > two * 10, `${two.toFixed(2)} t vs ${one.toFixed(1)} t`);

// The agent model reads the seabed from a lookup table: it must match the exact formula wherever an
// animal swims (seaward of the shoreline toe, and not behind the screens, where none is simulated).
{
  let worst = 0;
  for (let i = 0; i < 40000; i++) {
    const x = SITE.domain.xMin + ((i * 7919) % 3301) * ((SITE.domain.xMax - SITE.domain.xMin) / 3301);
    const z = SITE.shore.toeZ + ((i * 104729) % 1297) * ((SITE.domain.zMax - SITE.shore.toeZ) / 1297);
    if (z < SITE.intake.mouthZ && x > -SITE.channel.halfWidth - 40 && x < SITE.basin.endX + 40) continue;
    worst = Math.max(worst, Math.abs(seabedDepthFast(x, z) - seabedDepth(x, z)));
  }
  check('seabed lookup table matches the formula', worst < 0.1, `worst ${(worst * 100).toFixed(1)} cm`);
}

// ---------------------------------------------------------------- the funnel
const FA = FUNNELS[0];
check('funnel: the mouth spans net to wall', Math.abs(FA.mouthWidth - wallGap(FA.line, FA.mouthS)) < 1e-9, `${FA.mouthWidth.toFixed(2)} m`);
check('funnel: throat and pocket fit inside the wall', FA.throatWidth <= wallGap(FA.line, FA.throatS) && FA.throatWidth <= wallGap(FA.line, FA.entryS), `${FA.throatWidth} m in ${wallGap(FA.line, FA.entryS).toFixed(2)} m`);
check('funnel: mouth, throat and entry in order along the net', FA.barS0 < FA.mouthS && FA.mouthS < FA.throatS && FA.throatS < FA.entryS && FA.entryS < FA.line.length);

/** One agent on a net at arc length `s`, `w` off its face, in a world with no bloom. */
function place(e: SimulationEngine, net: 0 | 1, s: number, w: number, depth: number): number {
  const p = e.pool;
  const L = NETS[net];
  const i = p.alloc();
  p.id[i] = 900000 + i;
  p.state[i] = S_GUIDED;
  p.flags[i] = F_ENTERED | F_ENCOUNTERED;
  p.lane[i] = net;
  p.px[i] = L.ax + L.tx * s + L.nx * w;
  p.pz[i] = L.az + L.tz * s + L.nz * w;
  p.py[i] = -depth;
  p.vx[i] = p.vy[i] = p.vz[i] = 0;
  p.size[i] = 0.35;
  p.swimSpeed[i] = 0.03;
  p.heading[i] = 0;
  p.depthZ[i] = 0;
  p.stateTime[i] = 0;
  p.contactStart[i] = 0;
  p.timer[i] = 0;
  p.queueIndex[i] = -1;
  p.slow[i] = 0;
  p.mouthTime[i] = -1;
  p.fade[i] = 1;
  e.counters.spawned++;
  e.counters.entered++;
  return i;
}
function emptyWorld(over: Partial<SimParams> = {}): SimulationEngine {
  const p: SimParams = { ...DEFAULT_PARAMS, ...over };
  const e = new SimulationEngine('sweepline', p);
  e.reset(p, 'none');
  e.bloomActive = false;
  e.transfer!.running = true;
  return e;
}
const arcOf = (e: SimulationEngine, i: number) => netArc(FA.line, e.pool.px[i], e.pool.pz[i]);

{
  // A jellyfish on the net short of the mouth: not collected until it is through the throat.
  const e = emptyWorld();
  const i = place(e, 0, FA.mouthS - 4, 0.8, 3);
  let tFunnel = -1;
  let tCollected = -1;
  let early = false;
  let sAtCollect = 0;
  for (let k = 0; k < 9000 && tCollected < 0; k++) {
    e.step(0.1);
    if (tFunnel < 0 && e.pool.state[i] === S_FUNNEL) tFunnel = e.time;
    if (e.counters.diverted > 0) {
      tCollected = e.time;
      sAtCollect = arcOf(e, i);
    } else if (e.pool.state[i] === S_TRANSFER_QUEUE) early = true;
    if (e.counters.diverted === 0 && tFunnel < 0 && arcOf(e, i) > FA.mouthS + 0.05) early = true;
  }
  check('funnel: an animal outside the mouth is not collected', !early && tFunnel > 0 && tCollected > tFunnel && sAtCollect >= FA.throatS - 0.05, `mouth at ${tFunnel.toFixed(0)} s, collected at ${tCollected.toFixed(0)} s, ${(sAtCollect - FA.throatS).toFixed(2)} m past the throat`);
  check('funnel: the lift takes it only at the wet-well entry', e.pool.state[i] === S_TRANSFER_QUEUE || Math.hypot(e.pool.px[i] - FA.entry.x, e.pool.pz[i] - FA.entry.z) <= SUCTION_REACH + 0.5);
}

{
  // Both lifts down and a heavy bloom: the pocket fills, the throat closes, then the mouth.
  const p: SimParams = { ...DEFAULT_PARAMS, seed: 1000, bloomRate: 60 };
  const e = new SimulationEngine('sweepline', p);
  e.reset(p, 'approach');
  e.transfer!.running = true;
  e.transfer!.primaryFault = true;
  e.transfer!.standbyFault = true;
  let over = 0;
  let pastThroat = 0;
  let pastMouth = 0;
  let fullSeen = false;
  let funnelFullSeen = false;
  let divertedWhileFull = false;
  for (let t = 0; t < 6000; t += 0.4) {
    const fullBefore = e.transfer!.queues[0].length >= e.holdCapacity;
    const div = e.counters.diverted;
    e.step(0.4);
    if (fullBefore && e.transfer!.queues[1].length === 0 && e.counters.diverted > div) divertedWhileFull = true;
    if (Math.round(t * 2.5) % 25 !== 0) continue;
    const q = e.transfer!.queues[0].length;
    if (q > e.holdCapacity) over++;
    if (q >= e.holdCapacity) fullSeen = true;
    if (e.inFunnel[0] >= e.funnelCapacity) funnelFullSeen = true;
    const pool = e.pool;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.lane[i] !== 0) continue;
      if (pool.state[i] === S_FUNNEL && arcOf(e, i) >= FA.throatS) pastThroat++;
      if (pool.state[i] === S_GUIDED && arcOf(e, i) > FA.mouthS + 0.05 && netDistance(FA.line, pool.px[i], pool.pz[i]) >= -0.2) pastMouth++;
    }
  }
  check('pocket: a full pocket blocks admission', fullSeen && over === 0 && pastThroat === 0 && !divertedWhileFull, `held at ${e.holdCapacity}, ${e.inFunnel[0]} waiting in the funnel`);
  check('funnel: a full funnel closes the mouth', funnelFullSeen && pastMouth === 0 && e.inFunnel[0] <= e.funnelCapacity, `${e.inFunnel[0]} of ${e.funnelCapacity} in the funnel`);
  check('pocket test: every jellyfish is accounted for', e.balance().closes);
}

// ---------------------------------------------------------------- the sweep assist
{
  const AS = ASSUMPTIONS.assist;
  const ok: AssistSensors = { presentKg: 500, mouthKg: 100, speed: 0.03, pocketFull: false, liftAvailable: true, head: 0.01, relief: false };
  const run = (u: AssistUnit, s: AssistSensors, seconds: number) => {
    for (let t = 0; t < seconds; t += 1) u.update(1, s);
  };
  const u = new AssistUnit(FA);
  u.reset('off');
  run(u, ok, 600);
  check('assist: Off never runs', u.speed === 0 && u.energyKWh === 0);
  u.reset('auto');
  run(u, ok, AS.onDelay - 20);
  check('assist: Auto waits out its delay', u.speed === 0 && u.reason.startsWith('Watching'), u.reason);
  run(u, ok, 40 + AS.rampUp);
  check('assist: Auto starts on a slow sweep with animals there, and ramps', u.speed === 1 && u.starts === 1, u.reason);
  run(u, { ...ok, speed: (AS.slowOn + AS.slowOff) / 2 }, 400);
  check('assist: hysteresis keeps it on between the thresholds', u.speed === 1);
  const locks: Array<[string, Partial<AssistSensors>]> = [
    ['pocket full', { pocketFull: true }],
    ['lift down', { liftAvailable: false }],
    ['relief open', { relief: true }],
    ['head high', { head: AS.headLimit + 0.005 }],
  ];
  for (const [name, bad] of locks) {
    for (const mode of ['auto', 'manual'] as const) {
      const v = new AssistUnit(FA);
      v.reset(mode);
      run(v, ok, AS.onDelay + AS.rampUp + 10);
      const before = v.speed;
      run(v, { ...ok, ...bad }, AS.rampDown + 5);
      const stopped = v.speed === 0 && v.reason.startsWith('Held off');
      run(v, ok, AS.interlockHold - 5);
      const held = v.speed === 0;
      run(v, ok, 10 + AS.rampUp);
      check(`assist: ${name} holds ${mode} off, then lets it go`, before === 1 && stopped && held && v.speed === 1, v.reason);
    }
  }
  const m = new AssistUnit(FA);
  m.reset('manual');
  run(m, { ...ok, presentKg: 0, speed: Number.NaN }, AS.rampUp + 5);
  check('assist: Manual test runs with no animals there', m.speed === AS.manualSpeed);
  const c = new AssistUnit(FA);
  c.reset('auto');
  run(c, ok, AS.onDelay + AS.rampUp + 10);
  const clear: AssistSensors = { ...ok, speed: 0.2 };
  run(c, clear, AS.offDelay - 10);
  const stillOn = c.speed === 1;
  run(c, clear, AS.minRun + AS.rampDown);
  check('assist: Auto goes back to idle once clear for its off delay and minimum run', stillOn && c.speed === 0 && c.reason.startsWith('Idle'), c.reason);
  const f = new AssistUnit(FA);
  f.reset('auto');
  for (let t = 0; t < 7200; t += 1) f.update(1, Math.floor(t / 100) % 2 ? clear : ok);
  check('assist: no rapid switching on a signal that comes and goes', f.starts <= 1, `${f.starts} start in 2 h`);

  // The field: bounded, local, along the mesh, zero when stopped.
  const g = new AssistUnit(FA);
  g.reset('manual');
  const z0 = { x: 0, z: 0 };
  g.addVelocity(FA.mouthIn.x, FA.mouthIn.z, z0);
  const off0 = z0.x === 0 && z0.z === 0;
  run(g, ok, AS.rampUp + 5);
  let max = 0;
  let along = true;
  let farZero = true;
  const L = FA.line;
  for (let s = FA.barS0 - 30; s <= L.length; s += 0.5) {
    for (let w = -3; w <= 12; w += 0.25) {
      const o = { x: 0, z: 0 };
      g.addVelocity(L.ax + L.tx * s + L.nx * w, L.az + L.tz * s + L.nz * w, o);
      const v = Math.hypot(o.x, o.z);
      max = Math.max(max, v);
      if (v > 1e-9 && Math.abs(o.x * L.nx + o.z * L.nz) > 1e-9) along = false;
      if ((s < FA.barS0 - 1.01 || w < -0.11 || w > 5.01 * AS.layer) && v > 0) farZero = false;
    }
  }
  check('assist: the field is zero when the pump is stopped', off0);
  check('assist: the field never exceeds its bound', max <= AS.addSpeed + 1e-9 && max > AS.addSpeed * 0.5, `${max.toFixed(3)} m/s`);
  check('assist: the field runs along the mesh and is local', along && farZero);
  const e = emptyWorld({ assistMode: 'off' });
  const o1 = { x: 0, z: 0 };
  const o2 = { x: 0, z: 0 };
  e.sampleWater(FA.mouthIn.x - 1, FA.mouthIn.z + 2, 2, o1);
  e.flow.sample(FA.mouthIn.x - 1, FA.mouthIn.z + 2, 2, o2);
  check('assist: Off leaves the water untouched', o1.x === o2.x && o1.z === o2.z);
  check('assist: pump sized from flow × head ÷ efficiency', Math.abs(assistPowerKW() - (1025 * 9.81 * assistFlowM3s() * AS.head) / AS.efficiency / 1000) < 1e-9, `${(assistFlowM3s() * 3600).toFixed(0)} m³/h, ${assistPowerKW().toFixed(1)} kW`);

  // It does not free a snagged animal.
  const sn = emptyWorld({ assistMode: 'manual' });
  for (let t = 0; t < AS.rampUp + 5; t += 1) sn.step(1);
  const j = place(sn, 0, FA.barS0 + 4, 0.5, 3);
  sn.pool.flags[j] |= F_SNAGGED;
  sn.pool.timer[j] = 10000;
  const s0 = arcOf(sn, j);
  for (let t = 0; t < 120; t += 0.1) sn.step(0.1);
  check('assist: a snagged animal stays snagged with the jets on', (sn.pool.flags[j] & F_SNAGGED) !== 0 && Math.abs(arcOf(sn, j) - s0) < 0.3 && sn.assist[0].speed === 1, `moved ${(arcOf(sn, j) - s0).toFixed(2)} m`);
}

{
  // Same seed, same conditions, same answer, with the assist on Auto.
  const once = () => {
    const p: SimParams = { ...DEFAULT_PARAMS, seed: 8919, assistMode: 'auto' };
    const e = new SimulationEngine('sweepline', p);
    e.reset(p, 'approach');
    e.transfer!.running = true;
    for (let t = 0; t < 4800; t += 0.4) {
      if (Math.abs(t - 3800) < 0.2) e.applyParams({ ...p, unitsRunning: 1 });
      e.step(0.4);
    }
    return JSON.stringify([e.counters, e.transitSum, e.stallKgS, e.snagKgS, e.assist.map((a) => [a.speed, a.energyKWh, a.starts])]);
  };
  const a = once();
  check('same seed, same result, with Auto', a === once());
  check('the funnel scenario has run Auto at least once', JSON.parse(a)[4][0][2] >= 1);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
