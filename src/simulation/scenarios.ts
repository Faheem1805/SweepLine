import { SPECIES } from '../config/assumptions';
import { TIDE } from './tide';
import type { FailureKey, SimParams } from './types';

export type ScenarioAction =
  | { kind: 'fail'; failure: FailureKey }
  | { kind: 'clear'; failure: FailureKey }
  | { kind: 'params'; params: Partial<SimParams>; message: string };

export interface ScenarioStep {
  /** Simulated seconds after the run (or its pre-roll) starts. */
  at: number;
  action: ScenarioAction;
}

export interface Scenario {
  id: string;
  name: string;
  tagline: string;
  /** The question a judge would ask that this run answers. */
  question: string;
  description: string;
  params: Partial<SimParams>;
  /** 'sequence' runs from the panels going in; 'steady' pre-rolls into live operation with a bloom on the net. */
  start: 'sequence' | 'steady';
  script?: ScenarioStep[];
  tone: 'nominal' | 'stress' | 'failure';
  /** Pre-roll for a steady start (s), when it differs from the default. */
  preRoll?: number;
}

const speciesDepth = (k: keyof typeof SPECIES): Partial<SimParams> => ({
  species: k,
  bloomMeanDepth: SPECIES[k].meanDepth,
  bloomDepthSD: SPECIES[k].depthSD,
});

/** Scenario presets. Each loads real parameter values; the outcomes are computed by the agent model, never scripted. */
export const SCENARIOS: Scenario[] = [
  {
    id: 'reference',
    name: 'Heavy bloom',
    tagline: 'Top of the documented range, 25 t/h',
    question: 'What does a normal response look like?',
    description: 'Blue Blubber at the top of the documented intake range. The panels go in, the warning starts the lifts, and the plant’s own flow sweeps the bloom along the net to the collector.',
    params: {},
    start: 'sequence',
    tone: 'nominal',
  },
  {
    id: 'moon',
    name: 'Moon jellyfish swarm',
    tagline: 'Smaller, softer, more of them',
    question: 'Does it only work for one species?',
    description: 'Moon jellyfish are the classic intake blocker worldwide. They are soft, so more work through the mesh and they block more of it per tonne. The second net earns its place here.',
    params: { ...speciesDepth('aurelia'), bloomRate: 18 },
    start: 'sequence',
    tone: 'stress',
  },
  {
    id: 'deep',
    name: 'Deep bloom',
    tagline: 'Crambionella, near the seabed',
    question: 'What if they swim under it?',
    description: 'Crambionella gather at depth. The nets run from float line to seabed, so depth does not matter except at the ground-line joints.',
    params: { ...speciesDepth('crambionella'), bloomRate: 20 },
    start: 'sequence',
    tone: 'stress',
  },
  {
    id: 'night',
    name: 'Night, turbid water',
    tagline: 'No cameras, no problem',
    question: 'How does it cope with poor visibility?',
    description: 'Nothing here needs to see. The sonar at the mouth and the load cells on the net carry on in the dark, and the net works whether anyone is watching or not.',
    params: { night: true },
    start: 'steady',
    tone: 'stress',
  },
  {
    id: 'storm',
    name: 'Shamal storm',
    tagline: 'Hs 1.82 m, the highest recorded in four years',
    question: 'What happens in a storm?',
    description: 'The sea builds to the highest wave recorded at the site in 2022–2025. The breakwaters take it: about a fifth of it reaches the net line.',
    params: { waveHeight: 0.8 },
    start: 'steady',
    script: [
      { at: 20, action: { kind: 'params', params: { waveHeight: 1.3 }, message: 'Sea state building — Hs 1.3 m offshore' } },
      { at: 60, action: { kind: 'fail', failure: 'storm' } },
    ],
    tone: 'stress',
  },
  {
    id: 'fouled',
    name: 'Missed panel swap',
    tagline: 'Panels in the water for ten weeks',
    question: 'What about fouling?',
    description: 'Gulf growth is fast. The planned swap is every four weeks; here it has been missed twice. Head across the net climbs and the margin to relief shrinks, but it shows on the load cells long before it matters.',
    params: { foulingWeeks: 10 },
    start: 'steady',
    tone: 'stress',
  },
  {
    id: 'tide',
    name: 'Recorded tide turn',
    tagline: 'Copernicus current, 8 Oct 2025',
    question: 'What happens when the tide turns?',
    description: 'The recorded spring tide slackens and reverses outside. Inside the channel nothing changes: the plant’s pumps set the flow, so the net keeps sweeping through slack water and the turn.',
    params: { tide: true, tideStart: TIDE.referenceTurn - 1.2, bloomRate: 18 },
    start: 'steady',
    tone: 'stress',
  },
  {
    id: 'pump',
    name: 'Screw lifts stop',
    tagline: 'Duty lift, then standby',
    question: 'What happens when a part fails?',
    description: 'The duty lift stops and the standby takes over. Then the standby fails too. The pockets fill and the bloom stacks up along the net, which is passive and goes on holding it, buying time for repair.',
    params: {},
    start: 'steady',
    script: [
      { at: 30, action: { kind: 'fail', failure: 'pumpPrimary' } },
      { at: 240, action: { kind: 'fail', failure: 'pumpStandby' } },
    ],
    tone: 'failure',
  },
  {
    id: 'funnel',
    name: 'Funnel assist',
    tagline: 'Three units off, the sweep goes weak',
    question: 'What if the sweep is too weak to clear the funnel?',
    description: 'Three of the four units come off line, so the channel flow and the sweep along the net drop to a quarter. Animals slow at the funnel mouth. With the experimental assist on Auto, a spray bar ahead of the mouth starts after the slow sweep has lasted 90 s, and goes back to idle once the units return. Replay with the assist Off to compare on the same seed.',
    params: { assistMode: 'auto' },
    start: 'steady',
    preRoll: 4000,
    script: [
      { at: 30, action: { kind: 'params', params: { unitsRunning: 1 }, message: 'Three units off line: channel flow and the sweep along the net drop to a quarter' } },
      { at: 630, action: { kind: 'params', params: { unitsRunning: 4 }, message: 'All four units back: full sweep along the net' } },
    ],
    tone: 'stress',
  },
  {
    id: 'tear',
    name: 'Panel tears out',
    tagline: 'A hole in net A',
    question: 'What if the net rips?',
    description: 'A busy panel in the first net tears out. Flow rushes to the hole and takes animals with it. The second net, 60 m behind, catches them.',
    params: {},
    start: 'steady',
    script: [{ at: 40, action: { kind: 'fail', failure: 'panelTear' } }],
    tone: 'failure',
  },
  {
    id: 'overload',
    name: 'Everything at once',
    tagline: 'Lifts down, triple bloom',
    question: 'How much can the net hold?',
    description: 'No collector and three times the bloom. The net goes on holding it, and the head stays far below the relief limit.',
    params: { foulingWeeks: 6 },
    start: 'steady',
    script: [
      { at: 20, action: { kind: 'fail', failure: 'pumpPrimary' } },
      { at: 20, action: { kind: 'fail', failure: 'pumpStandby' } },
      { at: 60, action: { kind: 'fail', failure: 'surge' } },
    ],
    tone: 'failure',
  },
  {
    id: 'debris',
    name: 'Debris blinds the net',
    tagline: 'A mat across net A',
    question: 'Can the net ever become a dam?',
    description: 'A mat of weed and rubbish blinds net A. Head climbs to the relief limit, the float line dips and water spills over, so cooling flow comes first. Anything that crosses meets net B.',
    params: {},
    start: 'steady',
    script: [{ at: 20, action: { kind: 'fail', failure: 'debris' } }],
    tone: 'failure',
  },
];

export function getScenario(id: string | null | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
