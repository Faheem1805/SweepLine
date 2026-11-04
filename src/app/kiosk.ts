import { CHALLENGES } from '../config/challenges';
import { controller } from '../simulation/SimController';
import { DEFAULT_PARAMS } from '../simulation/types';
import { useApp } from './store';

/**
 * Booth kiosk (`?kiosk=1`): a self-running loop for a stand where nobody is at the controls.
 * It runs the reference bloom, then the problems a judge is most likely to ask about, each as the
 * same live scenario the problem cards run. Captions follow the simulation's state, so they always
 * match the scene. Any click, key or scroll hands control back.
 */

export interface KioskCaption {
  step: number;
  steps: number;
  title: string;
  text: string;
}

/** The problems the loop shows, in order. */
const TOUR = ['tide', 'under', 'fail', 'dam', 'dark'] as const;
const STEPS = TOUR.length + 1;
const TICK = 400;
/** How long each problem runs once its answer is on screen (ms). */
const PROBLEM_TIME = 22_000;

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

async function reference(): Promise<boolean> {
  const { setUI, setCamera, setActiveChallenge } = useApp.getState();
  setUI({ page: 'live', compare: false, flowView: false, selection: null, follow: false });
  setActiveChallenge(null);
  setCamera('aerial');
  controller.params = { ...DEFAULT_PARAMS, seed: controller.params.seed, agentBudget: controller.params.agentBudget };
  await controller.restart('sequence', null);
  caption(1, 'A bloom reaches the channel', 'The plant draws its water through one channel. Two nets stand across it. The water passes through and the jellyfish cannot.');
  if (!(await until(() => controller.sweepline.counters.diverted > 40, 60_000))) return false;
  setCamera('collector');
  caption(1, 'Swept to the collector', 'The plant’s own flow carries them along the net to a pocket at the wall. A screw lift sends them over the breakwater and 2 km down the coast.');
  await wait(16_000);
  return running;
}

async function problem(id: (typeof TOUR)[number], step: number): Promise<boolean> {
  const c = CHALLENGES.find((x) => x.id === id);
  if (!c) return running;
  const { setUI, setCamera, setActiveChallenge } = useApp.getState();
  setActiveChallenge(c.id);
  setUI({ flowView: !!c.engineering, compare: !!c.compare, selection: null, follow: false });
  setCamera(c.camera);
  await controller.runScenario(c.scenario);
  caption(step, c.problem, c.trap);
  await wait(9_000);
  if (!running) return false;
  caption(step, 'What we did', c.answer);
  await wait(PROBLEM_TIME);
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
      if (!(await reference())) break;
      let step = 2;
      for (const id of TOUR) {
        if (!(await problem(id, step++))) break;
      }
    }
  })();
}

export function stopKiosk(): void {
  if (!running) return;
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
  useApp.setState({ kiosk: null });
  useApp.getState().setActiveChallenge(null);
  useApp.getState().showToast('Kiosk stopped: the twin is yours', 'info');
}

/** `?kiosk=1` starts the booth loop. */
export function kioskRequested(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('kiosk') === '1';
}
