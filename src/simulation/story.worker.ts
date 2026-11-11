/// <reference lib="webworker" />
/**
 * Story worker: runs the same run as the live twin, as fast as it can, on its own thread, and posts
 * back a recorded moment every `KEYFRAME` seconds of run time. The live view can then jump to any
 * recorded moment at once, backward or ahead of where it is, without re-running the bloom.
 */
import { getScenario } from './scenarios';
import { buffersOf } from './snapshot';
import { SimController, type RunState, type StageKey, type StoryInfo } from './SimController';
import type { SimParams } from './types';

export type StoryCommand =
  /** Record a run from its start, as the live view started it. */
  | { type: 'start'; token: number; params: SimParams; scenario: string | null; start: 'sequence' | 'steady' }
  /** Carry on recording from a moment of the live run (after the viewer changed something). */
  | { type: 'from'; token: number; state: RunState; scenario: string | null }
  | { type: 'stop' };

export type StoryMessage =
  | { type: 'keyframe'; token: number; state: RunState }
  | { type: 'progress'; token: number; t: number; end: number; done: boolean; stages: StoryInfo['stages'] };

/** Run time between recorded moments (s). */
export const KEYFRAME = 30;
/** Run time recorded past the first release (s), and at most past the start. */
const AFTER_RELEASE = 900;
const LONGEST = 2 * 3600;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let token = 0;

function stages(c: SimController): StoryInfo['stages'] {
  const out = {} as StoryInfo['stages'];
  for (const s of c.timeline) out[s.key as StageKey] = s.at;
  return out;
}

function endOf(c: SimController, start: number): number {
  const rel = c.timeline.find((s) => s.key === 'release')?.at ?? null;
  return rel !== null ? Math.min(start + LONGEST, rel + AFTER_RELEASE) : start + LONGEST;
}

function post(msg: StoryMessage): void {
  if (msg.type === 'keyframe') ctx.postMessage(msg, buffersOf(msg.state));
  else ctx.postMessage(msg);
}

async function record(c: SimController, my: number, start: number): Promise<void> {
  let next = Math.floor(c.simTime / KEYFRAME) * KEYFRAME + KEYFRAME;
  post({ type: 'keyframe', token: my, state: c.captureState() });
  while (my === token) {
    const end = endOf(c, start);
    if (c.simTime >= end) {
      post({ type: 'progress', token: my, t: c.simTime, end, done: true, stages: stages(c) });
      return;
    }
    const t0 = performance.now();
    while (performance.now() - t0 < 40 && c.simTime < end) {
      c.advance();
      if (c.simTime >= next) {
        post({ type: 'keyframe', token: my, state: c.captureState() });
        next += KEYFRAME;
      }
    }
    post({ type: 'progress', token: my, t: c.simTime, end: endOf(c, start), done: false, stages: stages(c) });
    // Let a newer command in.
    await new Promise((r) => setTimeout(r, 0));
  }
}

ctx.onmessage = async (e: MessageEvent<StoryCommand>) => {
  const m = e.data;
  if (m.type === 'stop') {
    token++;
    return;
  }
  token = m.token;
  const my = m.token;
  const c = new SimController();
  const scenario = m.scenario ? (getScenario(m.scenario) ?? null) : null;
  if (m.type === 'start') {
    c.params = { ...m.params };
    await c.restart(m.start, scenario);
  } else {
    c.adopt(m.state, scenario);
  }
  if (my !== token) return;
  await record(c, my, c.runStartTime);
};
