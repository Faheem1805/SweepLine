/** Shape of the generated tidal-current data (see scripts/build-tide-data.ts). */

export interface TideConstituent {
  name: string;
  /** Along-shore current amplitude (m/s). */
  amp: number;
}

export interface TideData {
  generatedAt: string;
  source: string;
  /** Model cell the series was read from, and its distance from the reference site. */
  cell: { lat: number; lon: number; distanceKm: number };
  /** Compass bearing of the site's +x (along-shore) axis the current is projected onto (degrees). */
  bearingX: number;
  /** First sample (UTC, ISO 8601) and the sample interval (h). */
  start: string;
  stepHours: number;
  /** Along-shore current toward +x (m/s): the fitted tide plus the 25 h low-passed residual. */
  u: number[];
  /** Offshore current toward +z (m/s), the same way (negative = onshore). */
  v: number[];
  fit: {
    period: string;
    samples: number;
    /** Share of the along-shore current variance explained by the tide alone, and with the low-passed residual. */
    r2: number;
    r2WithResidual: number;
    constituents: TideConstituent[];
    /** The same for the offshore component, and its mean over the whole record (m/s). */
    offshore: { r2: number; r2WithResidual: number; mean: number };
  };
  /** Statistics of the along-shore series (m/s), how often it changes direction, and the season's mean offshore current. */
  stats: { p5: number; p50: number; p95: number; reversalsPerDay: number; offshoreMean: number };
  /** Hourly 10 m wind over the same window, blowing toward +x / +z (m/s). */
  wind: { source: string; x: number[]; z: number[]; meanX: number; meanZ: number };
  /** Hours into `u` at which the reference tide turn crosses zero (+x → −x). */
  referenceTurn: number;
}
