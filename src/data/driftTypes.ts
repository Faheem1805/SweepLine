/** Shape of the generated released-animal drift study (see scripts/drift-study.ts). */
import type { DriftOutcome } from '../simulation/drift';

export interface DriftData {
  generatedAt: string;
  horizonDays: number;
  windage: number;
  diffusivity: number;
  /** Animals released per policy. */
  released: number;
  /** Policies shown on the Evidence page, in order; the design policy; the no-SweepLine reference. */
  shown: string[];
  design: string;
  natural: string;
  outcomes: DriftOutcome[];
  /** Share back at the site across the windage and diffusivity cases, per policy shown. */
  ranges: Record<string, { min: number; max: number }>;
  /** Sample tracks per policy shown, one point per hour (site metres). */
  tracks: Record<string, Array<Array<[number, number]>>>;
}
