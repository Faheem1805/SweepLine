/**
 * Checks the claims the app makes against the engine. Run with `npm test`; exits non-zero on failure.
 *
 * Short runs only: the full results come from `npm run study`.
 */
import { readFileSync } from 'node:fs';
import { ASSUMPTIONS } from '../src/config/assumptions';
import { CHALLENGES } from '../src/config/challenges';
import { capexTotal, runningTotal } from '../src/config/costs';
import { SITE } from '../src/config/site';
import { NETS } from '../src/simulation/geometry';
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
said('capital cost', cost, `US$${Math.round(capexTotal().low)}–${Math.round(capexTotal().high)}M`);
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

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
