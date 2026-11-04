/**
 * Against the usual answers: boats and crews (what plants do now), a bubble curtain, and a floating
 * boom. Approaches, not teams. SweepLine's column is filled from the twin's own studies
 * (src/components/panels/Comparison.tsx).
 */

export interface ComparisonRow {
  key: 'tide' | 'depth' | 'waves' | 'crew' | 'animals' | 'cost';
  question: string;
  boats: string;
  bubbles: string;
  boom: string;
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    key: 'tide',
    question: 'When the tide turns',
    boats: 'Boats follow the bloom, when they can',
    bubbles: 'The curtain stays, and animals are pushed against it from the other side',
    boom: 'Faces the wrong way until it is moved, about four times a day here',
  },
  {
    key: 'depth',
    question: 'Top to bottom',
    boats: 'Nets reach the top of the water',
    bubbles: 'Bubbles rise from the bed, spreading and weakening near the surface',
    boom: 'A skirt covers the top few metres. Below it is open',
  },
  {
    key: 'waves',
    question: 'In waves',
    boats: 'Work at sea stops with the sea state',
    bubbles: 'Flume and field tests: more waves and more air let more jellyfish through',
    boom: 'Moves with the waves and spills, and anchors take the load',
  },
  {
    key: 'crew',
    question: 'Who is on the water in a bloom',
    boats: 'Crews round the clock: seven boats at one European plant in September 2026, with three units still shut',
    bubbles: 'Nobody, once laid. Compressors run the whole time',
    boom: 'A crew to set and move it',
  },
  {
    key: 'animals',
    question: 'What happens to the jellyfish',
    boats: 'Scooped up and released further out',
    bubbles: 'Turned aside where they are. Air trapped under a bell harms it',
    boom: 'Held in place until someone removes them',
  },
  {
    key: 'cost',
    question: 'Running cost',
    boats: 'About US$0.6M a year at that plant',
    bubbles: 'Hundreds of kilowatts of compressors while it runs',
    boom: 'Vessel days to set, move and clear it',
  },
];

export const COMPARISON_SOURCES = [
  { label: 'Second swarm disrupts a European plant, Sept 2026 (NEI Magazine)', url: 'https://www.neimagazine.com/news/second-jellyfish-swarm-disrupts-gravelines/' },
  { label: 'Haberlin, McAllen & Doyle 2021, Aquaculture 531', url: 'https://research.ucc.ie/en/publications/field-and-flume-tank-experiments-investigating-the-efficacy-of-a/' },
  { label: 'Raskoff et al. 2003, Biol Bull 204:68', url: 'https://doi.org/10.2307/1543497' },
  { label: 'Running cost of boats and crews (Économie Matin)', url: 'https://www.economiematin.fr/?p=227302' },
];
