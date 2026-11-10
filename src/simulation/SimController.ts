import { ASSUMPTIONS, SPECIES } from '../config/assumptions';
import { OPERATING_ENVELOPE as E } from '../config/operatingEnvelope';
import { computeEngineMetrics, type EngineMetrics } from './metrics';
import { getScenario, type Scenario, type ScenarioStep } from './scenarios';
import { SimulationEngine, type AgentInfo } from './SimulationEngine';
import { hoursToNextTurn, tideCurrent, tideCurrentVector, tideDate } from './tide';
import { S_TRANSFERRED } from './Agent';
import { POCKET_KG } from './lift';
import { TRANSFER_TPH } from './transfer';
import {
  DEFAULT_PARAMS,
  type EngineKind,
  type EventLevel,
  type FailureKey,
  type ModuleStatus,
  type SimEvent,
  type SimParams,
  type StatusCode,
} from './types';

export type StageKey = 'install' | 'warning' | 'sonar' | 'net' | 'collect' | 'release';

export interface TimelineStage {
  key: StageKey;
  label: string;
  at: number | null;
}

export interface SystemStatus {
  code: StatusCode;
  label: string;
  detail: string;
  tone: 'ok' | 'info' | 'warn' | 'alarm';
}

export interface Constraint {
  key: string;
  label: string;
  value: string;
  limit: string;
  status: 'ok' | 'near' | 'out';
}

export interface HistorySample {
  t: number;
  /** Biomass on the screens, without and with SweepLine (t). */
  bScreens: number;
  sScreens: number;
  bTph: number;
  sTph: number;
  onNet: number;
  collected: number;
  released: number;
  head: number;
}

export interface NetSnapshot {
  name: string;
  length: number;
  panels: number;
  inPlace: number;
  active: boolean;
  head: number;
  loadFraction: number;
  panelLoadKN: number;
  relief: number;
  torn: number;
  onNetT: number;
  through: number;
  sweep: number;
  foulPct: number;
  /** Biomass it could still take before the relief head (t). */
  marginT: number;
}

export interface SimSnapshot {
  ready: boolean;
  simTime: number;
  clockMs: number;
  speed: number;
  paused: boolean;
  params: SimParams;
  scenarioId: string | null;
  scenarioName: string;
  baseline: EngineMetrics;
  sweepline: EngineMetrics;
  status: SystemStatus;
  nets: NetSnapshot[];
  transfer: {
    primary: ModuleStatus;
    standby: ModuleStatus;
    standbyEnabled: boolean;
    path: string;
    availability: number;
    flowM3h: number;
    capacityTph: number;
    pocketFill: number;
  };
  /** The screw lifts, net A's and net B's: what each funnel sensor sees and what is in each section (kg). */
  lift: {
    stations: Array<{
      name: string;
      on: boolean;
      seen: boolean;
      /** Speed of the screw taking animals, as a share of full, and its rpm. */
      speed: number;
      rpm: number;
      screw: 'duty' | 'standby';
      funnelKg: number;
      hopperKg: number;
      pocketsKg: number;
      launderKg: number;
      /** Animals left in the screw that stopped (kg), after a fault. */
      strandedKg: number;
      turningMin: number;
      starts: number;
    }>;
    inLineKg: number;
    powerKW: number;
    energyKWh: number;
    pocketKg: number;
  };
  channel: { flow: number; speed: number; waveAtNet: number; captureBand: number };
  sonar: { on: boolean; inRangeT: number; arrivalTph: number };
  constraints: Constraint[];
  timeline: TimelineStage[];
  stage: StageKey;
  events: SimEvent[];
  failures: Record<FailureKey, boolean>;
  bloom: { active: boolean; rate: number; species: string };
  selectedAgent: (AgentInfo & { engine: EngineKind }) | null;
  tide: {
    on: boolean;
    u: number;
    date: number;
    turnIn: number | null;
    trace: number[];
  };
}

export interface LoadingState {
  active: boolean;
  progress: number;
  label: string;
}

type Publisher = (snap: SimSnapshot) => void;
type LoadingPublisher = (state: LoadingState) => void;

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: 'install', label: 'Panels in' },
  { key: 'warning', label: 'Early warning' },
  { key: 'sonar', label: 'Sonar contact' },
  { key: 'net', label: 'On the net' },
  { key: 'collect', label: 'Collected' },
  { key: 'release', label: 'Released' },
];

export const FAILURE_LABELS: Record<FailureKey, string> = {
  pumpPrimary: 'Duty screws stop',
  pumpStandby: 'Standby screws stop',
  panelTear: 'Panel tears out',
  debris: 'Debris mat blinds net A',
  unitTrip: 'One unit offline',
  storm: 'Storm, Hs 1.82 m',
  surge: 'Bloom surge, ×3',
  sonarLoss: 'Sonar offline',
};

const noFailures = (): Record<FailureKey, boolean> => ({
  pumpPrimary: false,
  pumpStandby: false,
  panelTear: false,
  debris: false,
  unitTrip: false,
  storm: false,
  surge: false,
  sonarLoss: false,
});

/** The busiest panel of net A, torn out in the stress test. */
const TEAR_PANEL = 17;
/** Share of net A a debris mat blinds in the stress test. */
const DEBRIS_COVER = 0.975;
/** Highest wave recorded at the site, 2022–2025 (m). */
const STORM_HS = 1.82;

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Most of a frame the simulation may take (ms); the rest is for drawing. */
const SIM_BUDGET_MS = 5;

/**
 * Runtime controller. Owns the baseline and SweepLine engines (same seed, same bloom), advances them
 * in lock-step, records the timeline, event log and metric history, and publishes snapshots to the
 * UI at a few hertz. React never touches per-frame simulation state.
 */
export class SimController {
  params: SimParams = { ...DEFAULT_PARAMS };
  readonly baseline: SimulationEngine;
  readonly sweepline: SimulationEngine;
  speed: number = ASSUMPTIONS.sequence.runSpeed;
  /** The viewer picked a speed, so the approach time-lapse stays out of the way. */
  private userSpeed = false;
  paused = false;
  ready = false;
  /** Main-thread budget per pre-roll chunk (ms). */
  preRollSliceMs = 24;
  /** How far the next step has come (0..1): the 3D view draws the animals this far between steps. */
  alpha = 0;
  scenario: Scenario | null = null;
  failures = noFailures();
  events: SimEvent[] = [];
  timeline: TimelineStage[] = STAGES.map((s) => ({ ...s, at: null }));
  history: HistorySample[] = [];
  historyVersion = 0;
  constraints: Constraint[] = [];
  clockStart = Date.now();
  selection: { engine: EngineKind; agentId: number } | null = null;

  private publisher: Publisher | null = null;
  private loadingPublisher: LoadingPublisher | null = null;
  private acc = 0;
  private lastPublish = 0;
  private eventId = 1;
  private historyTimer = 0;
  private safetyTimer = 0;
  private savedParams: Partial<SimParams> = {};
  private script: ScenarioStep[] = [];
  private runStart = 0;
  private runToken = 0;
  /** The opening: panels going in at a watchable pace, then up to run speed. */
  private opening = false;
  private prevRelief = [false, false];
  private prevPocketFull = false;
  private prevLiftOn = [false, false];
  private prevBaseStatus = 'CLEAR';
  private prevSweepStatus = 'CLEAR';
  private prevPrimary: ModuleStatus = 'STANDBY';
  private prevStandby: ModuleStatus = 'STANDBY';

  constructor() {
    this.baseline = new SimulationEngine('baseline', this.params);
    this.sweepline = new SimulationEngine('sweepline', this.params);
    this.constraints = this.evaluate();
  }

  setPublisher(p: Publisher, loading: LoadingPublisher): void {
    this.publisher = p;
    this.loadingPublisher = loading;
  }

  get simTime(): number {
    return this.sweepline.time;
  }

  engine(kind: EngineKind): SimulationEngine {
    return kind === 'baseline' ? this.baseline : this.sweepline;
  }

  // ------------------------------------------------------------------ run control

  /** Restart both engines with the same seed and bloom. */
  async restart(start: 'sequence' | 'steady', scenario: Scenario | null = this.scenario): Promise<void> {
    const token = ++this.runToken;
    this.userSpeed = false;
    this.ready = false;
    this.scenario = scenario;
    this.params = { ...this.params, ...this.savedParams };
    this.failures = noFailures();
    this.savedParams = {};
    this.events = [];
    this.history = [];
    this.historyVersion++;
    this.timeline = STAGES.map((s) => ({ ...s, at: null }));
    this.acc = 0;
    this.alpha = 0;
    this.historyTimer = 0;
    this.safetyTimer = 0;
    this.selection = null;
    this.prevRelief = [false, false];
    this.prevPocketFull = false;
    this.prevLiftOn = [false, false];
    this.prevBaseStatus = 'CLEAR';
    this.prevSweepStatus = 'CLEAR';
    this.prevPrimary = 'STANDBY';
    this.prevStandby = 'STANDBY';
    if (this.params.tide) this.params = { ...this.params, ...this.tideAt(0) };
    this.baseline.reset(this.params, 'approach');
    this.sweepline.reset(this.params, 'approach');
    const sp = SPECIES[this.params.species];
    this.log('info', `Run started — ${scenario ? scenario.name : 'custom conditions'} · seed ${this.params.seed}`);
    this.log('info', `Bloom: ${sp.name} (${sp.latin}), ${this.params.bloomRate} t/h, drifting along the coast`);

    if (start === 'sequence') {
      for (const net of this.sweepline.nets) if (net.active) net.arm();
      this.opening = true;
      this.speed = ASSUMPTIONS.sequence.openingSpeed;
      this.log('info', 'Season start: panels going down their pile guides (time-lapse)');
    } else {
      this.opening = false;
      this.stage('install');
      this.startPumps();
      const target = scenario?.preRoll ?? ASSUMPTIONS.sequence.steadyPreRoll;
      const h = ASSUMPTIONS.sequence.preRollStep;
      this.loadingPublisher?.({ active: true, progress: 0, label: 'Running the bloom up to the net' });
      while (this.sweepline.time < target) {
        if (token !== this.runToken) return;
        const t0 = performance.now();
        while (this.sweepline.time < target && performance.now() - t0 < this.preRollSliceMs) this.stepAll(h);
        this.loadingPublisher?.({ active: true, progress: Math.min(1, this.sweepline.time / target), label: `Running the bloom up to the net · ${formatDuration(this.sweepline.time)} / ${formatDuration(target)}` });
        await nextFrame();
      }
      this.speed = ASSUMPTIONS.sequence.runSpeed;
    }
    if (token !== this.runToken) return;
    this.clockStart = Date.now() - this.sweepline.time * 1000;
    this.runStart = this.sweepline.time;
    this.script = scenario?.script ? [...scenario.script].sort((a, b) => a.at - b.at) : [];
    this.ready = true;
    this.loadingPublisher?.({ active: false, progress: 1, label: '' });
    this.publish(true);
  }

  /** Restart the current run the way it started. */
  async replay(): Promise<void> {
    await this.restart(this.scenario?.start ?? 'sequence', this.scenario);
  }

  async runScenario(id: string): Promise<void> {
    const sc = getScenario(id);
    if (!sc) return;
    this.params = { ...DEFAULT_PARAMS, seed: this.params.seed, agentBudget: this.params.agentBudget, ...sc.params };
    this.savedParams = {};
    await this.restart(sc.start, sc);
  }

  setSpeed(speed: number): void {
    this.userSpeed = true;
    this.speed = speed;
    this.opening = false;
    this.publish(true);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.publish(true);
  }

  private tideAt(t: number): Pick<SimParams, 'currentSpeed' | 'currentBearing'> {
    const v = tideCurrentVector(tideCurrent(this.params.tideStart + t / 3600));
    return { currentSpeed: v.speed, currentBearing: v.bearing };
  }

  private applyTide(t: number): void {
    const v = this.tideAt(t);
    this.params.currentSpeed = v.currentSpeed;
    this.params.currentBearing = v.currentBearing;
    this.baseline.setCurrent(v.currentSpeed, v.currentBearing);
    this.sweepline.setCurrent(v.currentSpeed, v.currentBearing);
  }

  // ------------------------------------------------------------------ parameters

  setParams(partial: Partial<SimParams>): void {
    const prev = this.params;
    this.params = { ...this.params, ...partial };
    this.baseline.applyParams(this.params);
    this.sweepline.applyParams(this.params);
    if (partial.unitsRunning !== undefined && partial.unitsRunning !== prev.unitsRunning) this.log('info', `${partial.unitsRunning} of ${ASSUMPTIONS.plant.units} units running — channel flow ${(this.sweepline.flow.plantFlow).toFixed(0)} m³/s`);
    if (partial.foulingWeeks !== undefined && partial.foulingWeeks !== prev.foulingWeeks) this.log('info', partial.foulingWeeks === 0 ? 'Clean panels in the water' : `Panels ${partial.foulingWeeks} weeks in the water`);
    if (partial.secondNet !== undefined && partial.secondNet !== prev.secondNet) this.log(partial.secondNet ? 'info' : 'warn', partial.secondNet ? 'Net B in place' : 'Net B out of the water');
    this.publish(true);
  }

  async reseed(seed: number, budget: number): Promise<void> {
    this.params = { ...this.params, seed: Math.max(1, Math.floor(seed)), agentBudget: budget };
    await this.restart('sequence', this.scenario);
  }

  endBloom(): void {
    this.baseline.bloomActive = false;
    this.sweepline.bloomActive = false;
    this.log('info', 'Bloom passing — no new arrivals upstream');
    this.publish(true);
  }

  private startPumps(): void {
    const tr = this.sweepline.transfer!;
    if (tr.armed) return;
    tr.armed = true;
    this.stage('warning');
    this.log('warn', 'Early warning received: screw lifts armed, to start when a funnel sensor sees jellyfish');
  }

  // ------------------------------------------------------------------ failure injection

  injectFailure(key: FailureKey): void {
    if (this.failures[key]) return;
    const s = this.sweepline;
    const tr = s.transfer!;
    switch (key) {
      case 'pumpPrimary':
        tr.primaryFault = true;
        break;
      case 'pumpStandby':
        tr.standbyFault = true;
        break;
      case 'panelTear':
        s.tearPanel(0, TEAR_PANEL);
        break;
      case 'debris':
        s.nets[0].debrisTarget = DEBRIS_COVER;
        break;
      case 'unitTrip':
        this.savedParams.unitsRunning ??= this.params.unitsRunning;
        this.setParams({ unitsRunning: Math.max(1, this.params.unitsRunning - 1) });
        break;
      case 'storm':
        this.savedParams.waveHeight ??= this.params.waveHeight;
        this.setParams({ waveHeight: STORM_HS });
        break;
      case 'surge': {
        this.baseline.surge = 3;
        s.surge = 3;
        const n = Math.round((this.params.agentBudget * 0.2 * this.params.bloomRate) / 25);
        this.baseline.spawnSurge(n);
        s.spawnSurge(n);
        break;
      }
      case 'sonarLoss':
        break;
    }
    this.failures = { ...this.failures, [key]: true };
    this.log(key === 'pumpPrimary' || key === 'pumpStandby' || key === 'panelTear' ? 'alarm' : 'warn', FAILURE_LABELS[key]);
    this.publish(true);
  }

  clearFailure(key: FailureKey): void {
    if (!this.failures[key]) return;
    const s = this.sweepline;
    const tr = s.transfer!;
    switch (key) {
      case 'pumpPrimary':
        tr.primaryFault = false;
        break;
      case 'pumpStandby':
        tr.standbyFault = false;
        break;
      case 'panelTear':
        s.repairPanels();
        break;
      case 'debris':
        s.nets[0].debrisTarget = 0;
        break;
      case 'unitTrip':
        this.restoreSaved('unitsRunning');
        break;
      case 'storm':
        this.restoreSaved('waveHeight');
        break;
      case 'surge':
        this.baseline.surge = 1;
        s.surge = 1;
        break;
      case 'sonarLoss':
        break;
    }
    this.failures = { ...this.failures, [key]: false };
    this.log('ok', `Cleared: ${FAILURE_LABELS[key]}`);
    this.publish(true);
  }

  clearAllFailures(): void {
    (Object.keys(this.failures) as FailureKey[]).forEach((k) => this.clearFailure(k));
  }

  private restoreSaved<K extends keyof SimParams>(key: K): void {
    const v = this.savedParams[key];
    if (v === undefined) return;
    delete this.savedParams[key];
    this.setParams({ [key]: v } as Partial<SimParams>);
  }

  select(engine: EngineKind, agentId: number | null): void {
    this.selection = agentId === null ? null : { engine, agentId };
    this.publish(true);
  }

  // ------------------------------------------------------------------ stepping

  /** Advance by real elapsed seconds. */
  frame(dtReal: number): void {
    if (this.ready && !this.paused) {
      // Until the bloom reaches the net there is nothing to watch, so the wait is time-lapsed.
      const approach = !this.opening && !this.userSpeed && this.sweepline.counters.encountered === 0;
      const h = approach ? ASSUMPTIONS.sequence.preRollStep : ASSUMPTIONS.timeStep;
      this.acc += Math.min(dtReal, 0.1) * (approach ? ASSUMPTIONS.sequence.approachSpeed : this.speed);
      const t0 = performance.now();
      while (this.acc >= h) {
        this.stepAll(h);
        this.acc -= h;
        // The simulation never takes the whole frame: what is left over waits for the next frame
        // (at most two steps' worth), so on a slow machine it runs a little slower than the set
        // speed and the picture stays smooth, instead of every frame getting longer.
        if (performance.now() - t0 > SIM_BUDGET_MS) {
          if (this.acc > 2 * h) this.acc = 2 * h;
          break;
        }
      }
      this.alpha = Math.min(1, this.acc / h);
      if (this.opening) this.updateOpening(dtReal);
    }
    this.publish(false);
  }

  private updateOpening(dtReal: number): void {
    const armed = this.sweepline.nets.every((n) => !n.arming);
    if (!armed) return;
    if (this.timeline[0].at === null) {
      this.stage('install');
      this.log('ok', 'Both nets in place');
      this.startPumps();
    }
    const target: number = ASSUMPTIONS.sequence.runSpeed;
    this.speed = Math.min(target, this.speed + (target / 3) * Math.min(dtReal, 0.1));
    if (this.speed >= target) this.opening = false;
  }

  private stepAll(dt: number): void {
    const s = this.sweepline;
    if (this.params.tide) this.applyTide(s.time + dt - 0);
    this.baseline.step(dt);
    s.step(dt);
    this.runScript();
    this.watch(dt);
    this.historyTimer -= dt;
    if (this.historyTimer <= 0) {
      this.historyTimer = 10;
      this.sampleHistory();
    }
  }

  private runScript(): void {
    const t = this.simTime - this.runStart;
    while (this.ready && this.script.length > 0 && this.script[0].at <= t) {
      const step = this.script.shift()!;
      const a = step.action;
      if (a.kind === 'fail') this.injectFailure(a.failure);
      else if (a.kind === 'clear') this.clearFailure(a.failure);
      else {
        this.log('warn', a.message);
        this.setParams(a.params);
      }
    }
  }

  /** Stages and events that follow from what the engines are doing. */
  private watch(dt: number): void {
    this.safetyTimer -= dt;
    if (this.safetyTimer > 0) return;
    this.safetyTimer = 1;
    const s = this.sweepline;
    const tr = s.transfer!;
    const c = s.counters;
    if (s.sonarKg > 200 && !this.failures.sonarLoss) {
      if (this.stageAt('sonar') === null) this.log('warn', `Sonar contact at the mouth — ${(s.sonarKg / 1000).toFixed(1)} t in range`);
      this.stage('sonar');
    }
    if (c.encountered > 0 && this.stageAt('net') === null) {
      this.stage('net');
      this.log('info', 'First animals on net A — sweeping toward the collector');
    }
    if (c.diverted > 0 && this.stageAt('collect') === null) {
      this.stage('collect');
      this.log('ok', 'Collector taking the bloom');
    }
    if (c.released > 0 && this.stageAt('release') === null) {
      this.stage('release');
      this.log('ok', 'First animals released 2 km down-drift');
    }
    s.nets.forEach((net, i) => {
      const on = net.reliefFraction > 0;
      if (on !== this.prevRelief[i]) {
        this.prevRelief[i] = on;
        this.log(on ? 'alarm' : 'ok', on ? `${net.line.name} head at the relief limit — float line dipping, water spilling over` : `${net.line.name} relief closed`);
      }
    });
    tr.stations.forEach((st, i) => {
      if (st.on !== this.prevLiftOn[i]) {
        this.prevLiftOn[i] = st.on;
        const name = i === 0 ? 'Lift A' : 'Lift B';
        if (st.on) this.log('info', `Funnel sensor sees jellyfish at net ${i === 0 ? 'A' : 'B'}: ${name} starting`);
        else this.log('info', `${name} stopped: funnel clear and its pockets empty`);
      }
    });
    const pFull = tr.queues[0].length >= s.holdCapacity;
    if (pFull !== this.prevPocketFull) {
      this.prevPocketFull = pFull;
      this.log(pFull ? 'warn' : 'ok', pFull ? 'Funnel full — the bloom is stacking up along the net' : 'Funnel clearing');
    }
    if (tr.primaryStatus !== this.prevPrimary || tr.standbyStatus !== this.prevStandby) {
      if (this.prevStandby !== 'ONLINE' && tr.standbyStatus === 'ONLINE') this.log('ok', 'Standby screws carrying the load');
      this.prevPrimary = tr.primaryStatus;
      this.prevStandby = tr.standbyStatus;
    }
    const b = this.baseline.screens.status;
    if (b !== this.prevBaseStatus) {
      this.prevBaseStatus = b;
      if (b === 'DERATED') this.log('warn', 'Without SweepLine: screens past their wash capacity');
    }
    const ss = s.screens.status;
    if (ss !== this.prevSweepStatus) {
      this.prevSweepStatus = ss;
      if (ss === 'DERATED') this.log('alarm', 'Screens past their wash capacity');
    }
    this.constraints = this.evaluate();
  }

  private stage(key: StageKey): void {
    const st = this.timeline.find((x) => x.key === key)!;
    if (st.at === null) st.at = this.simTime;
  }

  private stageAt(key: StageKey): number | null {
    return this.timeline.find((x) => x.key === key)!.at;
  }

  private currentStage(): StageKey {
    let cur: StageKey = 'install';
    for (const s of this.timeline) if (s.at !== null) cur = s.key;
    return cur;
  }

  private sampleHistory(): void {
    const b = this.baseline;
    const s = this.sweepline;
    const kg = s.kgPerAgent / 1000;
    this.history.push({
      t: s.time,
      bScreens: b.screens.totalT,
      sScreens: s.screens.totalT,
      bTph: b.screens.arrivalTph,
      sTph: s.screens.arrivalTph,
      onNet: (s.onNet[0] + s.onNet[1]) * kg,
      collected: s.counters.diverted * kg,
      released: s.counters.released * kg,
      head: s.nets[0].head,
    });
    if (this.history.length > 2400) this.history.splice(0, this.history.length - 2400);
    this.historyVersion++;
  }

  log(level: EventLevel, message: string): void {
    this.events.push({ id: this.eventId++, t: this.simTime, level, message });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  /** Mean through-speed of the panels in place on a net (m/s). */
  private meanThrough(i: number): number {
    const net = this.sweepline.nets[i];
    let sum = 0;
    let n = 0;
    for (let k = 0; k < net.n; k++) {
      if (net.torn[k]) continue;
      sum += net.through[k];
      n++;
    }
    return n ? sum / n : 0;
  }

  /** What the operator watches. Nothing here shuts anything down: it shows the margin left. */
  evaluate(): Constraint[] {
    const s = this.sweepline;
    const tr = s.transfer!;
    const net = s.nets[0];
    const U = s.flow.channelSpeed;
    const through = this.meanThrough(0);
    const sweep = U * Math.cos((20 * Math.PI) / 180) * ASSUMPTIONS.net.slide;
    const band = (v: number, near: number, max: number): Constraint['status'] => (v > max ? 'out' : v > near ? 'near' : 'ok');
    const fill = (tr.queues[0].length + tr.queues[1].length) / (2 * s.holdCapacity);
    return [
      { key: 'approach', label: E.approach.label, value: `${through.toFixed(2)} m/s`, limit: `≤ ${E.approach.max} m/s`, status: band(through, E.approach.near, E.approach.max) },
      { key: 'sweep', label: E.sweep.label, value: `${(sweep / Math.max(through, 0.01)).toFixed(1)}×`, limit: '> 1×', status: sweep < through ? 'out' : sweep < through * E.sweep.near ? 'near' : 'ok' },
      { key: 'head', label: E.head.label, value: `${(net.head * 1000).toFixed(0)} mm`, limit: `relief at ${(E.head.relief * 1000).toFixed(0)} mm`, status: band(net.head, E.head.near, E.head.relief) },
      { key: 'pocket', label: E.pocket.label, value: `${Math.round(fill * 100)} %`, limit: `≤ ${E.pocket.max} %`, status: band(fill * 100, E.pocket.near, E.pocket.max) },
      { key: 'wave', label: E.wave.label, value: `${s.channelWave.toFixed(2)} m`, limit: `≤ ${E.wave.max} m`, status: band(s.channelWave, E.wave.near, E.wave.max) },
    ];
  }

  computeStatus(): SystemStatus {
    const s = this.sweepline;
    const tr = s.transfer!;
    if (s.nets.some((n) => n.arming)) return { code: 'ARMING', label: 'Panels going in', detail: `${Math.round(s.nets[0].inPlace * 100)} % in place`, tone: 'info' };
    if (s.nets.some((n) => n.reliefFraction > 0)) return { code: 'RELIEF', label: 'Relief open', detail: 'Float line dipped: cooling flow first', tone: 'alarm' };
    if (tr.armed && !tr.poweredPathAvailable) return { code: 'OVERLOAD', label: 'Net holding', detail: 'Lifts stopped: bloom stacking on the net', tone: 'alarm' };
    if (s.nets[0].tornCount > 0) return { code: 'ELEVATED', label: 'Panel out', detail: 'Net B catching what comes through', tone: 'warn' };
    if (tr.primaryFault) return { code: 'ELEVATED', label: 'On standby', detail: tr.standbyStatus === 'ONLINE' ? 'Standby screws carrying the load' : tr.standbyStatus === 'ACTIVATING' ? 'Standby screws starting' : 'Standby screws ready', tone: 'warn' };
    const near = this.constraints.find((c) => c.status !== 'ok');
    if (near) return { code: 'ELEVATED', label: 'Watch', detail: `${near.label} ${near.value}`, tone: 'warn' };
    if (s.counters.encountered > 0) return { code: 'NOMINAL', label: 'Sweeping', detail: 'Bloom moving along the net', tone: 'ok' };
    if (tr.armed) return { code: 'WARNING', label: 'Warning received', detail: 'Lifts armed, bloom on its way', tone: 'warn' };
    return { code: 'READY', label: 'Ready', detail: 'Nets in place, awaiting warning', tone: 'ok' };
  }

  buildSnapshot(): SimSnapshot {
    const s = this.sweepline;
    const tr = s.transfer!;
    const kg = s.kgPerAgent;
    const Q = s.flow.plantFlow;
    let selectedAgent: SimSnapshot['selectedAgent'] = null;
    if (this.selection) {
      const e = this.engine(this.selection.engine);
      const slot = e.pool.findById(this.selection.agentId);
      const info = slot >= 0 ? e.agentInfo(slot) : null;
      if (info) selectedAgent = { ...info, engine: this.selection.engine };
    }
    const sp = SPECIES[this.params.species];
    const sweep = s.flow.channelSpeed * Math.cos((20 * Math.PI) / 180);
    const sMetrics = computeEngineMetrics(s);
    return {
      ready: this.ready,
      simTime: s.time,
      clockMs: this.clockStart + s.time * 1000,
      speed: this.speed,
      paused: this.paused,
      params: { ...this.params },
      scenarioId: this.scenario?.id ?? null,
      scenarioName: this.scenario?.name ?? 'Custom conditions',
      baseline: computeEngineMetrics(this.baseline),
      sweepline: sMetrics,
      status: this.computeStatus(),
      nets: s.nets.map((net, i) => {
        let foul = 0;
        for (let k = 0; k < net.n; k++) foul += net.foul[k];
        return {
          name: net.line.name,
          length: net.line.length,
          panels: net.n,
          inPlace: net.inPlace,
          active: net.active,
          head: net.head,
          loadFraction: net.loadFraction,
          panelLoadKN: net.panelLoadKN,
          relief: net.reliefFraction,
          torn: net.tornCount,
          onNetT: (s.onNet[i] * kg) / 1000,
          through: this.meanThrough(i),
          sweep,
          foulPct: (foul / net.n) * 100,
          marginT: net.marginKg(Q, s.blockPerKg) / 1000,
        };
      }),
      transfer: {
        primary: tr.primaryStatus,
        standby: tr.standbyStatus,
        standbyEnabled: tr.standbyEnabled,
        path: tr.activePath,
        availability: tr.availability(),
        flowM3h: tr.flowM3h(),
        capacityTph: TRANSFER_TPH * tr.availability(),
        pocketFill: (tr.queues[0].length + tr.queues[1].length) / (2 * s.holdCapacity),
      },
      lift: this.liftSnapshot(),
      channel: { flow: Q, speed: s.flow.channelSpeed, waveAtNet: s.channelWave, captureBand: s.flow.captureBand() },
      sonar: { on: !this.failures.sonarLoss, inRangeT: this.failures.sonarLoss ? 0 : s.sonarKg / 1000, arrivalTph: (s.enterEMA * kg * 3600) / 1000 },
      constraints: this.constraints,
      timeline: this.timeline,
      stage: this.currentStage(),
      events: this.events,
      failures: { ...this.failures },
      bloom: { active: s.bloomActive, rate: this.params.bloomRate * s.surge, species: sp.name },
      selectedAgent,
      tide: this.tideSnapshot(),
    };
  }

  private liftSnapshot(): SimSnapshot['lift'] {
    const s = this.sweepline;
    const tr = s.transfer!;
    const kg = s.kgPerAgent;
    const c = s.lift;
    const k = tr.activeScrew;
    return {
      stations: tr.stations.map((st, i) => ({
        name: i === 0 ? 'Lift A' : 'Lift B',
        on: st.on,
        seen: st.seen,
        speed: st.speed[k],
        rpm: st.speed[k] * ASSUMPTIONS.lift.rpm,
        screw: k === 0 ? 'duty' : 'standby',
        funnelKg: tr.queues[i].length * kg,
        hopperKg: c.hopper[i] * kg,
        pocketsKg: c.screw[i][k] * kg,
        launderKg: c.launder[i] * kg,
        strandedKg: c.screw[i][1 - k] * kg,
        turningMin: st.turningSeconds / 60,
        starts: st.starts,
      })),
      inLineKg: s.countState(S_TRANSFERRED) * kg,
      powerKW: tr.powerKW(),
      energyKWh: tr.energyKWh(),
      pocketKg: POCKET_KG,
    };
  }

  private tideSnapshot(): SimSnapshot['tide'] {
    const on = this.params.tide;
    const hours = this.params.tideStart + this.simTime / 3600;
    const u = on ? tideCurrent(hours) : 0;
    const trace: number[] = [];
    if (on) for (let k = -24; k <= 24; k++) trace.push(tideCurrent(hours + k * 0.25));
    return { on, u, date: on ? tideDate(hours).getTime() : 0, turnIn: on ? hoursToNextTurn(hours) : null, trace };
  }

  private publish(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastPublish < 120) return;
    this.lastPublish = now;
    this.publisher?.(this.buildSnapshot());
  }

  exportRun(): object {
    const step = Math.max(1, Math.ceil(this.history.length / 600));
    return {
      application: 'SweepLine digital twin',
      notice: [
        'Engineering design visualiser. Performance values are simulation estimates and are not field-validated.',
        'Reference coastal intake geometry is schematic and does not represent any real plant.',
      ],
      exportedAt: new Date().toISOString(),
      scenario: this.scenario ? { id: this.scenario.id, name: this.scenario.name } : { id: null, name: 'Custom conditions' },
      seed: this.params.seed,
      simulatedSeconds: Math.round(this.simTime),
      parameters: this.params,
      assumptions: ASSUMPTIONS,
      metrics: { baseline: computeEngineMetrics(this.baseline), sweepline: computeEngineMetrics(this.sweepline) },
      failures: Object.entries(this.failures)
        .filter(([, v]) => v)
        .map(([k]) => k),
      constraints: this.constraints,
      timeline: this.timeline,
      events: this.events,
      history: this.history.filter((_, i) => i % step === 0),
    };
  }

  exportCsv(): string {
    const cols: Array<keyof HistorySample> = ['t', 'bScreens', 'sScreens', 'bTph', 'sTph', 'onNet', 'collected', 'released', 'head'];
    const header = ['sim_time_s', 'baseline_screens_t', 'sweepline_screens_t', 'baseline_tph', 'sweepline_tph', 'on_net_t', 'collected_t', 'released_t', 'head_m'];
    const rows = this.history.map((h) => cols.map((c) => (Number.isInteger(h[c]) ? String(h[c]) : h[c].toFixed(4))).join(','));
    return [`# SweepLine simulation estimate — seed ${this.params.seed} — not field-validated`, header.join(','), ...rows].join('\n');
  }
}

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Application-wide controller instance. */
export const controller = new SimController();
