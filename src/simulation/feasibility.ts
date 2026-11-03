import { ASSUMPTIONS } from '../config/assumptions';
import { getCurtainLayout } from './geometry';
import { TIDE } from './tide';
import type { AnchorAngle } from './types';

/**
 * What it takes to run one guide line, from the twin's geometry and design assumptions (first
 * estimates for sizing, not supplier quotes):
 *   - how much bloom crosses the curtain (the nearshore band it spans × skirt depth × current),
 *   - how much the transfer line can carry,
 *   - the power for the jets and the transfer pump (Darcy–Weisbach friction over the release line).
 */

const RHO = 1025;
const G = 9.81;
/** Kinematic viscosity of warm seawater (m²/s) and HDPE wall roughness (m). */
const NU = 0.9e-6;
const ROUGHNESS = 7e-6;

/** Bloom used for sizing: density (animals per m³) and wet mass per animal (kg), low and high. */
export const SIZING_BLOOM = {
  density: [0.1, 0.3] as const,
  /** 0.33 kg: mean of 503 Gulf Catostylus (Oman Sea, 2024); 3 kg: a large 45 cm Blue Blubber. */
  mass: [0.33, 3] as const,
};

export interface Feasibility {
  /** Width of the nearshore band the curtain spans across the current (m). */
  catchmentWidth: number;
  /** Spring-tide current used for sizing (m/s): the season's 95th percentile. */
  current: number;
  /** Bloom crossing the curtain (t/h), low and high case. */
  bloomLoad: [number, number];
  /** Transfer line capacity (t/h) and water flow (m³/s). */
  capacity: number;
  flow: number;
  /** Length of the release line (m) and the pump head (m). */
  lineLength: number;
  head: number;
  /** Power while running (kW). */
  pumpKW: number;
  jetsKW: number;
  totalKW: number;
}

export function feasibility(angle: AnchorAngle, skirt: number, jetLevel: number): Feasibility {
  const L = getCurtainLayout(angle);
  const T = ASSUMPTIONS.transfer;
  const catchmentWidth = Math.abs(L.end.z - L.upstream.z);
  const current = Math.max(Math.abs(TIDE.stats.p5), Math.abs(TIDE.stats.p95));
  const crossing = current * catchmentWidth * skirt;
  const tph = (density: number, mass: number) => (crossing * density * mass * 3600) / 1000;
  const bloomLoad: [number, number] = [tph(SIZING_BLOOM.density[0], SIZING_BLOOM.mass[0]), tph(SIZING_BLOOM.density[1], SIZING_BLOOM.mass[1])];

  const area = (Math.PI / 4) * T.pipeBore * T.pipeBore;
  const flow = area * T.pipeVelocity;
  const capacity = (flow * T.maxJellyFraction * RHO * 3600) / 1000;

  // Release line: along the shore to the design outlet, plus the run out to it (~10 %).
  const lineLength = Math.hypot(ASSUMPTIONS.release.design.along, ASSUMPTIONS.release.design.offshore) * 1.1;
  const re = (T.pipeVelocity * T.pipeBore) / NU;
  const f = 0.25 / Math.log10(ROUGHNESS / (3.7 * T.pipeBore) + 5.74 / re ** 0.9) ** 2;
  const vHead = (T.pipeVelocity * T.pipeVelocity) / (2 * G);
  const head = f * (lineLength / T.pipeBore) * vHead + T.minorLossK * vHead;
  const pumpKW = (RHO * G * flow * head) / T.pumpEfficiency / 1000;
  const jetsKW = jetLevel ** 3 * ASSUMPTIONS.jets.designPowerKW;
  return { catchmentWidth, current, bloomLoad, capacity, flow, lineLength, head, pumpKW, jetsKW, totalKW: pumpKW + jetsKW };
}
