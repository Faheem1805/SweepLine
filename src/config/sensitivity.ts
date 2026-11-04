/**
 * One-at-a-time sensitivity of the reference result. Each assumption is set to the low and the high
 * end of a plausible range on the same bloom (scripts/study-all.sh). Each names the test that pins
 * it down, so the validation budget goes first to what moves the result most.
 */

export type SettledBy = 'Site data' | 'Flume' | 'Sea trial';

export interface SensitivityFactor {
  key: 'slide' | 'leak' | 'snag' | 'swim' | 'flow';
  label: string;
  low: string;
  high: string;
  ref: string;
  /** The test or data that settles it. */
  test: string;
  settledBy: SettledBy;
}

export const SENSITIVITY_FACTORS: readonly SensitivityFactor[] = [
  { key: 'leak', label: 'Animals working through the mesh', low: '× 0.2', high: '× 10', ref: '0.06 % a panel', test: 'Live animals against a mesh panel at 0.11 and 0.31 m/s', settledBy: 'Flume' },
  { key: 'slide', label: 'How well animals slide along the net', low: '50 % of the flow', high: '90 % of the flow', ref: '75 %', test: 'Filmed tracks of live bells along a 20° panel', settledBy: 'Flume' },
  { key: 'snag', label: 'How often an animal snags', low: '× 0.2', high: '× 5', ref: '1 in 1,400 a second', test: 'Same flume, mesh and twine options side by side', settledBy: 'Flume' },
  { key: 'swim', label: 'How strongly they swim', low: '× 0.5', high: '× 2.5', ref: '2–6 cm/s', test: 'Tethered and free-swimming tank work', settledBy: 'Flume' },
  { key: 'flow', label: 'Plant flow', low: '1.4 million m³/h', high: '2.3 million m³/h', ref: '2.0 million m³/h', test: 'Plant flow record and a channel survey', settledBy: 'Site data' },
];

/** What has to happen before anyone should trust the numbers, in order, cheapest first. */
export const TEST_PLAN = [
  { stage: 'Flume', time: '3 months', proves: 'Do live bells, 6 to 45 cm, slide along mesh at 20° without pinning or tearing? 30 or 50 mm mesh?', pass: 'Over 95 % guided at 0.11 m/s' },
  { stage: 'Survival', time: '2 months', proves: 'Do they survive the screw lift and 24 minutes in a line?', pass: 'Over 70 % alive and pulsing at 96 h, against controls' },
  { stage: 'Panel at the site', time: '6 weeks', proves: 'How fast does the mesh foul, what do load cells read, what bycatch and polyps settle?', pass: 'Head under 0.05 m at 4 weeks' },
  { stage: 'One-third net', time: '1 season', proves: 'A full-depth section on piles with a real collector, in a real bloom', pass: 'Screens load falls, plant untouched' },
] as const;
