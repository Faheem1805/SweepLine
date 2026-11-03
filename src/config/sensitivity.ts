/**
 * One-at-a-time sensitivity of the reference result. Each factor is set to the low and the high end
 * of its plausible range while everything else stays at the reference, and the reference sequence
 * is rerun on the same bloom seeds (scripts/sensitivity-study.ts). Each factor names the test or
 * data that pins it down, so the validation budget goes first to what moves the result most.
 */

/** Where a factor's real value comes from. */
export type SettledBy = 'Site data' | 'Flume' | 'Tank';

export interface SensitivityFactor {
  key: 'current' | 'depth' | 'density' | 'waves' | 'swim' | 'slide' | 'blowback' | 'jets';
  label: string;
  /** Values tested (low, high) and the reference value, in `unit`. */
  low: number;
  high: number;
  ref: number;
  unit: string;
  /** Why this range. */
  basis: string;
  /** The test or data that settles it. */
  test: string;
  settledBy: SettledBy;
}

export const SENSITIVITY_FACTORS: readonly SensitivityFactor[] = [
  {
    key: 'current',
    label: 'Current speed',
    low: 0.08,
    high: 0.4,
    ref: 0.2,
    unit: 'm/s',
    basis: 'Recorded neap flow to twice the recorded spring peak',
    test: 'ADCP on the curtain line through a spring–neap cycle',
    settledBy: 'Site data',
  },
  {
    key: 'depth',
    label: 'Bloom depth',
    low: 1.0,
    high: 2.6,
    ref: 1.8,
    unit: 'm',
    basis: 'Mean depth of the bloom; the skirt stays at its 3.5 m setpoint',
    test: 'Echo-sounder transects of real blooms by the detection programme',
    settledBy: 'Site data',
  },
  {
    key: 'density',
    label: 'Bloom density',
    low: 0.35,
    high: 1,
    ref: 0.72,
    unit: '× peak',
    basis: 'A thin bloom to the densest in the model: throat and transfer queues',
    test: 'Detection programme counts, scaled to the curtain',
    settledBy: 'Site data',
  },
  {
    key: 'waves',
    label: 'Wave height (Hs)',
    low: 0.3,
    high: 1.2,
    ref: 0.8,
    unit: 'm',
    basis: 'Calm to the edge of the operating envelope',
    test: 'Skirt heave and overtopping, measured in a wave flume',
    settledBy: 'Flume',
  },
  {
    key: 'swim',
    label: 'Jellyfish swimming',
    low: 0.5,
    high: 2,
    ref: 1,
    unit: '× speed',
    basis: 'Half to twice the assumed 2–6 cm/s bell-pulse speed',
    test: 'Blue Blubber filmed in a tank, swimming and diving near a net',
    settledBy: 'Tank',
  },
  {
    key: 'slide',
    label: 'How bells slide along the net',
    low: 0.3,
    high: 0.9,
    ref: 0.6,
    unit: 'gain',
    basis: 'Share of the blocked flow that carries a bell along the face',
    test: 'Bells released at an angled net in a flume, filmed',
    settledBy: 'Flume',
  },
  {
    key: 'blowback',
    label: 'Skirt blow-back',
    low: 0.5,
    high: 2,
    ref: 1,
    unit: '× lift',
    basis: 'Half to twice the assumed skirt lift in current',
    test: 'Skirt angle against current speed, measured in a flume',
    settledBy: 'Flume',
  },
  {
    key: 'jets',
    label: 'Conveyor jets',
    low: 0,
    high: 1,
    ref: 0.75,
    unit: 'output',
    basis: 'Jets failed (passive curtain) to full output',
    test: 'Wall-jet speed along the face, by flume test and CFD',
    settledBy: 'Flume',
  },
];
