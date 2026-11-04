import { ASSUMPTIONS } from '../config/assumptions';
import type { ModuleStatus } from './types';

const T = ASSUMPTIONS.transfer;

/** Biomass the line can carry (t/h): its water flow at the jellyfish fraction it is limited to. */
export const TRANSFER_TPH = (T.designFlowM3h * T.maxJellyFraction * 1025) / 1000;

export type TransferPath = 'PRIMARY' | 'STANDBY' | 'NONE';

/**
 * Collector pumps and the release line. A gentle low-lift pump with a standby beside it draws from
 * both nets' pockets into a head tank; the line runs by gravity from there. With no pump running the
 * pockets fill and animals back up along the net, which goes on holding them.
 */
export class TransferState {
  primaryFault = false;
  standbyFault = false;
  standbyEnabled = true;
  /** Standby ramp 0..1 while it spins up. */
  standbyRamp = 0;
  /** Pumps are running (the early warning starts them). */
  running = false;
  /** Agents/s at full capacity for the current biomass per agent. */
  designRate = 1;

  tokens = 0;
  /** FIFO of agent slots waiting in each net's pocket. */
  readonly queues: [number[], number[]] = [[], []];
  processedEMA = 0;

  get queueLength(): number {
    return this.queues[0].length + this.queues[1].length;
  }

  get primaryStatus(): ModuleStatus {
    if (this.primaryFault) return 'FAULT';
    return this.running ? 'ONLINE' : 'STANDBY';
  }

  get standbyStatus(): ModuleStatus {
    if (!this.standbyEnabled) return 'DISABLED';
    if (this.standbyFault) return 'FAULT';
    if (this.primaryFault && this.running) return this.standbyRamp >= 1 ? 'ONLINE' : 'ACTIVATING';
    return 'STANDBY';
  }

  get poweredPathAvailable(): boolean {
    if (!this.primaryFault) return true;
    return this.standbyEnabled && !this.standbyFault;
  }

  get activePath(): TransferPath {
    if (!this.running) return 'NONE';
    if (!this.primaryFault) return 'PRIMARY';
    if (this.standbyEnabled && !this.standbyFault && this.standbyRamp > 0.05) return 'STANDBY';
    return 'NONE';
  }

  /** Available capacity as a fraction of design. */
  availability(): number {
    if (!this.running) return 0;
    if (!this.primaryFault) return 1;
    return this.standbyEnabled && !this.standbyFault ? this.standbyRamp : 0;
  }

  capacityRate(): number {
    return this.designRate * this.availability();
  }

  flowM3h(): number {
    return T.designFlowM3h * this.availability();
  }

  update(dt: number): void {
    const want = this.primaryFault && this.standbyEnabled && !this.standbyFault && this.running;
    if (want) this.standbyRamp = Math.min(1, this.standbyRamp + dt / T.standbyActivationTime);
    else this.standbyRamp = Math.max(0, this.standbyRamp - dt / 3);
  }
}
