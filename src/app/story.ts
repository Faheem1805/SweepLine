import { controller, type RunState, type SimController, type StageKey, type StoryInfo } from '../simulation/SimController';
import type { StoryCommand, StoryMessage } from '../simulation/story.worker';

/**
 * The story timeline. A worker runs the same run as the live twin, ahead of it, and sends back a
 * recorded moment every half-minute of run time; dragging the timeline, or picking a chapter, jumps
 * the live twin to the nearest recorded moment at once. Recording starts with every run, and starts
 * again from the live moment whenever the viewer changes something (a failure, a slider), so what
 * lies ahead is always what would follow from what is on screen.
 */

/** Rough timings of the reference run, shown until the recording reaches the real ones (s). */
const GUESS: Record<StageKey, number> = { install: 30, warning: 30, sonar: 30, net: 2040, collect: 2970, release: 4470 };
const AFTER_RELEASE = 900;
/** Most recorded moments kept (about 1 MB each). */
const MAX_FRAMES = 110;

const EMPTY_STAGES = (): StoryInfo['stages'] => ({ install: null, warning: null, sonar: null, net: null, collect: null, release: null });

class StoryRecorder {
  private worker: Worker | null = null;
  private token = 0;
  private frames: RunState[] = [];
  private info: StoryInfo = { start: 0, end: GUESS.release + AFTER_RELEASE, buffered: 0, done: false, stages: EMPTY_STAGES() };
  private divergeQueued = false;
  private failed = false;

  /** Hook into the controller: record each run, and re-record ahead when the viewer changes it. */
  attach(c: SimController): void {
    c.onRestart = () => this.begin(c);
    c.onDiverge = () => {
      if (this.divergeQueued) return;
      this.divergeQueued = true;
      queueMicrotask(() => {
        this.divergeQueued = false;
        this.diverge(c);
      });
    };
  }

  private send(cmd: StoryCommand): void {
    if (this.failed) return;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('../simulation/story.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<StoryMessage>) => this.receive(e.data);
        this.worker.onerror = () => {
          this.failed = true;
          this.worker = null;
        };
      } catch {
        this.failed = true;
        return;
      }
    }
    this.worker.postMessage(cmd);
  }

  private publish(c: SimController = controller): void {
    c.story = { ...this.info, stages: { ...this.info.stages } };
  }

  /** A new run: forget the old recording and record this one from its start. */
  private begin(c: SimController): void {
    this.token++;
    this.frames = [c.captureState()];
    const stages = EMPTY_STAGES();
    for (const s of c.timeline) stages[s.key] = s.at;
    this.info = { start: c.runStartTime, end: Math.max(c.simTime + 600, GUESS.release + AFTER_RELEASE), buffered: c.simTime, done: false, stages };
    this.send({ type: 'start', token: this.token, params: { ...c.params }, scenario: c.scenario?.id ?? null, start: c.startMode });
    this.publish(c);
  }

  /** The viewer changed the run: keep what was recorded up to now, and record ahead again from here. */
  private diverge(c: SimController): void {
    const now = c.simTime;
    this.token++;
    this.frames = this.frames.filter((f) => f.t < now - 1e-6);
    const st = c.captureState();
    this.frames.push(st);
    const stages = EMPTY_STAGES();
    for (const s of c.timeline) stages[s.key] = s.at;
    this.info = { ...this.info, buffered: now, done: false, stages, end: Math.max(this.info.end, now + 600) };
    this.send({ type: 'from', token: this.token, state: st, scenario: c.scenario?.id ?? null });
    this.publish(c);
  }

  private receive(m: StoryMessage): void {
    if (m.token !== this.token) return;
    if (m.type === 'keyframe') {
      const st = m.state;
      let i = this.frames.length;
      while (i > 0 && this.frames[i - 1].t > st.t + 1e-6) i--;
      if (i > 0 && Math.abs(this.frames[i - 1].t - st.t) < 1e-6) this.frames[i - 1] = st;
      else this.frames.splice(i, 0, st);
      // Each moment holds both engines (about 1 MB): past the cap, keep every other one, so the
      // memory stays bounded and the spacing doubles evenly along the run.
      if (this.frames.length > MAX_FRAMES) this.frames = this.frames.filter((_, k, a) => k % 2 === 0 || k === a.length - 1);
      return;
    }
    this.info.buffered = Math.max(this.info.buffered, m.t);
    this.info.done = m.done;
    this.info.stages = m.stages;
    this.info.end = m.done ? this.info.buffered : Math.max(this.estimateEnd(m.stages), this.info.buffered + 120);
    this.publish();
  }

  private estimateEnd(st: StoryInfo['stages']): number {
    const rel = st.release ?? Math.max(GUESS.release, (st.collect ?? GUESS.collect) + 1500);
    return rel + AFTER_RELEASE;
  }

  /** Earliest and latest run time the timeline can jump to now (s). */
  get range(): [number, number] {
    if (this.frames.length === 0) return [this.info.start, this.info.start];
    return [this.frames[0].t, this.frames[this.frames.length - 1].t];
  }

  /** Jump the live twin to the recorded moment nearest at or before `t`. Returns the time reached. */
  seek(t: number): number | null {
    // Not while a run is starting (its pre-roll): the recording is still the last run's.
    if (this.frames.length === 0 || !controller.ready) return null;
    let lo = 0;
    let hi = this.frames.length - 1;
    if (t >= this.frames[hi].t) lo = hi;
    else {
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (this.frames[mid].t <= t + 1e-6) lo = mid;
        else hi = mid - 1;
      }
    }
    const f = this.frames[lo];
    if (Math.abs(f.t - controller.simTime) < 1e-6) return f.t;
    controller.restoreState(f);
    this.publish();
    return f.t;
  }
}

export const story = new StoryRecorder();
