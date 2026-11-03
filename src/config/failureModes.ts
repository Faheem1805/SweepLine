/**
 * What can go wrong, what SweepLine does about it, and where the result comes from. The simulated
 * rows are run by scripts/failure-study.ts: the same blooms with and without SweepLine, counting
 * intake contacts over the run, to check that no failure leaves the intake worse off than today.
 */

export type FailureSource = 'sim' | 'tide' | 'design';

export interface FailureMode {
  key: 'transfer' | 'transferBoth' | 'jets' | 'fouling' | 'waves' | 'current' | 'deep' | 'slack' | 'tide' | 'late' | 'air';
  /** What fails or goes outside the envelope. */
  failure: string;
  /** What SweepLine does. */
  response: string;
  source: FailureSource;
}

export const FAILURE_MODES: readonly FailureMode[] = [
  { key: 'transfer', failure: 'Transfer pump fails', response: 'The standby transfer path takes over automatically', source: 'sim' },
  { key: 'transferBoth', failure: 'Both transfer paths fail', response: 'SafeOpen: the curtain clears its traffic and retracts, upstream end first', source: 'sim' },
  { key: 'jets', failure: 'Conveyor jets fail', response: 'The angled curtain keeps guiding on the current alone', source: 'sim' },
  { key: 'fouling', failure: 'Debris and fouling load the curtain', response: 'Load is monitored; past the limit SafeOpen retracts it', source: 'sim' },
  { key: 'waves', failure: 'Waves build past Hs 1.5 m', response: 'SafeOpen retracts the curtain', source: 'sim' },
  { key: 'current', failure: 'Current above 0.6 m/s', response: 'Deployment refused; the plant runs as today', source: 'sim' },
  { key: 'deep', failure: 'Bloom deeper than the skirt', response: 'The winches lower the skirt to the seabed-clearance limit; foot jets lift animals at the hem', source: 'sim' },
  { key: 'slack', failure: 'Current dies away (slack water)', response: 'The conveyor jets keep the bloom moving to the throat', source: 'sim' },
  { key: 'tide', failure: 'Tide turns mid-bloom', response: 'Line B pops up for the new direction; Line A clears and stows', source: 'tide' },
  { key: 'late', failure: 'Deployed late (laid by workboat)', response: 'Guides once laid; the leading edge of the bloom gets through first, the leak pop-up deployment avoids', source: 'sim' },
  { key: 'air', failure: 'Air or power lost', response: 'The curtain sinks onto its seabed anchors, away from the intake; the screens carry on as today', source: 'design' },
];
