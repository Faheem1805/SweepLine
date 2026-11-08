import { ASSUMPTIONS, SPECIES } from '../config/assumptions';
import { SITE, seabedDepth, waveExposure } from '../config/site';
import {
  AgentPool,
  F_DIVERTED,
  F_ENCOUNTERED,
  F_ENTERED,
  F_FROM_EAST,
  F_LEAKED,
  F_LEAKED_B,
  F_RESOLVED,
  F_SNAGGED,
  STATE_NAMES,
  S_APPROACHING,
  S_FREE_DRIFT,
  S_GUIDED,
  S_INACTIVE,
  S_INTAKE_CONTACT,
  S_PAST_NET,
  S_RELEASED,
  S_TRANSFERRED,
  S_TRANSFER_QUEUE,
  S_FUNNEL,
} from './Agent';
import { AssistUnit } from './assist';
import { FlowField } from './flowField';
import { FUNNELS, funnelWidth, NETS, pointOnNet, type Funnel } from './geometry';
import { NetState } from './net';
import { ScreenState } from './screens';
import { fbm1, hash01, SeededRandom, valueNoise } from './seededRandom';
import { TRANSFER_TPH, TransferState } from './transfer';
import type { EngineKind, NetIndex, SimParams } from './types';

const N = ASSUMPTIONS.net;
const K = ASSUMPTIONS.collector;
const AS = ASSUMPTIONS.assist;
/** Distance past the mouth, along the current, at which a bloom has clearly gone by (m). */
const PASS_X = 420;
/** West of this (m) nothing is near a funnel: a cheap test before the funnel geometry. */
const FUNNEL_X0 = Math.min(FUNNELS[0].mouthIn.x, FUNNELS[1].mouthIn.x) - 2;
/** Recent mouth-to-throat times kept for the readout. */
const TRANSIT_WINDOW = 64;
/** The lift draws an animal once it is this close to the wet-well entry, in plan (m). */
export const SUCTION_REACH = 1.2;

export interface Counters {
  spawned: number;
  dropped: number;
  /** Agents that reached the intake screens. */
  intakeContacts: number;
  /** Agents that went on past the site without reaching the screens or a collector. */
  exited: number;
  /** Agents that came into the channel. */
  entered: number;
  /** Agents that touched a net. */
  encountered: number;
  /** Agents that went through a funnel's throat into its pocket: collected. */
  diverted: number;
  /** Agents past each net without being collected there. */
  leaked: [number, number];
  transferred: number;
  released: number;
}

/** Where every jellyfish that entered the site is (see `SimulationEngine.balance`). */
export interface Balance {
  entered: number;
  contact: number;
  diverted: number;
  passed: number;
  inWater: number;
  /** The four add up to `entered`. */
  closes: boolean;
}

export type MarkerKind = 'leak' | 'intake' | 'release';

export interface Marker {
  x: number;
  y: number;
  z: number;
  t: number;
  kind: MarkerKind;
}

export interface AgentInfo {
  id: number;
  slot: number;
  state: (typeof STATE_NAMES)[number];
  depth: number;
  speed: number;
  x: number;
  z: number;
  size: number;
  transitRemaining: number | null;
}

const zeroCounters = (): Counters => ({
  spawned: 0,
  dropped: 0,
  intakeContacts: 0,
  exited: 0,
  entered: 0,
  encountered: 0,
  diverted: 0,
  leaked: [0, 0],
  transferred: 0,
  released: 0,
});

const MARKER_CAPACITY = 128;

/**
 * Agent-based engineering simulation of one world (baseline, or with SweepLine) — not validated
 * field performance.
 *
 * Jellyfish drift with the bloom along the coast; the water the plant draws carries the ones in its
 * band into the channel. With SweepLine, two nets stand across the channel: animals meet the bloom
 * face, are swept along it by the plant's own flow and collected at the east wall.
 */
export class SimulationEngine {
  readonly kind: EngineKind;
  params: SimParams;
  pool: AgentPool;
  rng: SeededRandom;
  readonly flow = new FlowField();
  /** The two guide nets (SweepLine world only). */
  nets: NetState[] = [];
  transfer: TransferState | null = null;
  readonly screens = new ScreenState();
  counters: Counters = zeroCounters();
  time = 0;
  bloomActive = true;
  /** Extra bloom arriving for a while (stress test), as a multiplier of the rate. */
  surge = 1;
  /** Biomass one agent stands for (kg). */
  kgPerAgent: number = ASSUMPTIONS.agent.kgPerAgent;
  /** Agents on each net now. */
  readonly onNet = [0, 0];
  /** Pocket capacity (agents): past it the throat closes. */
  holdCapacity = 100;
  /** Funnel capacity (agents): past it the mouth closes and animals back up along the net. */
  funnelCapacity = 300;
  /** Agents in each funnel (past the mouth, short of the throat) at the end of the last step. */
  readonly inFunnel = [0, 0];
  /** Agents stalled, and snagged, at each funnel and its approach zone, last step. */
  readonly stalled = [0, 0];
  readonly snagged = [0, 0];
  /** Stalled and snagged biomass at the funnels, integrated over time (kg·s). */
  stallKgS = 0;
  snagKgS = 0;
  /** Mouth-to-throat times (s): all of them, and the latest few. */
  transitSum = 0;
  transitCount = 0;
  readonly transits: number[] = [];
  /** Experimental sweep assist at each funnel mouth (SweepLine world only). */
  assist: AssistUnit[] = [];
  /** Releases per second (EMA). */
  releaseEMA = 0;
  /** Agents arriving at a pocket per second (EMA). */
  collectEMA = 0;
  /** Agents coming in through the mouth per second (EMA). */
  enterEMA = 0;
  /** Biomass inside the sonar's range, heading in (kg). */
  sonarKg = 0;

  readonly markers: Marker[] = [];
  markerSeq = 0;

  private spawnAcc = 0;
  private nextId = 1;
  private releasesThisStep = 0;
  private collectsThisStep = 0;
  private entersThisStep = 0;
  private readonly tmp = { x: 0, z: 0 };
  private readonly tally: [Float32Array, Float32Array] = [new Float32Array(NETS[0].panels), new Float32Array(NETS[1].panels)];
  /** Agents stopped on each net behind a full funnel, and in each funnel behind a full pocket. */
  private readonly backed = [0, 0];
  private readonly backedNext = [0, 0];
  private readonly fBacked = [0, 0];
  private readonly fBackedNext = [0, 0];
  private readonly funnelEntries = [0, 0];
  private readonly inFunnelNext = [0, 0];
  /** What the mouth sonar sees this step, per net: biomass present (kg), at the mouth (kg), speed along the net. */
  private readonly zoneKg = [0, 0];
  private readonly mouthKg = [0, 0];
  private readonly speedSum = [0, 0];
  private readonly speedN = [0, 0];

  constructor(kind: EngineKind, params: SimParams) {
    this.kind = kind;
    this.params = { ...params };
    this.pool = new AgentPool(SimulationEngine.poolSize(params.agentBudget));
    this.rng = new SeededRandom(params.seed);
    this.reset(params, 'none');
  }

  static poolSize(budget: number): number {
    return budget * 8 + 64;
  }

  reset(params: SimParams, fill: 'approach' | 'none'): void {
    this.params = { ...params };
    const need = SimulationEngine.poolSize(params.agentBudget);
    if (this.pool.capacity !== need) this.pool = new AgentPool(need);
    else this.pool.clear();
    this.rng = new SeededRandom(params.seed);
    this.counters = zeroCounters();
    this.time = 0;
    this.spawnAcc = 0;
    this.nextId = 1;
    this.bloomActive = true;
    this.surge = 1;
    this.onNet.fill(0);
    this.backed.fill(0);
    this.fBacked.fill(0);
    this.inFunnel.fill(0);
    this.funnelEntries.fill(0);
    this.stalled.fill(0);
    this.snagged.fill(0);
    this.stallKgS = 0;
    this.snagKgS = 0;
    this.transitSum = 0;
    this.transitCount = 0;
    this.transits.length = 0;
    this.releaseEMA = 0;
    this.collectEMA = 0;
    this.enterEMA = 0;
    this.sonarKg = 0;
    this.markers.length = 0;
    this.markerSeq = 0;
    this.screens.reset();
    this.flow.releaseJet = 0;
    if (this.kind === 'sweepline') {
      this.nets = NETS.map((L) => new NetState(L));
      this.transfer = new TransferState();
      this.assist = FUNNELS.map((F) => new AssistUnit(F));
      for (const a of this.assist) a.reset(params.assistMode);
    } else {
      this.nets = [];
      this.transfer = null;
      this.assist = [];
    }
    this.applyParams(params);
    if (fill === 'approach') this.initialFill();
  }

  /** Apply live parameter changes. */
  applyParams(params: SimParams): void {
    this.params = { ...params };
    this.flow.setCurrent(params.currentSpeed, params.currentBearing);
    this.flow.plantFlow = ASSUMPTIONS.plant.unitFlowM3s * params.unitsRunning;
    this.kgPerAgent = (ASSUMPTIONS.agent.kgPerAgent * ASSUMPTIONS.agent.referenceBudget) / params.agentBudget;
    this.holdCapacity = Math.max(8, Math.round(K.holdKg / this.kgPerAgent));
    this.funnelCapacity = Math.max(8, Math.round(K.funnelHoldKg / this.kgPerAgent));
    for (const a of this.assist) a.setMode(params.assistMode);
    for (const net of this.nets) net.setFouling(params.foulingWeeks);
    if (this.nets.length === 2) this.nets[1].active = params.secondNet;
    if (this.transfer) {
      this.transfer.standbyEnabled = params.standbyEnabled;
      this.transfer.designRate = (TRANSFER_TPH * 1000) / 3600 / this.kgPerAgent;
    }
  }

  /** Set the current without a full parameter update (the tide changes it every step). */
  setCurrent(speed: number, bearing: number): void {
    this.params.currentSpeed = speed;
    this.params.currentBearing = bearing;
    this.flow.setCurrent(speed, bearing);
  }

  /** Water velocity at (x, z): the flow field plus any sweep assist. Agents and the drawn arrows both read it. */
  sampleWater(x: number, z: number, depth: number, out: { x: number; z: number }): void {
    this.flow.sample(x, z, depth, out);
    if (x > FUNNEL_X0 - ASSUMPTIONS.assist.barLength) for (const a of this.assist) a.addVelocity(x, z, out);
  }

  /** Bell area blocking the mesh, per kg, for this species. */
  get blockPerKg(): number {
    return SPECIES[this.params.species].blockPerKg;
  }

  // ---------------------------------------------------------------- spawning

  /** Side of the site the current brings the bloom from: −1 from −x, +1 from +x. */
  private upstreamSign(): number {
    return this.flow.dirX >= 0 ? -1 : 1;
  }

  /** Bloom arrival rate (agents/s) along the supply line. */
  spawnRate(): number {
    const P = this.params;
    const base = (P.bloomRate * 1000) / 3600 / this.kgPerAgent;
    const v = ASSUMPTIONS.bloom.rateVariation * (2 * fbm1(P.seed * 13 + 5, this.time / 400) - 1);
    return Math.max(0, base * this.surge * (1 + v));
  }

  private patchCenter(): number {
    const w = ASSUMPTIONS.bloom.patchWander;
    return SITE.spawn.zCenter + w * (2 * fbm1(this.params.seed * 7 + 3, this.time / 600) - 1);
  }

  /** Cross-shore position of a new agent (mostly the main patch, the rest a broad background), folded into the spawn band. */
  private lateralZ(u1: number, u2: number, n1: number): number {
    const sp = SITE.spawn;
    let z: number;
    if (u1 < ASSUMPTIONS.bloom.mainPatchFraction) z = this.patchCenter() + n1 * sp.zSigma;
    else z = sp.zMin + u2 * (sp.zMax - sp.zMin);
    if (z < sp.zMin) z = Math.min(sp.zMax, 2 * sp.zMin - z);
    if (z > sp.zMax) z = sp.zMax - (z - sp.zMax) * 0.5;
    return z;
  }

  /** The bloom already on its way when a run starts, from the supply line up to its leading edge. */
  private initialFill(): void {
    const S = SITE.spawn;
    const sign = this.upstreamSign();
    const U = Math.max(0.08, this.params.currentSpeed);
    const span = S.supplyX - S.leadX;
    const count = Math.round((this.spawnRate() * span) / U);
    for (let i = 0; i < count; i++) this.spawnOne(sign * (S.leadX + this.rng.next() * span));
  }

  /** Spawn a concentrated surge (stress test) behind the bloom's leading edge. */
  spawnSurge(count: number): void {
    const S = SITE.spawn;
    const sign = this.upstreamSign();
    for (let i = 0; i < count; i++) this.spawnOne(sign * (S.leadX + this.rng.next() * 160), false);
  }

  /**
   * Spawn one agent (`visible`: drawn at once rather than fading in). Always consumes the same
   * number of random draws so the baseline and SweepLine engines stay synchronised.
   */
  private spawnOne(xOverride: number | null = null, visible = xOverride !== null): void {
    const r = this.rng;
    const u1 = r.next();
    const u2 = r.next();
    const u3 = r.next();
    const u4 = r.next();
    const u5 = r.next();
    const u6 = r.next();
    const u7 = r.next();
    const u8 = r.next();
    const n1 = r.normal();
    const n2 = r.normal();
    const agentId = this.nextId++;
    this.counters.spawned++;

    const sp = SITE.spawn;
    const sign = this.upstreamSign();
    const z = this.lateralZ(u1, u2, n1);
    const x = xOverride !== null ? xOverride : sign * (sp.supplyX + u3 * sp.jitterX);

    const slot = this.pool.alloc();
    if (slot < 0) {
      this.counters.dropped++;
      return;
    }
    const A = ASSUMPTIONS.agent;
    const P = this.params;
    const S = SPECIES[P.species];
    const p = this.pool;
    const seabed = seabedDepth(x, z);
    let pref = P.bloomMeanDepth + P.bloomDepthSD * n2;
    pref = Math.min(Math.max(pref, A.minDepth), seabed - 0.8);

    p.id[slot] = agentId;
    p.state[slot] = S_APPROACHING;
    p.flags[slot] = x > 0 ? F_FROM_EAST : 0;
    p.side[slot] = 0;
    p.lane[slot] = 0;
    p.px[slot] = x;
    p.py[slot] = -pref;
    p.pz[slot] = z;
    this.flow.sample(x, z, pref, this.tmp);
    p.vx[slot] = this.tmp.x;
    p.vy[slot] = 0;
    p.vz[slot] = this.tmp.z;
    p.size[slot] = S.bellMin + u4 * (S.bellMax - S.bellMin);
    p.phase[slot] = u5;
    p.tint[slot] = u6;
    p.depthZ[slot] = n2;
    p.swimSpeed[slot] = S.swimMin + u7 * (S.swimMax - S.swimMin);
    p.heading[slot] = (u8 - 0.5) * Math.PI * 2;
    p.stateTime[slot] = 0;
    p.contactStart[slot] = -1;
    p.timer[slot] = 0;
    p.queueIndex[slot] = -1;
    p.slow[slot] = 0;
    p.mouthTime[slot] = -1;
    p.fade[slot] = visible ? 1 : 0;
  }

  // ---------------------------------------------------------------- stepping

  step(dt: number): void {
    this.time += dt;
    this.releasesThisStep = 0;
    this.collectsThisStep = 0;
    this.entersThisStep = 0;

    const Q = this.flow.plantFlow;
    const block = this.blockPerKg;
    for (const net of this.nets) net.update(dt, Q, block);
    if (this.transfer) this.transfer.update(dt);
    this.flow.releaseJet = Math.min(1, this.releaseEMA * 8);

    if (this.bloomActive) {
      this.spawnAcc += this.spawnRate() * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnOne();
      }
    }

    this.updateAgents(dt);
    if (this.transfer) {
      this.processTransfer(dt);
      this.updateAssist(dt);
    }
    this.screens.update(dt);

    const r = 1 - Math.exp(-dt / 30);
    this.releaseEMA += (this.releasesThisStep / dt - this.releaseEMA) * r;
    this.collectEMA += (this.collectsThisStep / dt - this.collectEMA) * r;
    this.enterEMA += (this.entersThisStep / dt - this.enterEMA) * r;
  }

  private updateAgents(dt: number): void {
    const pool = this.pool;
    const { state, flags, px, py, pz, vx, vy, vz, id, depthZ, swimSpeed, heading, stateTime, contactStart, timer, fade, lane, slow, mouthTime } = pool;
    const P = this.params;
    const A = ASSUMPTIONS.agent;
    const S = SPECIES[P.species];
    const t = this.time;
    const relax = 1 - Math.exp(-dt / A.tau);
    const flow = this.flow;
    const tmp = this.tmp;
    const dom = SITE.domain;
    const C = SITE.channel;
    const hw = C.halfWidth;
    const mouth = C.mouthZ;
    const headZ = mouth + SITE.breakwater.headRadius;
    const toe = SITE.breakwater.outerToe;
    const intake = SITE.intake;
    const nets = this.nets;
    const transfer = this.transfer;
    const counters = this.counters;
    const kg = this.kgPerAgent;
    const mean = P.bloomMeanDepth;
    const sd = P.bloomDepthSD;
    // Depth an agent on the mesh takes up, along the net, in a full stack.
    const stackSpacing = this.blockPerKg * kg / C.depth;
    const stepNo = Math.floor(t / dt);
    let sonar = 0;

    this.tally[0].fill(0);
    this.tally[1].fill(0);
    this.onNet[0] = 0;
    this.onNet[1] = 0;
    this.backedNext[0] = 0;
    this.backedNext[1] = 0;
    this.fBackedNext[0] = 0;
    this.fBackedNext[1] = 0;
    this.inFunnelNext[0] = 0;
    this.inFunnelNext[1] = 0;
    for (let ni = 0; ni < 2; ni++) {
      this.zoneKg[ni] = 0;
      this.mouthKg[ni] = 0;
      this.speedSum[ni] = 0;
      this.speedN[ni] = 0;
      this.stalled[ni] = 0;
      this.snagged[ni] = 0;
    }
    const assistOn = this.assist.some((a) => a.speed > 0);

    for (let i = 0; i < pool.capacity; i++) {
      const st = state[i];
      if (st === S_INACTIVE) continue;
      if (fade[i] < 1) fade[i] = Math.min(1, fade[i] + dt * 0.25);

      if (st === S_TRANSFERRED) {
        timer[i] -= dt;
        if (timer[i] <= 0) this.releaseAgent(i);
        continue;
      }
      if (st === S_INTAKE_CONTACT) {
        timer[i] -= dt;
        if (timer[i] <= 0) pool.free(i);
        else this.rideToIntake(i, dt);
        continue;
      }
      stateTime[i] += dt;
      if (st === S_TRANSFER_QUEUE) {
        this.queueDynamics(i, dt, relax, FUNNELS[lane[i] as NetIndex]);
        continue;
      }

      let x = px[i];
      let z = pz[i];
      let depth = -py[i];
      const aid = id[i];
      const wasInside = Math.abs(x) < hw && z < mouth + 4;

      flow.sample(x, z, depth, tmp);
      if (assistOn && x > FUNNEL_X0 - ASSUMPTIONS.assist.barLength) for (const a of this.assist) a.addVelocity(x, z, tmp);
      let dvx = tmp.x;
      let dvz = tmp.z;

      // Self-propulsion: slow heading wander modulated by bell pulsation.
      const hd = heading[i] + (valueNoise(aid * 3 + 1, t * 0.05) - 0.5) * 0.8 * dt;
      heading[i] = hd;
      const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3.1 + pool.phase[i] * 6.283));
      const sw = swimSpeed[i] * pulse;
      dvx += Math.cos(hd) * sw;
      dvz += Math.sin(hd) * sw;
      dvx += (valueNoise(aid * 5 + 2, t * 0.07) - 0.5) * 2 * A.turbulence;
      dvz += (valueNoise(aid * 5 + 3, t * 0.07) - 0.5) * 2 * A.turbulence;

      // Vertical: swim toward the preferred depth of this individual within the bloom distribution.
      const seabed = seabedDepth(x, z);
      let pref = mean + sd * depthZ[i];
      if (pref < A.minDepth) pref = A.minDepth;
      if (pref > seabed - 0.8) pref = seabed - 0.8;
      let dvy = (depth - pref) * A.verticalGain;
      if (dvy > A.verticalMax) dvy = A.verticalMax;
      else if (dvy < -A.verticalMax) dvy = -A.verticalMax;
      dvy += (valueNoise(aid * 5 + 4, t * 0.05) - 0.5) * 2 * A.verticalNoise;

      let ns = st;
      let fl = flags[i];
      let guided = false;

      if (!(fl & F_ENTERED) && wasInside && z < mouth - 8) {
        fl |= F_ENTERED;
        counters.entered++;
        this.entersThisStep++;
      }

      // ---------------------------------------------------- nets
      if (wasInside) {
        for (let ni = 0; ni < nets.length; ni++) {
          const net = nets[ni];
          if (!net.active) continue;
          const L = net.line;
          // In the funnel the net is still the inner side, whatever the distance from it.
          const inF = st === S_FUNNEL && lane[i] === ni;
          const d = (x - L.ax) * L.nx + (z - L.az) * L.nz;
          if (!inF && (d < -0.2 || d > N.guideDistance)) continue;
          const s = (x - L.ax) * L.tx + (z - L.az) * L.tz;
          if (s < 0 || s > L.length) continue;
          const k = Math.min(net.n - 1, Math.floor(s / L.panelLength));
          if (net.drop[k] < 1) continue;
          if (net.torn[k]) {
            // Straight through the hole.
            const bit = ni === 0 ? F_LEAKED : F_LEAKED_B;
            if (!(fl & bit)) this.noteLeak(ni, x, depth, z);
            fl |= bit;
            ns = S_PAST_NET;
            continue;
          }
          if (net.relief[k] > 0 && depth < net.relief[k] * N.reliefDip) {
            // Over the dipped float line.
            const bit = ni === 0 ? F_LEAKED : F_LEAKED_B;
            if (!(fl & bit)) this.noteLeak(ni, x, depth, z);
            fl |= bit;
            ns = S_PAST_NET;
            continue;
          }
          if (!(fl & F_ENCOUNTERED)) {
            fl |= F_ENCOUNTERED;
            contactStart[i] = t;
            counters.encountered++;
          }
          guided = true;
          ns = inF ? S_FUNNEL : S_GUIDED;
          lane[i] = ni;
          if (!inF) this.onNet[ni]++;
          this.tally[ni][k] += kg;

          // The net stops the part of the flow that would carry the animal through it, and the rest sweeps it along.
          const vn = dvx * L.nx + dvz * L.nz;
          const vt = dvx * L.tx + dvz * L.tz;
          const press = d > N.standoff ? vn : Math.max(0, vn);
          let sweep = Math.max(vt, 0) * N.slide;

          // A snagged animal stays put until the flow works it free. Nothing else frees it.
          if (fl & F_SNAGGED) {
            timer[i] -= dt;
            if (timer[i] <= 0) fl &= ~F_SNAGGED;
            sweep = 0;
          } else {
            const u = net.through[k] / ASSUMPTIONS.screenCriteria.approachMax;
            if (hash01(aid, stepNo) < N.snagRate * u * u * dt) {
              fl |= F_SNAGGED;
              timer[i] = N.snagTime * (0.4 + 1.2 * hash01(aid, 3));
            }
          }

          // Behind a full pocket the funnel stacks up from the throat; behind a full funnel, the net from the mouth.
          if (transfer) {
            const F = FUNNELS[ni];
            if (inF) {
              if (transfer.queues[ni as NetIndex].length >= this.holdCapacity && s >= F.throatS - this.fBacked[ni] * stackSpacing) {
                sweep = 0;
                this.fBackedNext[ni]++;
              }
            } else if (this.inFunnel[ni] + this.funnelEntries[ni] >= this.funnelCapacity && s >= F.mouthS - this.backed[ni] * stackSpacing) {
              sweep = 0;
              this.backedNext[ni]++;
            }
          }

          dvx = L.tx * sweep + L.nx * press;
          dvz = L.tz * sweep + L.nz * press;

          // Some work through the mesh or a joint on the way along.
          const travelled = (sweep * dt) / L.panelLength;
          const nearBed = depth > seabed - N.jointBand;
          const leak = travelled * (S.leakPerPanel + (nearBed ? N.jointLeak : 0));
          if (leak > 0 && hash01(aid + ni * 7, stepNo) < leak) {
            x -= L.nx * (d + 0.6);
            z -= L.nz * (d + 0.6);
            fl |= ni === 0 ? F_LEAKED : F_LEAKED_B;
            ns = S_PAST_NET;
            guided = false;
            if (!inF) this.onNet[ni]--;
            this.noteLeak(ni, x, depth, z);
            break;
          }
          break;
        }
      }
      if (!guided && (st === S_GUIDED || st === S_FUNNEL) && ns === st) ns = S_FREE_DRIFT;
      if (st === S_PAST_NET && ns === S_PAST_NET && stateTime[i] > 40) ns = S_FREE_DRIFT;

      // ---------------------------------------------------- integrate
      vx[i] += (dvx - vx[i]) * relax;
      vy[i] += (dvy - vy[i]) * relax;
      vz[i] += (dvz - vz[i]) * relax;
      x += vx[i] * dt;
      z += vz[i] * dt;
      depth -= vy[i] * dt;
      if (depth < A.minDepth * 0.6) {
        depth = A.minDepth * 0.6;
        if (vy[i] > 0) vy[i] = 0;
      }
      if (depth > seabed - 0.4) {
        depth = seabed - 0.4;
        if (vy[i] < 0) vy[i] = 0;
      }

      // Walls and rock.
      const ax = Math.abs(x);
      if (wasInside) {
        if (ax > hw - 1.2 && z < mouth) x = (x < 0 ? -1 : 1) * (hw - 1.2);
      } else if (z < headZ && ax < toe + 0.5 && ax > hw - 1 && z >= SITE.shore.toeZ) {
        if (z <= mouth + 2) {
          x = (x < 0 ? -1 : 1) * (toe + 0.5);
          if (vx[i] * x < 0) vx[i] = 0;
        } else if (ax > hw) {
          z = headZ;
          if (vz[i] < 0) vz[i] = 0;
        }
      }
      if (z < SITE.shore.toeZ - 1) {
        z = SITE.shore.toeZ - 1;
        if (vz[i] < 0) vz[i] = 0;
      }

      // ---------------------------------------------------- funnel mouth, throat and pocket
      if (transfer && x > FUNNEL_X0 && ns !== S_PAST_NET) {
        let inside = false;
        let pocketed = false;
        for (let ni = 0; ni < nets.length; ni++) {
          if (!nets[ni].active) continue;
          const F = FUNNELS[ni];
          const L = F.line;
          const s1 = (x - L.ax) * L.tx + (z - L.az) * L.tz;
          if (s1 < F.mouthS || s1 > L.length) continue;
          const w1 = (x - L.ax) * L.nx + (z - L.az) * L.nz;
          if (w1 < -0.2 || w1 > (hw - L.ax - L.tx * s1) / L.nx + 0.5) continue;
          if (ns !== S_FUNNEL || lane[i] !== ni) {
            if (this.inFunnel[ni] + this.funnelEntries[ni] < this.funnelCapacity) {
              // Across the mouth: in the funnel, not collected yet.
              ns = S_FUNNEL;
              lane[i] = ni;
              mouthTime[i] = t;
              this.funnelEntries[ni]++;
            } else {
              // The mouth is closed by a full funnel: held on the net short of it.
              const back = s1 - F.mouthS + 0.02;
              x -= L.tx * back;
              z -= L.tz * back;
              const va = vx[i] * L.tx + vz[i] * L.tz;
              if (va > 0) {
                vx[i] -= L.tx * va;
                vz[i] -= L.tz * va;
              }
              break;
            }
          }
          inside = true;
          if (s1 >= F.throatS) {
            if (transfer.queues[ni as NetIndex].length < this.holdCapacity) {
              // Through the throat into the pocket: collected.
              this.noteTransit(t - mouthTime[i]);
              px[i] = x;
              pz[i] = z;
              py[i] = -depth;
              flags[i] = fl;
              this.enqueue(i, ni as NetIndex);
              pocketed = true;
              break;
            }
            // The throat is closed by a full pocket: held short of it.
            const back = s1 - F.throatS + 0.02;
            x -= L.tx * back;
            z -= L.tz * back;
            const va = vx[i] * L.tx + vz[i] * L.tz;
            if (va > 0) {
              vx[i] -= L.tx * va;
              vz[i] -= L.tz * va;
            }
          }
          // Between the net and the wing.
          const wmax = funnelWidth(F, Math.min(s1, F.throatS)) - 0.25;
          if (w1 > wmax) {
            x -= L.nx * (w1 - wmax);
            z -= L.nz * (w1 - wmax);
            const vw = vx[i] * L.nx + vz[i] * L.nz;
            if (vw > 0) {
              vx[i] -= L.nx * vw;
              vz[i] -= L.nz * vw;
            }
          }
          break;
        }
        if (pocketed) continue;
        // Swept back out of the mouth: on the net again, and it has to cross the mouth again.
        if (ns === S_FUNNEL && !inside) {
          ns = guided ? S_GUIDED : S_FREE_DRIFT;
          mouthTime[i] = -1;
        }
      }

      // What the mouth sonar sees: the sweep ahead of the spray bar, who is at the funnel, and who is stalled or snagged there.
      if (!transfer || (ns !== S_GUIDED && ns !== S_FUNNEL) || x <= FUNNEL_X0 - K.approachZone) slow[i] = 0;
      else {
        const ni = lane[i];
        const F = FUNNELS[ni];
        const L = F.line;
        const s1 = (x - L.ax) * L.tx + (z - L.az) * L.tz;
        const va = vx[i] * L.tx + vz[i] * L.tz;
        if (ns === S_GUIDED && s1 >= F.mouthS - AS.sweepFrom && s1 < F.mouthS - AS.sweepTo) {
          this.speedSum[ni] += va;
          this.speedN[ni]++;
        }
        if (s1 >= F.mouthS - K.approachZone) {
          slow[i] = va < K.stallSpeed ? slow[i] + dt : 0;
          this.zoneKg[ni] += kg;
          if (Math.abs(s1 - F.mouthS) < 4) this.mouthKg[ni] += kg;
          if (fl & F_SNAGGED) this.snagged[ni]++;
          else if (slow[i] >= K.stallAfter) this.stalled[ni]++;
        } else slow[i] = 0;
      }
      if (ns === S_FUNNEL) this.inFunnelNext[lane[i]]++;

      // Screens.
      if (z < intake.mouthZ + 0.8) {
        if (Math.abs(x) <= intake.x1) {
          px[i] = x;
          pz[i] = intake.mouthZ + 0.3;
          py[i] = -depth;
          flags[i] = fl;
          this.intakeContact(i);
          continue;
        }
        z = intake.mouthZ + 0.8;
        if (vz[i] < 0) vz[i] = 0;
      }

      px[i] = x;
      pz[i] = z;
      py[i] = -depth;
      flags[i] = fl;
      if (ns !== st) {
        state[i] = ns;
        stateTime[i] = 0;
      }

      // Sonar: biomass in range of the mouth, not yet inside.
      if (!(fl & F_ENTERED)) {
        const dx = x;
        const dz = z - mouth;
        if (dx * dx + dz * dz < ASSUMPTIONS.sonar.range * ASSUMPTIONS.sonar.range) sonar += kg;
      }

      // Went on past the site.
      const past = fl & F_FROM_EAST ? -x - PASS_X : x - PASS_X;
      if (past > 0 && !(fl & F_ENTERED) && !(fl & F_RESOLVED)) {
        fl |= F_RESOLVED;
        flags[i] = fl;
        counters.exited++;
      }
      let keep = 1;
      if (ns === S_RELEASED) keep = 1 - (stateTime[i] - ASSUMPTIONS.release.trackTime) / ASSUMPTIONS.release.fadeTime;
      else if (fl & F_RESOLVED && !(fl & F_DIVERTED) && past > 0) keep = 1 - past / 80;
      if (keep <= 0) {
        pool.free(i);
        continue;
      }
      if (keep < fade[i]) fade[i] = keep;
      if (x > dom.xMax || x < dom.xMin || z > dom.zMax) {
        if (!(fl & F_RESOLVED)) {
          flags[i] = fl | F_RESOLVED;
          counters.exited++;
        }
        pool.free(i);
      }
    }

    this.sonarKg = sonar;
    for (let ni = 0; ni < nets.length; ni++) {
      nets[ni].bioKg.set(this.tally[ni]);
      this.backed[ni] = this.backedNext[ni];
      this.fBacked[ni] = this.fBackedNext[ni];
      this.inFunnel[ni] = this.inFunnelNext[ni];
      this.funnelEntries[ni] = 0;
    }
    this.stallKgS += (this.stalled[0] + this.stalled[1]) * kg * dt;
    this.snagKgS += (this.snagged[0] + this.snagged[1]) * kg * dt;
  }

  private noteLeak(net: number, x: number, depth: number, z: number): void {
    this.counters.leaked[net]++;
    this.pushMarker(x, -depth, z, 'leak');
  }

  private enqueue(i: number, net: NetIndex): void {
    const p = this.pool;
    const tr = this.transfer!;
    const queue = tr.queues[net];
    const c = this.counters;
    let fl = p.flags[i];
    if (!(fl & F_RESOLVED)) {
      fl |= F_RESOLVED | F_DIVERTED;
      c.diverted++;
    }
    p.flags[i] = fl;
    p.state[i] = S_TRANSFER_QUEUE;
    p.stateTime[i] = 0;
    p.lane[i] = net;
    p.queueIndex[i] = queue.length;
    queue.push(i);
    this.collectsThisStep++;
  }

  private noteTransit(seconds: number): void {
    if (!(seconds >= 0)) return;
    this.transitSum += seconds;
    this.transitCount++;
    this.transits.push(seconds);
    if (this.transits.length > TRANSIT_WINDOW) this.transits.shift();
  }

  /** The assist controllers read the mouth sonar, the pocket, the lifts and the net, then set their pumps. */
  private updateAssist(dt: number): void {
    const tr = this.transfer!;
    for (let ni = 0; ni < this.assist.length; ni++) {
      const net = this.nets[ni];
      const on = net.active;
      this.assist[ni].update(dt, {
        presentKg: on ? this.zoneKg[ni] : 0,
        mouthKg: on ? this.mouthKg[ni] : 0,
        speed: on && this.speedN[ni] > 0 ? this.speedSum[ni] / this.speedN[ni] : Number.NaN,
        pocketFull: tr.queues[ni as NetIndex].length >= this.holdCapacity,
        liftAvailable: tr.running && tr.poweredPathAvailable,
        head: net.head,
        relief: net.reliefFraction > 0,
      });
    }
  }

  /** In the pocket: each animal closes up toward the wet-well entry in its turn, while a lift draws. */
  private queueDynamics(i: number, dt: number, relax: number, F: Funnel): void {
    const p = this.pool;
    const aid = p.id[i];
    const L = F.line;
    const q = Math.min(1, p.queueIndex[i] / Math.max(1, this.holdCapacity));
    const sT = F.entryS - 0.4 - q * (F.entryS - F.throatS - 0.6);
    const wT = 0.25 + hash01(aid, 11) * (F.throatWidth - 0.5);
    const tx = L.ax + L.tx * sT + L.nx * wT;
    const tz = L.az + L.tz * sT + L.nz * wT;
    const tdepth = 2.2 + hash01(aid, 13) * 4;
    const tr = this.transfer!;
    const vf = K.funnelSpeed * (tr.running && tr.poweredPathAvailable ? 1 : 0.2);
    let dvx = (tx - p.px[i]) * 0.3;
    let dvz = (tz - p.pz[i]) * 0.3;
    const m = Math.hypot(dvx, dvz);
    if (m > vf) {
      dvx *= vf / m;
      dvz *= vf / m;
    }
    const depth = -p.py[i];
    let dvy = (depth - tdepth) * 0.3;
    if (dvy > 0.08) dvy = 0.08;
    else if (dvy < -0.08) dvy = -0.08;
    dvx += (valueNoise(aid * 5 + 2, this.time * 0.3) - 0.5) * 0.01;
    dvz += (valueNoise(aid * 5 + 3, this.time * 0.3) - 0.5) * 0.01;
    p.vx[i] += (dvx - p.vx[i]) * relax * 2;
    p.vy[i] += (dvy - p.vy[i]) * relax * 2;
    p.vz[i] += (dvz - p.vz[i]) * relax * 2;
    p.px[i] += p.vx[i] * dt;
    p.pz[i] += p.vz[i] * dt;
    p.py[i] += p.vy[i] * dt;
  }

  /** The lift takes the animal at the head of each pocket, and only once it is at the wet-well entry. */
  private processTransfer(dt: number): void {
    const tr = this.transfer!;
    const p = this.pool;
    const rate = tr.capacityRate();
    tr.tokens = Math.min(tr.tokens + rate * dt, 4);
    let processed = 0;
    for (const ni of [0, 1] as const) {
      const queue = tr.queues[ni];
      if (queue.length === 0) continue;
      const end = FUNNELS[ni].entry;
      let n = 0;
      while (tr.tokens >= 1 && queue.length > 0) {
        const i = queue[0];
        if (Math.hypot(p.px[i] - end.x, p.pz[i] - end.z) > SUCTION_REACH) break;
        queue.shift();
        tr.tokens -= 1;
        n++;
        this.transferAgent(i);
      }
      if (n > 0) for (let j = 0; j < queue.length; j++) p.queueIndex[queue[j]] = j;
      processed += n;
    }
    if (tr.queueLength === 0 && tr.tokens > 1) tr.tokens = 1;
    tr.processedEMA += (processed / dt - tr.processedEMA) * (1 - Math.exp(-dt / 45));
  }

  private transferAgent(i: number): void {
    const p = this.pool;
    const T = ASSUMPTIONS.transfer;
    p.state[i] = S_TRANSFERRED;
    p.stateTime[i] = 0;
    p.queueIndex[i] = -1;
    p.timer[i] = (T.length / T.pipeVelocity) * (0.95 + 0.1 * hash01(p.id[i], 23));
    this.counters.transferred++;
  }

  private releaseAgent(i: number): void {
    const p = this.pool;
    const r = SITE.release;
    const aid = p.id[i];
    const lat = (hash01(aid, 29) - 0.5) * 3;
    p.px[i] = r.x + r.dirX * 1.5 - r.dirZ * lat;
    p.pz[i] = r.z + r.dirZ * 1.5 + r.dirX * lat;
    p.py[i] = -(1.0 + hash01(aid, 31) * 1.4);
    const js = ASSUMPTIONS.release.jetSpeed;
    p.vx[i] = r.dirX * js;
    p.vy[i] = 0;
    p.vz[i] = r.dirZ * js;
    p.state[i] = S_RELEASED;
    p.stateTime[i] = 0;
    p.fade[i] = 0.25;
    this.counters.released++;
    this.releasesThisStep++;
    if ((this.counters.released & 3) === 0) this.pushMarker(p.px[i], p.py[i], p.pz[i], 'release');
  }

  /** The unit whose intake this animal ends up at. */
  private intakeX(i: number): number {
    const u = SITE.basin.units;
    return u[Math.min(u.length - 1, Math.floor(hash01(this.pool.id[i], 31) * u.length))];
  }

  /** Past the channel nothing can stop it: it rides the flow along the basin to its unit's intake. */
  private rideToIntake(i: number, dt: number): void {
    const p = this.pool;
    const dx = this.intakeX(i) - p.px[i];
    const dz = SITE.basin.wallZ + 5 - p.pz[i];
    const d = Math.hypot(dx, dz);
    if (d < 2) return;
    const step = Math.min(d, this.flow.channelSpeed * dt);
    p.px[i] += (dx / d) * step;
    p.pz[i] += (dz / d) * step;
  }

  private intakeContact(i: number): void {
    const p = this.pool;
    p.state[i] = S_INTAKE_CONTACT;
    p.stateTime[i] = 0;
    const ride = Math.hypot(this.intakeX(i) - p.px[i], SITE.basin.wallZ + 5 - p.pz[i]) / this.flow.channelSpeed;
    p.timer[i] = ride + ASSUMPTIONS.screens.dwell;
    p.vx[i] = 0;
    p.vy[i] = 0;
    p.vz[i] = 0;
    if (!(p.flags[i] & F_RESOLVED)) {
      p.flags[i] |= F_RESOLVED;
      this.counters.intakeContacts++;
      this.screens.add(this.kgPerAgent);
    }
    this.pushMarker(this.intakeX(i), p.py[i], SITE.basin.wallZ + 2, 'intake');
  }

  private pushMarker(x: number, y: number, z: number, kind: MarkerKind): void {
    const m: Marker = { x, y, z, t: this.time, kind };
    if (this.markers.length < MARKER_CAPACITY) this.markers.push(m);
    else this.markers[this.markerSeq % MARKER_CAPACITY] = m;
    this.markerSeq++;
  }

  /** Tear out one panel of a net (stress test). */
  tearPanel(net: NetIndex, panel: number): void {
    const n = this.nets[net];
    if (n) n.torn[Math.min(n.n - 1, panel)] = 1;
  }

  /** Repair every torn panel. */
  repairPanels(): void {
    for (const n of this.nets) n.torn.fill(0);
  }

  /** Wave height (Hs) that reaches the net line, after the breakwaters (m). */
  get channelWave(): number {
    const L = NETS[0];
    const mid = pointOnNet(L, L.length / 2);
    return this.params.waveHeight * waveExposure(mid.x, mid.z);
  }

  /**
   * Mass balance: every jellyfish that entered the site has exactly one fate so far — reached the
   * screens, went into a pocket, passed the site — or is still in the water with none yet.
   */
  balance(): Balance {
    const c = this.counters;
    const p = this.pool;
    let inWater = 0;
    for (let i = 0; i < p.capacity; i++) if (p.state[i] !== S_INACTIVE && !(p.flags[i] & F_RESOLVED)) inWater++;
    const entered = c.spawned - c.dropped;
    return { entered, contact: c.intakeContacts, diverted: c.diverted, passed: c.exited, inWater, closes: entered === c.intakeContacts + c.diverted + c.exited + inWater };
  }

  /** Count agents currently in a given state. */
  countState(s: number): number {
    const st = this.pool.state;
    let n = 0;
    for (let i = 0; i < st.length; i++) if (st[i] === s) n++;
    return n;
  }

  agentInfo(slot: number): AgentInfo | null {
    const p = this.pool;
    if (slot < 0 || slot >= p.capacity || p.state[slot] === S_INACTIVE) return null;
    const s = p.state[slot];
    return {
      id: p.id[slot],
      slot,
      state: STATE_NAMES[s],
      depth: -p.py[slot],
      speed: Math.hypot(p.vx[slot], p.vy[slot], p.vz[slot]),
      x: p.px[slot],
      z: p.pz[slot],
      size: p.size[slot],
      transitRemaining: s === S_TRANSFERRED ? p.timer[slot] : null,
    };
  }
}
