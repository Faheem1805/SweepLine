import { ASSUMPTIONS } from '../config/assumptions';
import { BUCKET_RATE } from './lift';
import { sizeLine } from './sizing';
import type { ModuleStatus } from './types';

const T = ASSUMPTIONS.transfer;
const LIFT = ASSUMPTIONS.lift;
const SENSOR = ASSUMPTIONS.funnelSensor;
/** Power to lift the line's water to the head tank, in the buckets and by the feed pump, at full speed (kW). */
const LIFT_KW = sizeLine().kW;

/** Biomass the line can carry (t/h): its water flow at the jellyfish fraction it is limited to. */
export const TRANSFER_TPH = (T.designFlowM3h * T.maxJellyFraction * 1025) / 1000;

export type TransferPath = 'PRIMARY' | 'STANDBY' | 'NONE';

/** The bucket elevator: its funnel sensor, the chain, and what it has used. */
export class LiftStation {
  /** Buckets that have passed the scoop so far: sets where every bucket is (one per `PITCH` of chain). */
  phase = 0;
  /** `phase` at the start of the last step, for drawing between steps. */
  prevPhase = 0;
  /** Chain speed as a share of full. */
  speed = 0;
  /** What the funnel sensor saw at its last reading (kg), and how long anything seen has waited for a start (s). */
  seenKg = 0;
  waitTime = 0;
  /** Told to run. */
  on = false;
  /** Seconds since started, and since it last saw jellyfish with nothing left to carry. */
  runTime = 0;
  idleTime = 0;
  private pingTimer = 0;
  /** Room left in the buckets passing the scoop (agents). */
  credit = 0;
  /** Bucket now passing the scoop, and how many animals are in it. */
  fillBucket = -1;
  fillCount = 0;
  /** Seconds running, starts, and energy drawn (kWh), this run. */
  turningSeconds = 0;
  starts = 0;
  energyKWh = 0;

  get turning(): boolean {
    return this.speed > 0.02;
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
 * The collector machinery: one bucket elevator at net B's end (both nets' catch ends up in its
 * funnel), with twin drives on its head shaft, duty and standby; a clean-water feed pump that tops
 * the head tank up; and the release line. The early warning arms it; it runs only while its funnel
 * sensor sees jellyfish, and stops once the funnel is clear and its buckets have emptied. With no
 * drive able to run, the funnel fills and the bloom backs up along net B, which goes on holding it.
 */
export class TransferState {
  primaryFault = false;
  standbyFault = false;
  standbyEnabled = true;
  /** Standby switch-over 0..1 while it is brought in after a duty fault. */
  standbyRamp = 0;
  /** Armed by the early warning: the elevator starts on its own when the sensor sees jellyfish. */
  armed = false;
  /** Agents/s the line carries at capacity, for the current biomass per agent. */
  designRate = 1;

  readonly lift = new LiftStation();
  /** FIFO of agent slots waiting in each net's funnel. Only net B has one: net A's end is open. */
  readonly queues: [number[], number[]] = [[], []];
  /** Agents entering the line per second (EMA). */
  processedEMA = 0;

  get queueLength(): number {
    return this.queues[0].length + this.queues[1].length;
  }

  get turning(): boolean {
    return this.lift.turning;
  }

  /** The drive turning the chain now: duty unless it has failed. */
  get activeDrive(): 0 | 1 {
    return this.primaryFault ? 1 : 0;
  }

  get primaryStatus(): ModuleStatus {
    if (this.primaryFault) return 'FAULT';
    return this.lift.turning ? 'ONLINE' : 'STANDBY';
  }

  get standbyStatus(): ModuleStatus {
    if (!this.standbyEnabled) return 'DISABLED';
    if (this.standbyFault) return 'FAULT';
    if (this.primaryFault && this.armed) {
      if (this.standbyRamp < 1) return 'ACTIVATING';
      return this.lift.turning ? 'ONLINE' : 'STANDBY';
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

  /** Capacity ready to run, as a fraction of design (whether or not the chain is moving now). */
  availability(): number {
    if (!this.armed) return 0;
    if (!this.primaryFault) return 1;
    return this.standbyEnabled && !this.standbyFault ? this.standbyRamp : 0;
  }

  capacityRate(): number {
    return this.designRate * this.availability();
  }

  /** Line flow now as a share of its design flow: the feed pump runs with the elevator. */
  lineFlow(): number {
    return Math.min(1, this.lift.speed);
  }

  /** Water going down the line now (m³/h). */
  flowM3h(): number {
    return T.designFlowM3h * this.lineFlow();
  }

  /** Power the elevator and feed pump draw now (kW). */
  powerKW(): number {
    return LIFT_KW * this.lift.speed;
  }

  /** Energy drawn this run (kWh). */
  energyKWh(): number {
    return this.lift.energyKWh;
  }

  update(dt: number): void {
    const want = this.primaryFault && this.standbyEnabled && !this.standbyFault && this.armed;
    if (want) this.standbyRamp = Math.min(1, this.standbyRamp + dt / T.standbyActivationTime);
    else this.standbyRamp = Math.max(0, this.standbyRamp - dt / 3);
  }

  /**
   * Start and stop the elevator from its funnel sensor, and move the chain.
   * `seesKg`: jellyfish in the funnel or hopper now (kg). `loaded`: animals still in the hopper or in
   * the buckets, which it must carry up before it may stop. `lineLoaded`: animals still in the
   * release line, which moves only while the feed pump runs, so it runs on until the line is flushed.
   * `hold`: an animal that must not be lifted is in the hopper (a turtle): the chain waits.
   */
  control(dt: number, seesKg: number, loaded: boolean, lineLoaded: boolean, hold = false): void {
    const st = this.lift;
    const can = this.armed && this.poweredPathAvailable;
    const perBucket = this.designRate / BUCKET_RATE;
    st.sense(dt, seesKg);
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
      st.idleTime = st.seen || loaded ? 0 : st.idleTime + dt;
      if (!can || (st.idleTime >= SENSOR.runOn && st.runTime >= SENSOR.minRun && !lineLoaded)) st.on = false;
    }
    const failed = !this.poweredPathAvailable;
    const max = this.primaryFault ? this.standbyRamp : 1;
    const target = st.on && !failed && !hold ? max : 0;
    // A failed drive lets the chain stop in a second or two; otherwise it ramps on its soft starter.
    const step = failed || hold ? dt / 1.5 : dt / LIFT.rampTime;
    st.speed = st.speed < target ? Math.min(target, st.speed + step) : Math.max(target, st.speed - step);
    const buckets = st.speed * BUCKET_RATE * dt;
    st.prevPhase = st.phase;
    st.phase += buckets;
    st.credit = Math.min(st.credit + buckets * perBucket, perBucket * 2);
    st.energyKWh += (LIFT_KW * st.speed * dt) / 3600;
    if (st.turning) st.turningSeconds += dt;
    if (!st.on && !st.turning) st.credit = 0;
  }
}
