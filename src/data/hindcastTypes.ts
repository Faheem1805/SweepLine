/** Shape of the generated operating-window hindcast (see scripts/hindcast.ts). */

export interface HindcastPeriod {
  label: string;
  hours: number;
  /** Highest significant wave height (m) and total current speed (m/s) in the period. */
  maxWave: number;
  maxCurrent: number;
  /** Hours past the hard limits (SafeOpen) and in the warning band below them. */
  overWave: number;
  nearWave: number;
  overCurrent: number;
  nearCurrent: number;
  /** Longest run of hours past either hard limit. */
  longestStandDown: number;
}

export interface HindcastData {
  generatedAt: string;
  source: string;
  /** Model cell the series were read from, and its distance from the reference site (km). */
  cell: { lat: number; lon: number; distanceKm: number };
  /** Hard limits and warning thresholds used (src/config/operatingEnvelope.ts). */
  limits: { wave: number; waveNear: number; current: number; currentNear: number };
  /** Each bloom season (Oct–Nov), then all of 2022–2025 for context. */
  seasons: HindcastPeriod[];
  allYear: HindcastPeriod;
}
