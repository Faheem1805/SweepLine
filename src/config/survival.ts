/**
 * Survival on the way from the curtain to the release outlet, stage by stage. No published study
 * measures scyphozoan jellyfish through a pump or a long pipe, so the ranges are fish and
 * invertebrate analogues, as published, and the end-to-end figure is their product. The decisive
 * test is listed with them.
 *
 * Transfer design that follows from the evidence (US NMFS fish-bypass criteria, 2011): lift the
 * animals once, with an Archimedes screw into a head tank on the pontoon, then let them run by
 * gravity down a smooth line (bends of at least 5 bores, never below atmospheric pressure, no air).
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
    stage: 'Guided along the curtain',
    low: 0.9,
    high: 1,
    basis: 'Juvenile fish impinged on rotating fish-return screens at 0.3–0.9 m/s, a harsher case than sliding along fabric at ≤ 0.3 m/s.',
    source: 'EPRI 2010, report 1021372',
  },
  {
    stage: 'Screw lift into the head tank',
    low: 0.94,
    high: 1,
    basis: 'Archimedes screw lift: juvenile Chinook salmon 94–99.5 %; rainbow trout 98.3–100 % at 96 h.',
    source: 'McNabb et al. 2003, TAFS 132:326; Borthwick & Liston 2003, USBR',
  },
  {
    stage: 'Gravity line, 2.2 km',
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
  'Live 30–45 cm Blue Blubber through the chosen screw lift and a recirculating pipe loop at 1.5 m/s for 25 min, no air, against paired controls handled the same way; score deaths, bell tears and pulse rate over 96 h.';

export const survivalRange = () => ({ low: SURVIVAL.reduce((p, s) => p * s.low, 1), high: SURVIVAL.reduce((p, s) => p * s.high, 1) });
