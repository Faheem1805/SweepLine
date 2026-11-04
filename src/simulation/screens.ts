import { ASSUMPTIONS } from '../config/assumptions';

const S = ASSUMPTIONS.screens;

export type ScreenStatus = 'CLEAR' | 'LOADED' | 'DERATED' | 'TRIPPED';

/**
 * The plant's existing travelling screens. Biomass lands on them and they wash it off at a limited
 * rate; what they cannot clear builds up, and past a backlog the plant must cut power, then trip.
 * The thresholds are stated assumptions: the plant's own screen logs would replace them.
 */
export class ScreenState {
  /** Biomass on the screens waiting to be washed off (t). */
  backlog = 0;
  /** Arrival rate (t/h, smoothed). */
  arrivalTph = 0;
  /** Total biomass that reached the screens (t). */
  totalT = 0;
  status: ScreenStatus = 'CLEAR';
  /** Simulated times the plant had to cut power and trip (null if it did not). */
  deratedAt: number | null = null;
  trippedAt: number | null = null;
  private added = 0;
  private time = 0;

  add(kg: number): void {
    this.added += kg / 1000;
    this.totalT += kg / 1000;
  }

  update(dt: number): void {
    this.time += dt;
    this.backlog += this.added;
    this.arrivalTph += ((this.added / dt) * 3600 - this.arrivalTph) * (1 - Math.exp(-dt / 120));
    this.added = 0;
    this.backlog = Math.max(0, this.backlog - (S.washTph / 3600) * dt);
    if (this.backlog >= S.tripAt) {
      this.status = 'TRIPPED';
      this.trippedAt ??= this.time;
      this.deratedAt ??= this.time;
    } else if (this.backlog >= S.derateAt && this.status !== 'TRIPPED') {
      this.status = 'DERATED';
      this.deratedAt ??= this.time;
    } else if (this.status !== 'TRIPPED') {
      this.status = this.backlog > 0.3 ? 'LOADED' : 'CLEAR';
    }
  }

  reset(): void {
    this.backlog = 0;
    this.arrivalTph = 0;
    this.totalT = 0;
    this.status = 'CLEAR';
    this.deratedAt = null;
    this.trippedAt = null;
    this.added = 0;
    this.time = 0;
  }
}
