import { SITE } from '../config/site';
import { TIDE_DATA } from '../data/tide.generated';

/**
 * The real tidal current at the reference site (Copernicus SMOC record, fitted
 * tide plus its slow residual; see scripts/build-tide-data.ts). The along-shore
 * component drives the twin's current when a run uses the tide; the small
 * cross-shore component is left out.
 */
export const TIDE = TIDE_DATA;

const U = TIDE_DATA.u;
const LAST = U.length - 1;

/** Along-shore current toward +x (m/s) at `hours` into the record (Catmull-Rom between hourly values, clamped). */
export function tideCurrent(hours: number): number {
  const h = Math.min(Math.max(hours, 0), LAST);
  const i = Math.min(Math.floor(h), LAST - 1);
  const t = h - i;
  const p0 = U[Math.max(0, i - 1)];
  const p1 = U[i];
  const p2 = U[i + 1];
  const p3 = U[Math.min(LAST, i + 2)];
  const t2 = t * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t2 * t);
}

/** Current speed (m/s) and bearing (degrees) for an along-shore current u toward +x. */
export function tideCurrentVector(u: number): { speed: number; bearing: number } {
  return { speed: Math.abs(u), bearing: u >= 0 ? SITE.bearingOfPlusX : (SITE.bearingOfPlusX + 180) % 360 };
}

/** Hours from `hours` until the current next changes direction, or null if it does not within the record. */
export function hoursToNextTurn(hours: number): number | null {
  const s0 = Math.sign(tideCurrent(hours)) || 1;
  for (let h = hours + 0.1; h <= LAST; h += 0.1) {
    if (Math.sign(tideCurrent(h)) === -s0) {
      // Refine the crossing.
      let lo = h - 0.1;
      let hi = h;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(tideCurrent(mid)) === -s0) hi = mid;
        else lo = mid;
      }
      return hi - hours;
    }
  }
  return null;
}

/** UTC time at `hours` into the record. */
export function tideDate(hours: number): Date {
  return new Date(Date.parse(TIDE_DATA.start) + hours * 3600_000);
}
