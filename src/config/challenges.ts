import type { CameraPreset } from '../three/cameras/CameraRig';

/**
 * The problems this design was built around. Each is a place other approaches get caught out, said
 * about the approach and never about a team, with what we did about it and a live run that shows it.
 * A judge can press any of them and watch the answer.
 */
export interface Challenge {
  id: string;
  problem: string;
  /** Why it catches other approaches out. */
  trap: string;
  /** What we did. */
  answer: string;
  /** The scenario that proves it, and how to watch it. */
  scenario: string;
  camera: Exclude<CameraPreset, 'free' | 'compare'>;
  engineering?: boolean;
  compare?: boolean;
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'tide',
    problem: 'The tide turns',
    trap: 'A boom angled for one direction faces the wrong way half the time. Here the current reverses about four times a day, and stalls at every slack.',
    answer: 'The plant’s pumps set the flow inside the channel, so it never reverses and never stops. One direction, no handover.',
    scenario: 'tide',
    camera: 'top',
    engineering: true,
  },
  {
    id: 'under',
    problem: 'They swim underneath',
    trap: 'Floating booms and part-depth curtains leave the lower water open, and jellyfish use the whole water column.',
    answer: 'The nets run from float line to seabed on a weighted ground line. Nothing is left to swim under.',
    scenario: 'deep',
    camera: 'underwater',
  },
  {
    id: 'waves',
    problem: 'Waves and air',
    trap: 'In field and flume trials, more waves and more air let more jellyfish through a bubble curtain. Air trapped under a bell also harms it.',
    answer: 'Water only, inside the breakwaters. Under a fifth of the wave height reaches the net, and no air goes near the animals or the intake.',
    scenario: 'storm',
    camera: 'mouth',
  },
  {
    id: 'boats',
    problem: 'Boats can’t keep up',
    trap: 'In 2026 one European plant had seven boats working round the clock and still lost three units to a swarm. Boats also stop for weather.',
    answer: 'The line carries about 217 t/h, over 5,000 tonnes a day, far more than any documented intake rate, with nobody on the water during a bloom.',
    scenario: 'reference',
    camera: 'collector',
  },
  {
    id: 'release',
    problem: 'Where do they go?',
    trap: 'Release too close and the tide brings them back. Pipe too far and they spend hours in it, needing more energy and risking survival.',
    answer: 'Over the breakwater, not into the discharge, where it would only reach the next unit. A 2.2 km line, about 24 minutes with no air, to a point chosen with a drift study on the recorded current and wind.',
    scenario: 'reference',
    camera: 'release',
  },
  {
    id: 'plant',
    problem: 'Changing the plant',
    trap: 'Designs inside the intake lanes or on the screens change plant systems, which the brief says teams are not expected to do.',
    answer: 'The nets stand ahead of all four intakes. Nothing in the intake, screens or pumps changes. Take the nets out and the plant is exactly as it was.',
    scenario: 'reference',
    camera: 'intake',
  },
  {
    id: 'fail',
    problem: 'Something breaks',
    trap: 'A single barrier with a hole in it stops very little. In the model, one torn panel lets nearly the whole bloom through a single net.',
    answer: 'A second net 60 m behind catches it, with the same bloom at the screens barely changed.',
    scenario: 'tear',
    camera: 'net',
    engineering: true,
  },
  {
    id: 'dam',
    problem: 'A net that clogs',
    trap: 'Nets that simply block the flow load up, tear or collapse under the bloom they are stopping, and a full one works against the plant.',
    answer: 'At 20° the flow sweeps animals off the mesh: even with the lifts down and three times the bloom, head stays near 16 mm. If debris ever blinds a net, the float line dips at 120 mm and water spills over.',
    scenario: 'debris',
    camera: 'net',
    engineering: true,
  },
  {
    id: 'shred',
    problem: 'Pumps shred animals',
    trap: 'An impeller chops jellyfish up. The pieces pass the mesh, foul whatever is next and leave debris to clear, and the plant is left with a dead-animal problem.',
    answer: 'A slow screw lift has no impeller: an animal rides up in a pocket of water, then runs down a 1 m bore with no air. Survival is still to be measured on live bells.',
    scenario: 'reference',
    camera: 'collector',
  },
  {
    id: 'pump',
    problem: 'Power or pumps fail',
    trap: 'Active systems stop working when their power does.',
    answer: 'The nets need no power at all. If both lifts stop, the bloom stacks on the net and it goes on holding it, which buys time for repair. The lifts draw about 130 kW, only while collecting.',
    scenario: 'pump',
    camera: 'collector',
    engineering: true,
  },
  {
    id: 'stall',
    problem: 'They stall at the funnel',
    trap: 'A collector that relies on the sweep alone slows down whenever the plant cuts its flow. Animals linger at the mouth, and nobody knows unless someone watches it.',
    answer: 'A sonar watches the mouth. An experimental spray-bar assist, off by default, starts only when animals are there and the sweep stays weak, and stands down if the pocket is full, the lift is down, head is high or relief is open. It shortens the wait; it does not change what is caught.',
    scenario: 'funnel',
    camera: 'collector',
    engineering: true,
  },
  {
    id: 'fouling',
    problem: 'Gulf fouling',
    trap: 'Anything left in warm Gulf water grows over within weeks. Fabric barriers have clogged in under a month.',
    answer: 'Coarse panels are swapped on a four-week cycle, and load cells show when one is due. Miss two swaps and it still holds. Out of season the panels come out, so only the piles stay in the water.',
    scenario: 'fouled',
    camera: 'net',
    engineering: true,
  },
  {
    id: 'dark',
    problem: 'Night and murky water',
    trap: 'Camera-triggered systems go blind in the dark and in turbid water, which is when you least want to be guessing.',
    answer: 'The net needs no trigger at all. Sonar at the mouth and load cells on the net keep reporting without light.',
    scenario: 'night',
    camera: 'aerial',
  },
  {
    id: 'species',
    problem: 'A different jellyfish',
    trap: 'A design tuned to one species can fail on the next. Softer moon jellyfish tear and slip through more easily.',
    answer: 'The mesh stops every bell size we run, and the second net picks up what soft animals work through.',
    scenario: 'moon',
    camera: 'net',
  },
];
