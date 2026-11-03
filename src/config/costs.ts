/**
 * Order-of-magnitude costs for one SweepLine installation (two guide lines, one shared release
 * line), built only from public price points. Ranges, US$ 2025 (2002 figures × 1.79 CPI; USD 1 =
 * AED 3.673). Not supplier quotes: items with no public price are listed as excluded.
 */
export interface CostItem {
  item: string;
  /** Low and high, US$ million. */
  low: number;
  high: number;
  basis: string;
  sources: string[];
}

export const AED_PER_USD = 3.673;

export const CAPEX: CostItem[] = [
  {
    item: 'Guide curtains, 2 × 130 m',
    low: 0.07,
    high: 3.51,
    basis: 'Heavy-duty inflatable offshore boom at US$255/m (UK coastguard, 2015–18), up to an installed fabric intake barrier at a US power plant (US$0.98M per intake in 2002, EPA), per line.',
    sources: [
      'https://www.contractsfinder.service.gov.uk/notice/33fe782c-ea44-4525-aa72-151bbac16539',
      'https://www.epa.gov/sites/default/files/2015-04/documents/cooling-water_phase-2_tdd_2004.pdf',
    ],
  },
  {
    item: 'Seabed anchors, 12, and vessel days to set them',
    low: 0.03,
    high: 0.12,
    basis: 'Installed block or helical moorings at US$2,000–6,500 each; 2–5 support-vessel days at US$4.5–9k.',
    sources: ['https://rbra.ca.gov/files/d6f0e1f89/5-12-2022-GHD-pdf-ppt-RBRA-Temp-Mooring-Field.pdf', 'https://www.clarksons.com/home/news-and-insights/2023/essential-vessels-for-offshore-windfarm-construction-and-operations/'],
  },
  {
    item: 'Jet pumps, 1.5 m³/s per line',
    low: 0.47,
    high: 0.82,
    basis: 'Priced conservatively as fish-friendly pumps of the same flow (US$0.24–0.41M per line, 2023–24).',
    sources: ['https://www.mission.ca/media/file/wrmp-engineering-appendix-g-lane-creek-dps', 'https://subsite2.waikatoregion.govt.nz/assets/WRC/PS23-18.pdf'],
  },
  {
    item: 'Transfer pumps, one per throat',
    low: 0.15,
    high: 0.61,
    basis: 'Fish pump US$77k (US Fish and Wildlife Service, 2026) to an encased screw fish pump at 1 m³/s, US$307k (2024).',
    sources: ['https://app.govly.com/public/opportunities/16596124', 'https://subsite2.waikatoregion.govt.nz/assets/WRC/PS23-18.pdf'],
  },
  {
    item: 'Release line, ~2.4 km of 1.0 m bore HDPE',
    low: 1.26,
    high: 6.87,
    basis: 'PE100 pipe list price (DN800 scaled to DN1000, US$526/m, 2023) up to an installed power-plant fish-return flume (US$2,861/m in 2025 dollars, EPA).',
    sources: ['https://matrix-piping.prod01.sydney.platformos.com/pages/poly-pipe-prices', 'https://www.epa.gov/sites/default/files/2015-04/documents/cooling-water_phase-2_tdd_2004.pdf'],
  },
];

/** Not in the total: no public price found, or depends on the site. */
export const CAPEX_EXCLUDED = ['inflation system and manifold', 'controls and sensors', 'engineering, permits and contingency'];

/** Value of one lost unit-day at a 1.4 GW unit (US$ million): a published plant figure up to an analyst's estimate of the plant's generation cost. */
export const UNIT_DAY = {
  low: 1.32,
  high: 3.7,
  basis: 'Torness, £1M a day (2014), up to 33.6 GWh at 11 US¢/kWh (analyst estimate of the plant’s generation cost, 2018).',
  sources: ['https://nzherald.co.nz/world/new-system-to-warn-of-jellyfish-swarms/RCLE3LOTJWZAH53G4ABCDOJTRQ', 'https://spectrum.ieee.org/the-united-arab-emirates-nuclear-power-gambit'],
};

/** Running costs per bloom season (US$ thousand): energy for ~30 days deployed, and monthly inspection vessel days for both lines over two months. */
export const RUNNING = {
  low: 20,
  high: 45,
  /** For comparison: EDF's boats and crews at Gravelines, about €0.53M a year (US$ million). */
  manualPerYear: 0.6,
  manualSource: 'https://www.economiematin.fr/?p=227302',
};

/** A real event for scale: Hanul (Korea) 2021, two units out for 7–13 days. */
/**
 * CO₂ kept out of the air by one avoided unit-day: ENEC puts the plant's four units at 22.4 Mt a year
 * avoided against the generation they replace, so a unit lost for a day hands about this much back.
 */
export const CO2_PER_UNIT_DAY = {
  tonnes: Math.round(22.4e6 / 4 / 365 / 100) * 100,
  source: 'https://www.enec.gov.ae/news/latest-news/barakah-plant-tackling-climate-change-today/',
};

export const REFERENCE_EVENT = { label: 'Hanul 2021', unitDays: [14, 26] as const, source: 'https://www.asiae.co.kr/en/article/2021041915325211316' };

export const capexTotal = () => ({ low: CAPEX.reduce((s, c) => s + c.low, 0), high: CAPEX.reduce((s, c) => s + c.high, 0) });
