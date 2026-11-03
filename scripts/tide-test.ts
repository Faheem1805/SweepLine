/**
 * Tide-turn check: replays the recorded spring-tide turn (Tide Turn scenario) with the Twin-Line
 * and with a single line, and counts intake contacts against the same-seed baseline before and
 * after the current reverses. Outcomes are computed by the agent model as usual.
 *
 *   npm run test:tide                # until 3 h after the turn
 *   npm run test:tide -- hours=4
 */
import { ASSUMPTIONS } from '../src/config/assumptions';
import { getScenario } from '../src/simulation/scenarios';
import { controller } from '../src/simulation/SimController';
import { TIDE } from '../src/simulation/tide';

const after = Number(process.argv.find((a) => a.startsWith('hours='))?.split('=')[1] ?? 3);
const scenario = getScenario('tide-turn')!;

controller.setPublisher(() => {}, () => {});

interface Result {
  base: number;
  sweep: number;
  diverted: number;
  released: [number, number];
}

async function run(twinLine: boolean): Promise<{ before: Result; afterTurn: Result; status: string }> {
  controller.params = { ...controller.params, ...scenario.params, twinLine };
  await controller.restart(scenario.start, scenario);
  controller.setSpeed(40);
  const b = controller.baseline;
  const s = controller.sweepline;
  const take = (): Result => ({
    base: b.counters.intakeContacts,
    sweep: s.counters.intakeContacts,
    diverted: s.counters.diverted,
    released: [0, 0],
  });
  const outlets = () => [s.outletReleased[0], s.outletReleased[1]] as [number, number];
  let atTurn: Result | null = null;
  const hours = () => controller.params.tideStart + s.time / 3600;
  const seen = new Set<number>();
  while (hours() < TIDE.referenceTurn + after) {
    controller.frame(0.1);
    if (!atTurn && hours() >= TIDE.referenceTurn) atTurn = { ...take(), released: outlets() };
    for (const e of controller.events) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (/Tide|Line|valve|SafeOpen|ENVELOPE/.test(e.message)) {
        const h = controller.params.tideStart + e.t / 3600 - TIDE.referenceTurn;
        console.log(`    ${h >= 0 ? '+' : ''}${(h * 60).toFixed(0).padStart(4)} min  ${e.message}`);
      }
    }
  }
  const end = { ...take(), released: outlets() };
  const before = atTurn!;
  const afterTurn: Result = {
    base: end.base - before.base,
    sweep: end.sweep - before.sweep,
    diverted: end.diverted - before.diverted,
    released: [end.released[0] - before.released[0], end.released[1] - before.released[1]],
  };
  return { before, afterTurn, status: controller.computeStatus().code };
}

let ok = true;
for (const twin of [true, false]) {
  console.log(`\n${twin ? 'Twin-Line' : 'Single line'} — recorded turn ${new Date(Date.parse(TIDE.start) + TIDE.referenceTurn * 3600_000).toISOString().slice(0, 16)} UTC`);
  const r = await run(twin);
  const cut = (x: Result) => (x.base > 0 ? `${((1 - x.sweep / x.base) * 100).toFixed(0)}% fewer` : '—');
  console.log(`  before the turn: intake contacts ${r.before.sweep} vs baseline ${r.before.base} (${cut(r.before)})`);
  console.log(
    `  after the turn (${after} h): intake contacts ${r.afterTurn.sweep} vs baseline ${r.afterTurn.base} (${cut(r.afterTurn)}) · diverted ${r.afterTurn.diverted} · released WSW/ENE outlets ${r.afterTurn.released.join('/')} · status ${r.status}`,
  );
  // Both lines share one release line, down-drift (WSW) in the design; a down-tide valve would release ENE after the turn.
  const [wsw, ene] = r.afterTurn.released;
  const downTide = ASSUMPTIONS.release.design.side === 'down-tide';
  if (twin) ok = r.afterTurn.base > 0 && r.afterTurn.sweep <= r.afterTurn.base * 0.1 && (downTide ? ene >= 0.9 * (wsw + ene) : ene === 0);
}
if (!ok) {
  console.error('FAIL: the Twin-Line keeps under 90% of post-turn contacts off the intake, or releases from the wrong outlet');
  process.exit(1);
}
console.log('\nPASS');
