import { DRIFT_DATA } from '../data/drift.generated';
import { SEEDS_DATA } from '../data/seeds.generated';
import { controller } from '../simulation/SimController';
import { DEFAULT_PARAMS } from '../simulation/types';
import { useApp } from './store';

/**
 * Booth kiosk (`?kiosk=1`): a self-running loop for a stand where nobody is at the controls.
 * It drives the ordinary run controls (runs, scenarios, camera presets, pages) and shows one
 * caption; captions follow the simulation's state, so they always match the scene. Any click,
 * key or scroll hands control back.
 *
 *   1. Pop-up and sweep: the reference run from the bloom approach, then the release point.
 *   2. Tide turn: the recorded turn, Line B taking over (the scenario paces itself).
 *   3. Evidence: the same-seed result.
 */

export interface KioskCaption {
  step: number;
  steps: number;
  title: string;
  text: string;
}

const STEPS = 3;
const TICK = 400;

const design = DRIFT_DATA.outcomes.find((o) => o.id === DRIFT_DATA.design)!;
const near = DRIFT_DATA.outcomes.find((o) => o.id === 'as-built')!;
const pct = (v: number) => `${Math.round(v * 100)}%`;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

const caption = (step: number, title: string, text: string) => useApp.setState({ kiosk: { step, steps: STEPS, title, text } });
const wait = (ms: number) => new Promise<void>((r) => (timer = setTimeout(r, ms)));
/** Poll until `done` holds or `maxMs` passes (false when stopped). */
async function until(done: () => boolean, maxMs: number): Promise<boolean> {
  const t0 = performance.now();
  while (running && !done() && performance.now() - t0 < maxMs) await wait(TICK);
  return running;
}

async function popUpAndSweep(): Promise<boolean> {
  const { setUI, setCamera } = useApp.getState();
  setUI({ page: 'live', compare: false, flowView: false, selection: null, follow: false });
  setCamera('aerial');
  controller.params = { ...DEFAULT_PARAMS, seed: controller.params.seed, agentBudget: controller.params.agentBudget };
  await controller.restart('sequence', null);
  controller.setSpeed(5);
  const c = () => controller.sweepline.curtain!;
  caption(1, 'Pop-up deployment', 'The early warning arrives and the curtain rises from the seabed in about a minute: no boat, no crew.');
  if (!(await until(() => c().mode === 'DEPLOYED', 40_000))) return false;
  controller.setSpeed(10);
  caption(1, 'Guide, don’t block', 'The current and gentle water jets sweep the bloom along the curtain into the recovery throat. The intake screens stay as they are.');
  if (!(await until(() => controller.sweepline.counters.released > 0, 45_000))) return false;
  setCamera('release');
  caption(1, 'Released alive', `A low-shear line carries them around the intake. In the design they leave 2 km along the shore, down-drift: ${pct(design.backAtSite)} come back, against ${pct(near.backAtSite)} released next to the intake.`);
  await wait(12_000);
  return running;
}

async function tideTurn(): Promise<boolean> {
  const { setCamera } = useApp.getState();
  setCamera('aerial');
  await controller.runScenario('tide-turn');
  const s = controller.sweepline;
  caption(2, 'The tide turns', 'Recorded current at the site, 8 Oct 2025. Here it reverses about four times a day, so a one-way barrier faces the wrong way half the time.');
  if (!(await until(() => s.handoverAt >= 0, 70_000))) return false;
  caption(2, 'Line B takes over', 'The second line pops up on the other side of the intake while Line A guides its last traffic home and settles back onto the seabed.');
  if (!(await until(() => s.guidedByLine[s.duty] >= 3, 60_000))) return false;
  caption(2, 'Nothing reaches the screens', 'Line B guides the returning bloom into its throat; both lines share one release line.');
  await wait(14_000);
  return running;
}

async function evidence(): Promise<boolean> {
  useApp.getState().setUI({ page: 'evidence' });
  const r = SEEDS_DATA.reference.reduction;
  caption(3, 'The evidence', `Same bloom, with and without SweepLine: ${pct(r.mean)} fewer jellyfish reach the intake across ${r.n} blooms. Every assumption is listed and exported with the run.`);
  await wait(14_000);
  return running;
}

export function startKiosk(): void {
  if (running) return;
  running = true;
  const stop = () => stopKiosk();
  for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) window.addEventListener(ev, stop, { once: true, capture: true });
  void (async () => {
    // Start once the opening intro has handed over.
    while (running && useApp.getState().intro) await wait(TICK);
    while (running) {
      if (!(await popUpAndSweep())) break;
      if (!(await tideTurn())) break;
      if (!(await evidence())) break;
    }
  })();
}

export function stopKiosk(): void {
  if (!running) return;
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
  useApp.setState({ kiosk: null });
  controller.setSpeed(5);
  useApp.getState().showToast('Kiosk stopped: the twin is yours', 'info');
}

/** `?kiosk=1` starts the booth loop. */
export function kioskRequested(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('kiosk') === '1';
}
