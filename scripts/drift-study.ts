/**
 * Where do released jellyfish go? Compares release policies on the recorded Oct–Nov 2025 current
 * and wind and the real coastline (src/simulation/drift.ts): animals released every hour of the
 * season, each followed for the drift horizon. Also follows a natural bloom (no SweepLine) for
 * reference, and the sensitivity of the key results to windage and diffusivity.
 *
 *   npm run study:drift            # prints the table and writes src/data/drift.generated.ts
 *   npm run study:drift -- windage=0.02 diffusivity=3   # one sensitivity case (prints only)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSUMPTIONS } from '../src/config/assumptions';
import { OUTLETS, SITE } from '../src/config/site';
import type { DriftData } from '../src/data/driftTypes';
import { buildLandMask, runDrift, type DriftOutcome, type ReleasePolicy } from '../src/simulation/drift';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`${k}=`))?.split('=')[1];
const windage = arg('windage') !== undefined ? Number(arg('windage')) : undefined;
const diffusivity = arg('diffusivity') !== undefined ? Number(arg('diffusivity')) : undefined;
const sensitivity = windage !== undefined || diffusivity !== undefined;

const xc = (SITE.intake.x0 + SITE.intake.x1) / 2;
const R = ASSUMPTIONS.release.design;
/** Down-tide side for a current u toward +x: +x for u ≥ 0. +x runs along the shore toward the WSW. */
const downTide = (u: number) => (u >= 0 ? 1 : -1);

const POLICIES: ReleasePolicy[] = [
  { id: 'as-built', label: 'Near the intake: down-tide outlet ~110 m along, 70 m out', point: (u) => OUTLETS[u >= 0 ? 0 : 1] },
  { id: 'offshore-1000', label: 'Straight out, 1 km offshore', point: () => ({ x: xc, z: 1000 }) },
  { id: 'offshore-2000', label: 'Straight out, 2 km offshore', point: () => ({ x: xc, z: 2000 }) },
  { id: 'downtide-1000', label: 'Valve to the down-tide side, 1 km along, 300 m out', point: (u) => ({ x: xc + downTide(u) * 1000, z: 300 }) },
  { id: 'downtide-2000', label: 'Valve to the down-tide side, 2 km along, 300 m out (two lines)', point: (u) => ({ x: xc + downTide(u) * 2000, z: 300 }) },
  {
    id: 'design',
    label: R.side === 'down-tide' ? `Design: valve to the down-tide side, ${R.along / 1000} km along, ${R.offshore} m out` : `Design: one line down-drift (WSW), ${R.along / 1000} km along, ${R.offshore} m out`,
    point: (u) => ({ x: xc + (R.side === 'down-tide' ? downTide(u) : 1) * R.along, z: R.offshore }),
  },
  { id: 'downdrift-3000', label: 'Down-drift (WSW) only, 3 km along, 300 m out', point: () => ({ x: xc + 3000, z: 300 }) },
  { id: 'updrift-2000', label: 'Up-drift (ENE) only, 2 km along, 300 m out', point: () => ({ x: xc - 2000, z: 300 }) },
  {
    // Reference: a natural bloom 1–3 km up-current, 50–300 m offshore, with no SweepLine.
    id: 'natural',
    label: 'No SweepLine: a bloom 1–3 km up-current, near the shore',
    point: (u, rand) => ({ x: xc - downTide(u) * (1000 + 2000 * rand()), z: 50 + 250 * rand() }),
  },
];
/** Shown on the Evidence page, in order. */
const SHOWN = ['as-built', 'offshore-2000', 'design'];
const CASES = [
  { windage: 0, diffusivity: ASSUMPTIONS.drift.diffusivity },
  { windage: 0.02, diffusivity: ASSUMPTIONS.drift.diffusivity },
  { windage: ASSUMPTIONS.drift.windage, diffusivity: 0.3 },
  { windage: ASSUMPTIONS.drift.windage, diffusivity: 3 },
];

const t0 = performance.now();
const mask = buildLandMask();
const pct = (v: number) => `${(v * 100).toFixed(0).padStart(3)}%`;
console.log(
  `Release study · windage ${windage ?? ASSUMPTIONS.drift.windage} · diffusivity ${diffusivity ?? ASSUMPTIONS.drift.diffusivity} m²/s · followed ${ASSUMPTIONS.drift.horizon / 86400} days`,
);
console.log('policy                                                        back ≤1d ≤3d  stranded away  at sea  median h');
const results: Array<{ outcome: DriftOutcome; tracks: Array<Array<[number, number]>> }> = [];
for (const p of POLICIES) {
  const r = runDrift(p, mask, { windage, diffusivity, tracks: SHOWN.includes(p.id) ? 18 : 0 });
  results.push(r);
  const o = r.outcome;
  console.log(
    `${o.label.padEnd(62)}${pct(o.backAtSite)} ${pct(o.backWithin1d)} ${pct(o.backWithin3d)}   ${pct(o.stranded)}  ${pct(o.carriedAway)}  ${pct(o.atSea)}   ${o.medianReturnH === null ? '—' : o.medianReturnH.toFixed(0)}`,
  );
}

if (!sensitivity) {
  // Sensitivity of the share back at the site, for the policies shown.
  const ranges: DriftData['ranges'] = {};
  for (const id of [...SHOWN, 'natural']) {
    const p = POLICIES.find((q) => q.id === id)!;
    const base = results.find((r) => r.outcome.id === id)!.outcome.backAtSite;
    const vals = [base, ...CASES.map((c) => runDrift(p, mask, { ...c, perRelease: 10 }).outcome.backAtSite)];
    ranges[id] = { min: Math.round(Math.min(...vals) * 1000) / 1000, max: Math.round(Math.max(...vals) * 1000) / 1000 };
    console.log(`  sensitivity ${id}: back at site ${pct(ranges[id].min)}–${pct(ranges[id].max)}`);
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const data: DriftData = {
    generatedAt: new Date().toISOString().slice(0, 10),
    horizonDays: ASSUMPTIONS.drift.horizon / 86400,
    windage: ASSUMPTIONS.drift.windage,
    diffusivity: ASSUMPTIONS.drift.diffusivity,
    released: results[0].outcome.released,
    shown: SHOWN,
    design: 'design',
    natural: 'natural',
    outcomes: results.map(({ outcome: o }) => ({
      ...o,
      backAtSite: round(o.backAtSite),
      stranded: round(o.stranded),
      carriedAway: round(o.carriedAway),
      atSea: round(o.atSea),
      backWithin1d: round(o.backWithin1d),
      backWithin3d: round(o.backWithin3d),
      medianReturnH: o.medianReturnH === null ? null : Math.round(o.medianReturnH),
    })),
    ranges,
    tracks: Object.fromEntries(
      results
        .filter(({ outcome }) => SHOWN.includes(outcome.id))
        .map(({ outcome, tracks }) => [outcome.id, tracks.map((t) => t.map(([x, z]) => [Math.round(x), Math.round(z)] as [number, number]))]),
    ),
  };
  const out = resolve(process.cwd(), 'src/data/drift.generated.ts');
  const body =
    `// Generated by scripts/drift-study.ts on ${data.generatedAt} — do not edit by hand.\n` +
    `// Released-animal drift on the recorded Oct–Nov 2025 current and wind and the OpenStreetMap coastline (src/simulation/drift.ts).\n` +
    `import type { DriftData } from './driftTypes';\n\n` +
    `export const DRIFT_DATA: DriftData = ${JSON.stringify(data)};\n`;
  writeFileSync(out, body);
  console.log(`wrote ${out} (${(body.length / 1024).toFixed(0)} KB)`);
}
console.log(`(${results[0].outcome.released} animals per policy · ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
