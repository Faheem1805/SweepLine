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
import { S_LIFT, S_TRANSFERRED } from '../src/simulation/Agent';
import { NETS } from '../src/simulation/geometry';
import { PITCH } from '../src/simulation/lift';
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

// One bucket elevator for both nets: idle until its funnel sensor sees jellyfish, every collected
// animal rides up in a bucket that is never over its limit, it stops once there is nothing left to
// carry, small bells that work through net A are caught by net B, and stuck bells get freed.
{
  const tally = { turnedBeforeSeen: false, seenAt: -1, turnedAt: -1, worstBucket: 0, liftedIds: new Set<number>(), idleKWh: 0 };
  const lr = run({}, 1000, (t, s) => {
    const tr = s.transfer!;
    const st = tr.lift;
    if (st.seen && tally.seenAt < 0) tally.seenAt = t;
    if (st.turning && tally.turnedAt < 0) tally.turnedAt = t;
    if (tally.seenAt < 0 && tr.turning) tally.turnedBeforeSeen = true;
    if (tally.turnedAt < 0) tally.idleKWh = tr.energyKWh();
    const p = s.pool;
    const per = new Map<number, number>();
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] !== S_LIFT) continue;
      tally.liftedIds.add(p.id[i]);
      if (p.queueIndex[i] !== 1) continue;
      const key = Math.round(p.timer[i] / PITCH - st.phase);
      per.set(key, (per.get(key) ?? 0) + 1);
    }
    for (const n of per.values()) tally.worstBucket = Math.max(tally.worstBucket, n * s.kgPerAgent);
  }, 1.5);
  const s = lr.sEng;
  check('the elevator stays still until its funnel sensor sees jellyfish', !tally.turnedBeforeSeen && tally.seenAt > 0 && tally.turnedAt >= tally.seenAt && tally.idleKWh === 0, `seen at ${(tally.seenAt / 60).toFixed(0)} min, running at ${(tally.turnedAt / 60).toFixed(0)} min`);
  check('no bucket carries more than its limit', tally.worstBucket <= ASSUMPTIONS.lift.bucketKg + s.kgPerAgent, `${tally.worstBucket.toFixed(0)} kg against ${ASSUMPTIONS.lift.bucketKg} kg`);
  check('everything in the line came up the elevator', s.counters.transferred > 0 && s.counters.transferred <= tally.liftedIds.size, `${s.counters.transferred} transferred, ${tally.liftedIds.size} lifted`);
  check('net A has no funnel: its catch goes on to net B', s.transfer!.queues[0].length === 0 && s.counters.diverted > 0);
  check('small bells work through net A and net B catches them', s.sieved[0] > 0 && s.sieved[1] === 0 && lr.s.screensT < 0.1, `${s.sieved[0]} through A, ${s.sieved[1]} through B`);
  check('the jets free stuck bells', s.jets.bursts > 0 && s.jets.freed > 0, `${s.jets.bursts} bursts, ${s.jets.freed} freed`);
  check('fish turn back at the nets', (s.bycatch?.turnedBack ?? 0) > 0, `${s.bycatch?.turnedBack} fish`);
  check('the elevator changes nothing at the screens', lr.s.screensT < 0.1 && lr.s.balance.closes, `${lr.s.screensT.toFixed(3)} t`);

  // The bloom ends: once the funnel is clear and the line has flushed, the elevator stops.
  const end = run({}, 1000, (t, e) => {
    if (t >= 0.9 * 3600) e.bloomActive = false;
  }, 3.8);
  const tr = end.sEng.transfer!;
  const inLine = end.sEng.countState(S_TRANSFERRED) + end.sEng.countState(S_LIFT);
  check('the elevator stops when there is nothing left to carry', !tr.turning && !tr.lift.on && inLine === 0 && end.sEng.counters.released === end.sEng.counters.transferred, `${end.sEng.counters.released} released of ${end.sEng.counters.transferred}`);
  check('it ran only part of the run', tr.lift.turningSeconds < 3.8 * 3600 * 0.8, `${(tr.lift.turningSeconds / 60).toFixed(0)} min of ${(3.8 * 60).toFixed(0)}, ${tr.lift.starts} starts`);

  // Same seed, same run.
  const again = run({}, 1000, undefined, 1.5).sEng;
  check('a run is reproducible', again.counters.transferred === s.counters.transferred && again.counters.released === s.counters.released && again.transfer!.lift.phase === s.transfer!.lift.phase && again.bycatch!.turnedBack === s.bycatch!.turnedBack);
}

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

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
