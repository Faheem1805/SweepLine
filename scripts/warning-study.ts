/**
 * Warning time: from the sonar at the mouth first resolving the bloom to the first animal on net A,
 * over the same five blooms as the main study.
 *
 *   npx tsx scripts/warning-study.ts
 */
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { DEFAULT_PARAMS } from '../src/simulation/types';

/** Biomass the controller treats as a sonar contact (kg). Keep in step with SimController. */
const CONTACT_KG = 200;
const h = 0.4;
const out: number[] = [];
for (const seed of [1000, 8919, 16838, 24757, 32676]) {
  const p = { ...DEFAULT_PARAMS, seed };
  const s = new SimulationEngine('sweepline', p);
  s.reset(p, 'approach');
  s.transfer!.running = true;
  let t = 0;
  let sonar = -1;
  while (t < 5000 && s.counters.encountered === 0) {
    s.step(h);
    t += h;
    if (sonar < 0 && s.sonarKg > CONTACT_KG) sonar = t;
  }
  const lead = (t - sonar) / 60;
  out.push(lead);
  console.log(`seed ${seed}: sonar ${(sonar / 60).toFixed(1)} min, net ${(t / 60).toFixed(1)} min, lead ${lead.toFixed(1)} min`);
}
console.log(`lead ${Math.min(...out).toFixed(1)}–${Math.max(...out).toFixed(1)} min`);
