/** Shape of the generated sensitivity study (see scripts/sensitivity-study.ts). */

import type { SensitivityFactor } from '../config/sensitivity';

export interface SensitivityData {
  generatedAt: string;
  /** Length of each run (simulated minutes) and the bloom seeds every point is run on. */
  minutes: number;
  seeds: number[];
  /** Share of intake contacts avoided at the reference, on the same seeds. */
  base: number;
  /** Share avoided with each factor at its low and high value (mean over the seeds). */
  factors: Record<SensitivityFactor['key'], { low: number; high: number }>;
}
