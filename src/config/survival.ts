/**
 * Survival on the way from the net to the release outlet, stage by stage. No published study
 * measures scyphozoan jellyfish through a pump or a long pipe, so the ranges are fish and
 * invertebrate analogues, as published, and the end-to-end figure is their product. The decisive
 * test is listed with them.
 *
 * Transfer design that follows from the evidence (US NMFS fish-bypass criteria, 2011): lift the
 * animals once, in water, with a bucket elevator into a head tank, then let them run down a smooth
 * line (bends of at least 5 bores, never below atmospheric pressure, no air).
 */
export interface SurvivalStage {
  stage: string;
  low: number;
  high: number;
  basis: string;
  source: string;
}

export const SURVIVAL: SurvivalStage[] = [
  {
    stage: 'Swept along the net',
    low: 0.9,
    high: 1,
    basis: 'Juvenile fish impinged on rotating fish-return screens at 0.3–0.9 m/s, a harsher case than sliding along mesh at ≤ 0.31 m/s.',
    source: 'EPRI 2010, report 1021372',
  },
  {
    stage: 'Bucket elevator into the head tank',
    low: 0.9,
    high: 1,
    basis: 'No published figure for jellyfish in a bucket elevator. Closest analogue: dam fish lifts, which carry live fish over the dam in a water-filled hopper, with no pump. Set low until the survival test.',
    source: 'Analogue only: fish lifts in USFWS Fish Passage Engineering Design Criteria',
  },
  {
    stage: 'Line, 2.2 km',
    low: 0.7,
    high: 1,
    basis: 'Fish and invertebrate larvae in power-plant return lines (up to 131 m, 0.6–1.8 m/s): length, velocity and bends had no measurable effect.',
    source: 'EPRI 2010, report 1021372',
  },
  {
    stage: 'Release through the diffuser',
    low: 0.99,
    high: 1,
    basis: 'Underwater discharge at ≤ 1 m/s; fish jet entry up to 15 m/s caused under 1 % injury.',
    source: 'Johnson et al. 2003, NAJFM 23:441; EPRI 2010',
  },
];

/** Evidence that keeps air out of the animals' path entirely. */
export const AIR_EVIDENCE = 'Air trapped in a medusa causes embolism or floats it; even small bubbles damage specimens (Raskoff et al. 2003, Biol Bull 204:68).';

/** The test that settles the biggest unknown. */
export const DECISIVE_TEST =
  'Live 30–45 cm Blue Blubber through a test bucket elevator and a recirculating pipe loop at 1.5 m/s for 25 min, no air, against paired controls handled the same way; score deaths, bell tears and pulse rate over 96 h.';

export const survivalRange = () => ({ low: SURVIVAL.reduce((p, s) => p * s.low, 1), high: SURVIVAL.reduce((p, s) => p * s.high, 1) });
