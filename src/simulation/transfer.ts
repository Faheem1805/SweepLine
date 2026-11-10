import { ASSUMPTIONS } from '../config/assumptions';
import { POCKET_RATE } from './lift';
import { sizeLine } from './sizing';
import type { ModuleStatus } from './types';

const T = ASSUMPTIONS.transfer;
const LIFT = ASSUMPTIONS.lift;
const SENSOR = ASSUMPTIONS.funnelSensor;
/** Power one screw draws at full speed (kW). */
const SCREW_KW = sizeLine().kW;

/** Biomass the line can carry (t/h): its water flow at the jellyfish fraction it is limited to. */
export const TRANSFER_TPH = (T.designFlowM3h * T.maxJellyFraction * 1025) / 1000;

export type TransferPath = 'PRIMARY' | 'STANDBY' | 'NONE';

/** One net's screw lift: its funnel sensor, and the duty and standby screws in its hopper. */
export class LiftStation {
  /** Pockets closed off at the bottom so far, per screw (duty, standby): sets where every pocket is. */
  readonly phase = [0, 0];
  /** Speed as a share of full, per screw. */
  readonly speed = [0, 0];
  /** What the funnel sensor saw at its last reading (kg), and how long anything seen has waited for a start (s). */
  seenKg = 0;
  waitTime = 0;
  /** Told to run. */
  on = false;
  /** Seconds since started, and since it last saw jellyfish with nothing left to carry. */
  runTime = 0;
  idleTime = 0;
  private pingTimer = 0;
  /** Room left in the pockets passing the bottom (agents). */
  credit = 0;
  /** Pocket now closing at the bottom of each screw, and how many animals are in it. */
  readonly fillPocket = [-1, -1];
  readonly fillCount = [0, 0];
  /** Seconds turning, starts, and energy drawn (kWh), this run. */
  turningSeconds = 0;
  starts = 0;
  energyKWh = 0;

  reset(): void {
    this.phase.fill(0);
    this.speed.fill(0);
    this.seenKg = 0;
    this.waitTime = 0;
    this.on = false;
    this.runTime = 0;
    this.idleTime = 0;
    this.pingTimer = 0;
    this.credit = 0;
    this.fillPocket.fill(-1);
    this.fillCount.fill(0);
    this.turningSeconds = 0;
    this.starts = 0;
    this.energyKWh = 0;
  }

  get turning(): boolean {
    return this.speed[0] > 0.02 || this.speed[1] > 0.02;
  }

  /** The funnel sensor sees jellyfish. */
  get seen(): boolean {
    return this.seenKg > 0;
  }

  /** Funnel sensor: takes a reading every `period` s. */
  sense(dt: number, kg: number): void {
    this.pingTimer -= dt;
    if (this.pingTimer <= 0) {
      this.pingTimer += SENSOR.period;
      this.seenKg = kg;
    }
  }
}

/**
 * The collector machinery: a screw lift at each net's end, each with a duty and a standby screw, a
 * head tank and the release line. The duty screws share one power feed and the standby screws the
 * other, so "duty stops" stops both duty screws. The early warning arms the lifts; each lift turns
 * only while its funnel sensor sees jellyfish, and stops once the funnel is clear and its pockets
 * have emptied. With no screw able to run, the funnels fill and the bloom backs up along the net,
 * which goes on holding it.
 */
export class TransferState {
  primaryFault = false;
  standbyFault = false;
  standbyEnabled = true;
  /** Standby switch-over 0..1 while it is brought in after a duty fault. */
  standbyRamp = 0;
  /** Armed by the early warning: the lifts start on their own when their sensor sees jellyfish. */
  armed = false;
  /** Agents/s the line carries at capacity, for the current biomass per agent. */
  designRate = 1;

  readonly stations: [LiftStation, LiftStation] = [new LiftStation(), new LiftStation()];
  /** FIFO of agent slots waiting in each net's funnel. */
  readonly queues: [number[], number[]] = [[], []];
  /** Agents entering the line per second (EMA). */
  processedEMA = 0;

  get queueLength(): number {
    return this.queues[0].length + this.queues[1].length;
  }

  /** The screw that takes new animals: duty unless it has failed. */
  get activeScrew(): 0 | 1 {
    return this.primaryFault ? 1 : 0;
  }

  get turning(): boolean {
    return this.stations[0].turning || this.stations[1].turning;
  }

  get primaryStatus(): ModuleStatus {
    if (this.primaryFault) return 'FAULT';
    return this.stations.some((s) => s.speed[0] > 0.02) ? 'ONLINE' : 'STANDBY';
  }

  get standbyStatus(): ModuleStatus {
    if (!this.standbyEnabled) return 'DISABLED';
    if (this.standbyFault) return 'FAULT';
    if (this.primaryFault && this.armed) {
      if (this.standbyRamp < 1) return 'ACTIVATING';
      return this.stations.some((s) => s.speed[1] > 0.02) ? 'ONLINE' : 'STANDBY';
    }
    return 'STANDBY';
  }

  get poweredPathAvailable(): boolean {
    if (!this.primaryFault) return true;
    return this.standbyEnabled && !this.standbyFault;
  }

  get activePath(): TransferPath {
    if (!this.armed) return 'NONE';
    if (!this.primaryFault) return 'PRIMARY';
    if (this.standbyEnabled && !this.standbyFault && this.standbyRamp > 0.05) return 'STANDBY';
    return 'NONE';
  }

  /** Capacity ready to run, as a fraction of design (whether or not a screw is turning now). */
  availability(): number {
    if (!this.armed) return 0;
    if (!this.primaryFault) return 1;
    return this.standbyEnabled && !this.standbyFault ? this.standbyRamp : 0;
  }

  capacityRate(): number {
    return this.designRate * this.availability();
  }

  /** Line flow now as a share of its design flow: what the turning screws lift, up to what the line takes. */
  lineFlow(): number {
    let s = 0;
    for (const st of this.stations) s += st.speed[0] + st.speed[1];
    return Math.min(1, s);
  }

  /** Water going down the line now (m³/h). */
  flowM3h(): number {
    return T.designFlowM3h * this.lineFlow();
  }

  /** Power the screws draw now (kW). */
  powerKW(): number {
    let s = 0;
    for (const st of this.stations) s += st.speed[0] + st.speed[1];
    return SCREW_KW * s;
  }

  /** Energy the screws have drawn this run (kWh). */
  energyKWh(): number {
    return this.stations[0].energyKWh + this.stations[1].energyKWh;
  }

  update(dt: number): void {
    const want = this.primaryFault && this.standbyEnabled && !this.standbyFault && this.armed;
    if (want) this.standbyRamp = Math.min(1, this.standbyRamp + dt / T.standbyActivationTime);
    else this.standbyRamp = Math.max(0, this.standbyRamp - dt / 3);
  }

  /**
   * Start and stop each lift from its funnel sensor, and turn the screws.
   * `seesKg`: jellyfish in that net's funnel or hopper now (kg). `loaded`: animals still in its hopper or in
   * the pockets of the screw that is turning, which it must carry up before it may stop.
   * `lineLoaded`: animals still in the release line. The line moves only while a screw feeds it, so
   * the last lift to stop runs on until the line is flushed and nothing is left in a still pipe.
   */
  control(dt: number, seesKg: readonly [number, number], loaded: readonly [boolean, boolean], lineLoaded: boolean): void {
    const can = this.armed && this.poweredPathAvailable;
    const perPocket = this.designRate / POCKET_RATE;
    const active = this.activeScrew;
    for (let n = 0; n < 2; n++) {
      const st = this.stations[n];
      st.sense(dt, seesKg[n]);
      if (!st.on) {
        st.waitTime = st.seen ? st.waitTime + dt : 0;
        if (can && (st.seenKg >= SENSOR.startKg || (st.seen && st.waitTime >= SENSOR.maxWait))) {
          st.on = true;
          st.waitTime = 0;
          st.runTime = 0;
          st.idleTime = 0;
          st.starts++;
        }
      } else {
        st.runTime += dt;
        st.idleTime = st.seen || loaded[n] ? 0 : st.idleTime + dt;
        const flushing = lineLoaded && !this.stations[1 - n].on;
        if (!can || (st.idleTime >= SENSOR.runOn && st.runTime >= SENSOR.minRun && !flushing)) st.on = false;
      }
      let turning = false;
      for (let k = 0; k < 2; k++) {
        const failed = k === 0 ? this.primaryFault : this.standbyFault || !this.standbyEnabled;
        const max = k === 0 ? 1 : this.primaryFault ? this.standbyRamp : 0;
        const target = st.on && !failed ? max : 0;
        // A failed drive stops the screw in a second or two; otherwise it ramps on its soft starter.
        const step = failed ? dt / 1.5 : dt / LIFT.rampTime;
        const v = st.speed[k];
        st.speed[k] = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
        const pockets = st.speed[k] * POCKET_RATE * dt;
        st.phase[k] += pockets;
        if (k === active) st.credit = Math.min(st.credit + pockets * perPocket, perPocket * 2);
        st.energyKWh += (SCREW_KW * st.speed[k] * dt) / 3600;
        if (st.speed[k] > 0.02) turning = true;
      }
      if (turning) st.turningSeconds += dt;
      if (!st.on && !st.turning) st.credit = 0;
    }
  }
}
