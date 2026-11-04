/**
 * Order-of-magnitude costs for one SweepLine installation: two nets, the collector and one release
 * line. Ranges, US$ 2025. Not supplier quotes. An item marked `estimate` has no public price and is
 * our own build-up, there to be replaced by a contractor's number.
 */
export interface CostItem {
  item: string;
  /** Low and high, US$ million. */
  low: number;
  high: number;
  basis: string;
  estimate?: boolean;
  sources: string[];
}

export const CAPEX: CostItem[] = [
  {
    item: 'Piles, 44 × 1.1 m tubular steel',
    low: 0.9,
    high: 2.6,
    basis: 'US$20–60k each, driven from a jack-up. To be confirmed with a marine contractor.',
    estimate: true,
    sources: [],
  },
  {
    item: 'Net panels, two working sets and one spare',
    low: 0.75,
    high: 3,
    basis: 'About 15,000 m² of 50 mm knotless mesh with frames, at US$50–200/m².',
    estimate: true,
    sources: [],
  },
  {
    item: 'Screw lifts, duty and standby',
    low: 0.3,
    high: 1.2,
    basis: 'Encased screw fish pump at 1 m³/s: US$77–307k (2024–26). Twice that for two, and again for size.',
    sources: ['https://app.govly.com/public/opportunities/16596124', 'https://subsite2.waikatoregion.govt.nz/assets/WRC/PS23-18.pdf'],
  },
  {
    item: 'Platform, wet well, head tank',
    low: 0.5,
    high: 1.5,
    basis: 'Piled steel deck about 500 m² and civil works.',
    estimate: true,
    sources: [],
  },
  {
    item: 'Release line, 2.2 km of 1.0 m bore HDPE',
    low: 1.2,
    high: 6.3,
    basis: 'PE100 pipe list price (US$526/m, 2023) up to an installed power-plant fish-return flume (US$2,861/m in 2025 dollars, EPA).',
    sources: ['https://matrix-piping.prod01.sydney.platformos.com/pages/poly-pipe-prices', 'https://www.epa.gov/sites/default/files/2015-04/documents/cooling-water_phase-2_tdd_2004.pdf'],
  },
  {
    item: 'Sonar, load cells, controls',
    low: 0.15,
    high: 0.4,
    basis: 'Imaging sonar, 44 load cells, a small control room link.',
    estimate: true,
    sources: [],
  },
];

/** Not in the total. */
export const CAPEX_EXCLUDED = 'Engineering, permits and contingency, typically another 30–50 %.';

export interface RunningItem {
  item: string;
  /** Low and high, US$ thousand a year. */
  low: number;
  high: number;
  basis: string;
}

/** A year of operation with a seven-month season. All of it our own build-up. */
export const RUNNING: RunningItem[] = [
  { item: 'Panel swaps', low: 120, high: 260, basis: '8 four-week cycles, 2–3 days each, a workboat and six people' },
  { item: 'Washing and repairing panels ashore', low: 40, high: 90, basis: 'Yard, jet wash and net repair' },
  { item: 'Replacing worn panels', low: 150, high: 600, basis: 'A fifth of the mesh a year' },
  { item: 'Divers and inspection', low: 50, high: 120, basis: 'Monthly in season, piles and ground line' },
  { item: 'Electricity', low: 5, high: 15, basis: 'The lifts run only while a bloom is being collected' },
];

/** For scale: boats and crews at a European plant, about €0.53M a year (US$ million). */
export const MANUAL_PER_YEAR = { value: 0.6, source: 'https://www.economiematin.fr/?p=227302' };

/** Value of one lost unit-day at a 1.4 GW unit (US$ million). */
export const UNIT_DAY = {
  low: 1.32,
  high: 3.7,
  basis: 'A published plant figure of £1M a day (2014), up to 33.6 GWh at 11 US¢/kWh.',
  sources: ['https://nzherald.co.nz/world/new-system-to-warn-of-jellyfish-swarms/RCLE3LOTJWZAH53G4ABCDOJTRQ', 'https://spectrum.ieee.org/the-united-arab-emirates-nuclear-power-gambit'],
};

export const capexTotal = () => ({ low: CAPEX.reduce((s, c) => s + c.low, 0), high: CAPEX.reduce((s, c) => s + c.high, 0) });
export const runningTotal = () => ({ low: RUNNING.reduce((s, c) => s + c.low, 0), high: RUNNING.reduce((s, c) => s + c.high, 0) });
