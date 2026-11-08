import type { SpeciesKey } from '../config/assumptions';

export type EngineKind = 'baseline' | 'sweepline';

/** Experimental sweep assist at the funnel mouths: off (passive, the default), automatic, or a manual test run. */
export type AssistMode = 'off' | 'auto' | 'manual';

/** Net A stands upstream, net B catches what gets past it. */
export type NetIndex = 0 | 1;

export interface SimParams {
  seed: number;
  /** Simulated agent budget (performance setting; each agent stands for more biomass when it is lower). */
  agentBudget: number;
  /** Biomass arriving with the bloom (t/h). */
  bloomRate: number;
  species: SpeciesKey;
  /** Bloom mean depth (m) and its spread; the species' own unless a scenario overrides them. */
  bloomMeanDepth: number;
  bloomDepthSD: number;
  /** Along-shore current outside the channel (m/s) and the direction it flows toward (compass bearing). */
  currentSpeed: number;
  currentBearing: number;
  /** Significant wave height offshore, Hs (m). */
  waveHeight: number;
  /** Units running (each draws its condenser flow through the channel). */
  unitsRunning: number;
  /** Weeks since the panels in the water were swapped for clean ones. */
  foulingWeeks: number;
  /** Second net behind the first. */
  secondNet: boolean;
  /** Standby collector pump installed and armed. */
  standbyEnabled: boolean;
  /** Experimental sweep assist at the funnel mouths. Off means passive guidance only. */
  assistMode: AssistMode;
  /** Night or turbid water: cameras are blind, the sonar and load cells carry on. */
  night: boolean;
  /** Drive the outside current from the recorded tide at the site instead of the fixed speed and bearing. */
  tide: boolean;
  /** Hours into the tidal record at which the run starts. */
  tideStart: number;
  /** Reference conditions recorded with the run (not used by the agent model). */
  waterTemp: number;
  salinity: number;
}

export const DEFAULT_PARAMS: SimParams = {
  seed: 240826,
  agentBudget: 3000,
  // The upper end of documented intake events, about 200 t in a day at its peak (Shin Hanul 2024) to 25 t/h.
  bloomRate: 25,
  species: 'catostylus',
  bloomMeanDepth: 2.4,
  bloomDepthSD: 1.4,
  currentSpeed: 0.2,
  currentBearing: 242,
  waveHeight: 0.6,
  unitsRunning: 4,
  foulingWeeks: 2,
  secondNet: true,
  standbyEnabled: true,
  assistMode: 'off',
  night: false,
  tide: false,
  tideStart: 0,
  waterTemp: 28.6,
  salinity: 41.2,
};

export type ModuleStatus = 'ONLINE' | 'STANDBY' | 'ACTIVATING' | 'FAULT' | 'DISABLED' | 'OFF';

/** Faults and conditions an operator (or a judge) can inject while the twin runs. */
export type FailureKey = 'pumpPrimary' | 'pumpStandby' | 'panelTear' | 'debris' | 'unitTrip' | 'storm' | 'surge' | 'sonarLoss';

export type StatusCode = 'READY' | 'WARNING' | 'ARMING' | 'NOMINAL' | 'ELEVATED' | 'RELIEF' | 'OVERLOAD' | 'STANDBY';

export type EventLevel = 'info' | 'ok' | 'warn' | 'alarm';

export interface SimEvent {
  id: number;
  /** Simulated time of the event (s). */
  t: number;
  level: EventLevel;
  message: string;
}
