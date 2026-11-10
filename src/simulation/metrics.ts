import { ASSUMPTIONS } from '../config/assumptions';
import { S_TRANSFERRED } from './Agent';
import type { ScreenStatus } from './screens';
import type { Balance, SimulationEngine } from './SimulationEngine';
import type { EngineKind } from './types';

export type ScreenLoad = 'LOW' | 'MEDIUM' | 'HIGH';

/** Per-world metrics in tonnes: everything an operator or a judge reads comes from here. */
export interface EngineMetrics {
  kind: EngineKind;
  time: number;
  active: number;
  /** Biomass that came into the channel (t). */
  enteredT: number;
  /** Biomass that reached the screens (t), and the rate now (t/h). */
  screensT: number;
  screenTph: number;
  screenLoad: ScreenLoad;
  screenBacklogT: number;
  screenStatus: ScreenStatus;
  deratedAt: number | null;
  trippedAt: number | null;
  /** Share of the biomass that came in and reached the screens. */
  intakeContactPct: number | null;
  /** On the nets, by net (t). */
  onNetT: [number, number];
  /** In the pockets (t), in the release line (t), released alive (t). */
  pocketT: number;
  inPipeT: number;
  collectedT: number;
  releasedT: number;
  /** Past each net without being collected there (t). */
  leakedT: [number, number];
  /** Being collected now (t/h). */
  collectTph: number;
  /** Mass balance: every jellyfish that entered is accounted for. */
  balance: Balance;
}

export function screenLoadFor(tph: number): ScreenLoad {
  if (tph >= ASSUMPTIONS.metrics.screenLoadHigh) return 'HIGH';
  if (tph >= ASSUMPTIONS.metrics.screenLoadMedium) return 'MEDIUM';
  return 'LOW';
}

export function computeEngineMetrics(e: SimulationEngine): EngineMetrics {
  const c = e.counters;
  const kg = e.kgPerAgent / 1000;
  const tr = e.transfer;
  const entered = c.entered;
  const min = ASSUMPTIONS.metrics.minSample;
  const scr = e.screens;
  return {
    kind: e.kind,
    time: e.time,
    active: e.pool.active,
    enteredT: entered * kg,
    screensT: scr.totalT,
    screenTph: scr.arrivalTph,
    screenLoad: screenLoadFor(scr.arrivalTph),
    screenBacklogT: scr.backlog,
    screenStatus: scr.status,
    deratedAt: scr.deratedAt,
    trippedAt: scr.trippedAt,
    intakeContactPct: entered >= min ? c.intakeContacts / entered : null,
    onNetT: [e.onNet[0] * kg, e.onNet[1] * kg],
    pocketT: tr ? tr.queueLength * kg : 0,
    inPipeT: tr ? e.countState(S_TRANSFERRED) * kg : 0,
    collectedT: c.diverted * kg,
    releasedT: c.released * kg,
    leakedT: [c.leaked[0] * kg, c.leaked[1] * kg],
    collectTph: e.collectEMA * kg * 3600,
    balance: e.balance(),
  };
}
