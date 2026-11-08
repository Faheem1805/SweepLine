import { ASSUMPTIONS } from '../config/assumptions';
import { SITE } from '../config/site';
import { netArc, netDistance, type Funnel } from './geometry';
import type { AssistMode } from './types';

/**
 * Experimental sweep assist at one funnel mouth. OFF by default: the design works without it, and
 * nothing here is tested.
 *
 * A small variable-speed seawater pump, with its own screened intake behind the net, feeds a spray
 * bar on the net's bloom face just ahead of the mouth. The outlets push water along the mesh, into
 * the mouth. That is all it does: it adds a bounded, local velocity to the water, which the animals
 * then feel like any other flow. It does not speed up the channel, does not move animals by itself,
 * and does not free an animal snagged on the mesh (whether a jet would is a separate question for a
 * flume). It is a different circuit from the screw lifts and the release line.
 */

/** What the controller reads. In the model these are exact; on site each comes from a sensor. */
export interface AssistSensors {
  /** Biomass in the funnel and on the net in the approach zone (kg). On site: imaging sonar at the mouth. */
  presentKg: number;
  /** Biomass within a few metres of the mouth line (kg). On site: the same sonar. */
  mouthKg: number;
  /** Sweep: mean speed along the net of animals on it ahead of the spray bar, where the jets cannot reach (m/s); NaN with none there. On site: sonar tracking, or a current meter there for the water. */
  speed: number;
  /** Pocket full. On site: a level or camera count in the pocket. */
  pocketFull: boolean;
  /** A screw lift is running and can take animals. On site: the lift controller. */
  liftAvailable: boolean;
  /** Head across the net (m). On site: the level sensors either side of the net. */
  head: number;
  /** Relief open on this net. On site: float-line position. */
  relief: boolean;
}

export type AssistInterlock = 'pocket' | 'lift' | 'relief' | 'head';

const EMPTY: AssistSensors = { presentKg: 0, mouthKg: 0, speed: Number.NaN, pocketFull: false, liftAvailable: true, head: 0, relief: false };

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const A = ASSUMPTIONS.assist;

/** Pump flow at full speed (m³/s): jets' momentum flux = the layer's, ρ·Q·v_jet = ρ·U²·(layer × depth). */
export function assistFlowM3s(): number {
  return (A.addSpeed * A.addSpeed * A.layer * SITE.channel.depth) / A.jetSpeed;
}

/** Pump power at full speed (kW): ρ·g·Q·H ÷ η. */
export function assistPowerKW(): number {
  return (1025 * 9.81 * assistFlowM3s() * A.head) / A.efficiency / 1000;
}

export class AssistUnit {
  readonly funnel: Funnel;
  mode: AssistMode = 'off';
  /** Pump speed now, as a share of full (0..1). */
  speed = 0;
  /** Auto wants it running. */
  demand = false;
  /** Interlock holding it off, or null. */
  interlock: AssistInterlock | null = null;
  /** Smoothed animal speed along the net at the mouth (m/s), NaN with none there. */
  speedEMA = Number.NaN;
  /** Pump running time (s), energy (kWh) and starts, since the run began. */
  runtime = 0;
  energyKWh = 0;
  starts = 0;
  /** Why it is on, off or held off, in words. */
  reason = 'Off: passive guidance only';
  sensors: AssistSensors = { ...EMPTY };
  private condFor = 0;
  private clearFor = 0;
  private runFor = 0;
  private holdFor = 0;
  private cause: AssistInterlock | null = null;

  constructor(funnel: Funnel) {
    this.funnel = funnel;
  }

  reset(mode: AssistMode): void {
    this.mode = mode;
    this.speed = 0;
    this.demand = false;
    this.interlock = null;
    this.cause = null;
    this.speedEMA = Number.NaN;
    this.runtime = 0;
    this.energyKWh = 0;
    this.starts = 0;
    this.condFor = 0;
    this.clearFor = 0;
    this.runFor = 0;
    this.holdFor = 0;
    this.sensors = { ...EMPTY };
    this.reason = mode === 'off' ? 'Off: passive guidance only' : 'Idle';
  }

  setMode(mode: AssistMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.demand = false;
    this.condFor = 0;
    this.clearFor = 0;
    this.runFor = 0;
  }

  /** Power drawn now (kW): full power × speed³ (pump affinity laws). */
  get powerKW(): number {
    return assistPowerKW() * this.speed * this.speed * this.speed;
  }

  update(dt: number, s: AssistSensors): void {
    this.sensors = s;
    if (Number.isFinite(s.speed)) this.speedEMA = Number.isFinite(this.speedEMA) ? this.speedEMA + (s.speed - this.speedEMA) * (1 - Math.exp(-dt / 30)) : s.speed;
    else this.speedEMA = Number.NaN;

    // Interlocks: any one holds the pump off, and keeps holding it a while after it clears.
    const cause: AssistInterlock | null = s.pocketFull ? 'pocket' : !s.liftAvailable ? 'lift' : s.relief ? 'relief' : s.head >= A.headLimit ? 'head' : null;
    this.cause = cause;
    if (cause) {
      this.interlock = cause;
      this.holdFor = A.interlockHold;
    } else if (this.interlock) {
      this.holdFor -= dt;
      if (this.holdFor <= 0) this.interlock = null;
    }

    // Auto: slow or crowding animals, held for a while, start it; clear for longer stops it.
    const present = s.presentKg >= A.presentKg;
    const slow = present && Number.isFinite(this.speedEMA) && this.speedEMA < (this.demand ? A.slowOff : A.slowOn);
    const crowd = present && s.mouthKg >= (this.demand ? A.crowdOffKg : A.crowdOnKg);
    const cond = slow || crowd;
    if (this.mode === 'auto') {
      if (!this.demand) {
        this.condFor = cond ? this.condFor + dt : 0;
        if (this.condFor >= A.onDelay) {
          this.demand = true;
          this.runFor = 0;
          this.clearFor = 0;
        }
      } else {
        this.runFor += dt;
        this.clearFor = cond ? 0 : this.clearFor + dt;
        if (this.clearFor >= A.offDelay && this.runFor >= A.minRun) {
          this.demand = false;
          this.condFor = 0;
        }
      }
    } else {
      this.demand = false;
      this.condFor = 0;
      this.clearFor = 0;
      this.runFor = 0;
    }

    const target = this.mode === 'off' || this.interlock ? 0 : this.mode === 'manual' ? A.manualSpeed : this.demand ? 1 : 0;
    const was = this.speed;
    if (target > this.speed) this.speed = Math.min(target, this.speed + dt / A.rampUp);
    else this.speed = Math.max(target, this.speed - dt / A.rampDown);
    if (this.speed > 0.01) {
      this.runtime += dt;
      if (was <= 0.01) this.starts++;
    }
    this.energyKWh += (this.powerKW * dt) / 3600;
    this.reason = this.explain(present, slow, crowd, cond);
  }

  private explain(present: boolean, slow: boolean, crowd: boolean, cond: boolean): string {
    const s = this.sensors;
    const v = (x: number) => `${x.toFixed(2)} m/s`;
    if (this.mode === 'off') return 'Off: passive guidance only';
    if (this.interlock) {
      const clearing = this.cause === null ? ' (clearing)' : '';
      if (this.interlock === 'pocket') return `Held off: pocket full, nowhere for animals to go${clearing}`;
      if (this.interlock === 'lift') return `Held off: no screw lift running${clearing}`;
      if (this.interlock === 'relief') return `Held off: relief open on this net${clearing}`;
      return `Held off: head ${(s.head * 1000).toFixed(0)} mm, limit ${(A.headLimit * 1000).toFixed(0)} mm${clearing}`;
    }
    if (this.mode === 'manual') return this.speed < A.manualSpeed - 0.01 ? `Manual test: ramping up, ${Math.round(this.speed * 100)} %` : `Manual test at ${Math.round(this.speed * 100)} %`;
    if (!this.demand) {
      if (!present) return 'Idle: no animals at the funnel';
      if (cond) return `Watching: ${slow ? `sweep ${v(this.speedEMA)}` : `${Math.round(s.mouthKg)} kg at the mouth`}, ${Math.round(this.condFor)} of ${A.onDelay} s`;
      return Number.isFinite(this.speedEMA) ? `Idle: sweep ${v(this.speedEMA)}` : 'Idle: animals at the funnel';
    }
    if (cond) return slow ? `On: sweep ${v(this.speedEMA)}, below ${v(A.slowOff)}` : `On: ${Math.round(s.mouthKg)} kg crowding the mouth`;
    if (this.runFor < A.minRun) return `On: clear, finishing its minimum run, ${Math.round(this.runFor)} of ${A.minRun} s`;
    return `On: clear for ${Math.round(this.clearFor)} of ${A.offDelay} s`;
  }

  /**
   * Add the jets' water velocity at (x, z) to `out`. Along the mesh, toward the mouth; strongest at
   * the net face over the bar, falling off away from the net and past the last outlet. Zero when
   * the pump is stopped, and never more than `addSpeed` anywhere.
   */
  addVelocity(x: number, z: number, out: { x: number; z: number }): void {
    if (this.speed <= 0) return;
    const F = this.funnel;
    const L = F.line;
    const s = netArc(L, x, z);
    if (s < F.barS0 - 1 || s > F.entryS) return;
    const w = netDistance(L, x, z);
    if (w < -0.1 || w > 5 * A.layer) return;
    const along = s <= F.barS1 ? smoothstep(F.barS0 - 1, F.barS0 + 2, s) : Math.exp(-(s - F.barS1) / A.decay);
    const v = A.addSpeed * this.speed * along * Math.exp(-Math.max(0, w) / A.layer);
    out.x += L.tx * v;
    out.z += L.tz * v;
  }
}
