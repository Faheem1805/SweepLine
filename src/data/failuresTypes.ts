/** Shape of the generated failure-mode study (see scripts/failure-study.ts). */

import type { FailureMode } from '../config/failureModes';

export interface FailureOutcome {
  /** Intake contacts over the run with and without SweepLine (mean over the seeds). */
  sweep: number;
  base: number;
  /** Largest excess of SweepLine contacts over the same-seed baseline (0 when never worse). */
  worstExcess: number;
  /** Status at the end of the run (most common over the seeds). */
  status: string;
}

export interface FailuresData {
  generatedAt: string;
  minutes: number;
  seeds: number[];
  outcomes: Partial<Record<FailureMode['key'], FailureOutcome>>;
}
