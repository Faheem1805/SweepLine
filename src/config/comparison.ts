/**
 * Against today's response: boats and crews (what plants do now) and bubble curtains (the most
 * common proposal). Approaches, not teams. Every statement about another approach is sourced;
 * SweepLine's column is filled from the twin's own studies (src/components/panels/Comparison.tsx).
 */

export interface ComparisonRow {
  key: 'crew' | 'units' | 'waves' | 'animals' | 'cost';
  question: string;
  boats: string;
  bubbles: string;
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    key: 'crew',
    question: 'Who is out on the water',
    boats: 'Crews round the clock: seven boats at Gravelines in September 2026',
    bubbles: 'Nobody once laid; compressors run whenever it is on',
  },
  {
    key: 'units',
    question: 'Does it keep the intake clear',
    boats: 'At Gravelines units 3, 4 and 6 were still shut with the seven boats working',
    bubbles: 'Field trials: only a high-airflow curtain turned large jellyfish; an 800 m farm curtain made no significant difference',
  },
  {
    key: 'waves',
    question: 'In waves',
    boats: 'Work at sea is limited by the sea state',
    bubbles: 'More waves and more air let more jellyfish through',
  },
  {
    key: 'animals',
    question: 'What happens to the jellyfish',
    boats: 'Scooped up and released further offshore',
    bubbles: 'Turned aside where they are; air trapped under a bell harms it',
  },
  {
    key: 'cost',
    question: 'Running cost',
    boats: 'About US$0.6M a year for boats and crews at Gravelines',
    bubbles: 'Compressor power for the whole line, all the time it runs',
  },
];

export const COMPARISON_SOURCES = [
  { label: 'Gravelines, Sept 2026 (NEI Magazine)', url: 'https://www.neimagazine.com/news/second-jellyfish-swarm-disrupts-gravelines/' },
  { label: 'Haberlin, McAllen & Doyle 2021, Aquaculture 531', url: 'https://research.ucc.ie/en/publications/field-and-flume-tank-experiments-investigating-the-efficacy-of-a/' },
  { label: 'Raskoff et al. 2003, Biol Bull 204:68', url: 'https://doi.org/10.2307/1543497' },
  { label: 'Gravelines running cost (Économie Matin)', url: 'https://www.economiematin.fr/?p=227302' },
];
