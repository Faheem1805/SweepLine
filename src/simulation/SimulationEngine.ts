import { ASSUMPTIONS, SPECIES } from '../config/assumptions';
import { basinX, SITE, seabedDepth, seabedDepthFast, waveExposure } from '../config/site';
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
  S_LIFT,
  S_PAST_NET,
  S_RELEASED,
  S_TRANSFERRED,
  S_TRANSFER_QUEUE,
} from './Agent';
import { FlowField } from './flowField';
import { collectorPoint, NETS, netDistance, pointOnNet, type NetLine } from './geometry';
import { BycatchState } from './bycatch';
import { BUCKET_FILL, CHUTE_LENGTH, chutePoint, HANG, PITCH, pivotLocalAt, TAIL, TIP_AT, toWorld, type Vec3 } from './lift';
import { NetState } from './net';
import { ScreenState } from './screens';
import { fbm1, hash01, SeededRandom, valueNoise } from './seededRandom';
import { TRANSFER_TPH, TransferState } from './transfer';
import type { EngineKind, NetIndex, SimParams } from './types';

const N = ASSUMPTIONS.net;
/** Distance past the mouth, along the current, at which a bloom has clearly gone by (m). */
const PASS_X = 420;

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
  /** Agents that reached a collection pocket. */
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
  /** Pocket capacity (agents). */
  holdCapacity = 100;
  /** Animals one bucket may carry (agents). */
  pocketCap = 5;
  /** Something that must not be lifted (a turtle) is in the hopper: the elevator waits. */
  liftHold = false;
  /** Fish and turtles in the channel (SweepLine world only). */
  bycatch: BycatchState | null = null;
  /** Releases per second (EMA). */
  releaseEMA = 0;
  /** Agents arriving at a pocket per second (EMA). */
  collectEMA = 0;
  /** Agents coming in through the mouth per second (EMA). */
  enterEMA = 0;
  /** Biomass inside the sonar's range, heading in (kg). */
  sonarKg = 0;
  /** Agents in the elevator now, by section: drawn across the hopper, riding a bucket, down the chute; and in the release line. */
  readonly lift = { hopper: 0, bucket: 0, chute: 0, line: 0 };
  /** Agents that worked through each net's mesh because they were small enough (net A's are what net B is for). */
  readonly sieved = [0, 0];
  /** Jet purge: seconds each panel has held a snagged animal, seconds left of each panel's burst and of its cooldown; bursts fired and animals freed. */
  readonly jets = {
    held: [new Float32Array(NETS[0].panels), new Float32Array(NETS[1].panels)] as [Float32Array, Float32Array],
    firing: [new Float32Array(NETS[0].panels), new Float32Array(NETS[1].panels)] as [Float32Array, Float32Array],
    cooldown: [new Float32Array(NETS[0].panels), new Float32Array(NETS[1].panels)] as [Float32Array, Float32Array],
    bursts: 0,
    freed: 0,
    energyKWh: 0,
    lastPanel: -1,
    lastNet: -1,
    lastFreed: 0,
  };
  /** Snagged animals on each panel this step. */
  private readonly snagged: [Uint16Array, Uint16Array] = [new Uint16Array(NETS[0].panels), new Uint16Array(NETS[1].panels)];

  readonly markers: Marker[] = [];
  markerSeq = 0;

  private spawnAcc = 0;
  private nextId = 1;
  private releasesThisStep = 0;
  private collectsThisStep = 0;
  private entersThisStep = 0;
  private readonly tmp = { x: 0, z: 0 };
  private readonly tmp3: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly chuteSide = { x: 0, z: 0 };
  private transfersThisStep = 0;
  private readonly tally: [Float32Array, Float32Array] = [new Float32Array(NETS[0].panels), new Float32Array(NETS[1].panels)];
  /** Agents stopped behind a full pocket on each net. */
  private readonly backed = [0, 0];
  private readonly backedNext = [0, 0];

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
    this.releaseEMA = 0;
    this.collectEMA = 0;
    this.enterEMA = 0;
    this.sonarKg = 0;
    this.clearLiftCounts();
    this.transfersThisStep = 0;
    this.sieved.fill(0);
    for (let n = 0; n < 2; n++) {
      this.jets.held[n].fill(0);
      this.jets.firing[n].fill(0);
      this.jets.cooldown[n].fill(0);
    }
    this.jets.bursts = 0;
    this.jets.freed = 0;
    this.jets.energyKWh = 0;
    this.jets.lastPanel = -1;
    this.jets.lastNet = -1;
    this.markers.length = 0;
    this.markerSeq = 0;
    this.screens.reset();
    this.flow.releaseJet = 0;
    if (this.kind === 'sweepline') {
      this.nets = NETS.map((L) => new NetState(L));
      this.transfer = new TransferState();
      this.bycatch = new BycatchState(params.seed);
      this.liftHold = false;
    } else {
      this.nets = [];
      this.transfer = null;
      this.bycatch = null;
      this.liftHold = false;
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
    this.holdCapacity = Math.max(8, Math.round(ASSUMPTIONS.collector.holdKg / this.kgPerAgent));
    this.pocketCap = Math.max(1, Math.ceil(ASSUMPTIONS.lift.bucketKg / this.kgPerAgent));
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
    const B = ASSUMPTIONS.bloom;
    p.size[slot] = hash01(agentId, 51) < B.juvenileShare ? B.juvenileBell[0] + hash01(agentId, 53) * (B.juvenileBell[1] - B.juvenileBell[0]) : S.bellMin + u4 * (S.bellMax - S.bellMin);
    p.phase[slot] = u5;
    p.tint[slot] = u6;
    p.depthZ[slot] = n2;
    p.swimSpeed[slot] = S.swimMin + u7 * (S.swimMax - S.swimMin);
    p.heading[slot] = (u8 - 0.5) * Math.PI * 2;
    p.stateTime[slot] = 0;
    p.contactStart[slot] = -1;
    p.timer[slot] = 0;
    p.queueIndex[slot] = -1;
    p.ox[slot] = x;
    p.oy[slot] = -pref;
    p.oz[slot] = z;
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
    if (this.transfer) {
      const tr = this.transfer;
      const lc = this.lift;
      tr.update(dt);
      tr.control(dt, (tr.queueLength + lc.hopper) * this.kgPerAgent, lc.hopper + lc.bucket > 0, lc.line > 0, this.liftHold);
      this.updateJets(dt);
    }
    this.flow.releaseJet = Math.min(1, this.releaseEMA * 8);

    if (this.bloomActive) {
      this.spawnAcc += this.spawnRate() * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnOne();
      }
    }

    this.updateAgents(dt);
    if (this.transfer) this.processTransfer(dt);
    if (this.bycatch) this.liftHold = this.bycatch.update(dt, this.time, this.flow, !!this.transfer?.lift.turning);
    this.screens.update(dt);

    const r = 1 - Math.exp(-dt / 30);
    this.releaseEMA += (this.releasesThisStep / dt - this.releaseEMA) * r;
    this.collectEMA += (this.collectsThisStep / dt - this.collectEMA) * r;
    this.enterEMA += (this.entersThisStep / dt - this.enterEMA) * r;
  }

  private updateAgents(dt: number): void {
    const pool = this.pool;
    const { state, flags, px, py, pz, vx, vy, vz, id, depthZ, swimSpeed, heading, stateTime, contactStart, timer, fade, lane } = pool;
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

    // Where every animal starts this step, for drawing between steps.
    pool.ox.set(px);
    pool.oy.set(py);
    pool.oz.set(pz);
    this.tally[0].fill(0);
    this.tally[1].fill(0);
    this.onNet[0] = 0;
    this.onNet[1] = 0;
    this.backedNext[0] = 0;
    this.backedNext[1] = 0;
    this.clearLiftCounts();
    this.snagged[0].fill(0);
    this.snagged[1].fill(0);
    const lineFlow = transfer ? transfer.lineFlow() : 1;

    for (let i = 0; i < pool.capacity; i++) {
      const st = state[i];
      if (st === S_INACTIVE) continue;
      if (fade[i] < 1) fade[i] = Math.min(1, fade[i] + dt * 0.25);

      if (st === S_TRANSFERRED) {
        // Carried down the line at the speed of the water the elevator and feed pump are sending.
        timer[i] -= dt * lineFlow;
        if (timer[i] <= 0) this.releaseAgent(i);
        else this.lift.line++;
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
        this.queueDynamics(i, dt, relax, NETS[lane[i] as NetIndex]);
        continue;
      }
      if (st === S_LIFT) {
        this.liftDynamics(i, dt);
        continue;
      }

      let x = px[i];
      let z = pz[i];
      let depth = -py[i];
      const aid = id[i];
      const wasInside = Math.abs(x) < hw && z < mouth + 4;

      flow.sample(x, z, depth, tmp);
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
      const seabed = seabedDepthFast(x, z);
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
          const d = (x - L.ax) * L.nx + (z - L.az) * L.nz;
          if (d < -0.2 || d > N.guideDistance) continue;
          const s = (x - L.ax) * L.tx + (z - L.az) * L.tz;
          if (s < 0 || s > L.openFrom) continue;
          const k = Math.min(net.n - 1, Math.floor(s / L.panelLength));
          if (net.drop[k] < 1) continue;
          if (pool.size[i] < N.passFactor * N.mesh[ni]) {
            // Small enough to work through this mesh: on to the next net, which is finer.
            if (d > -0.1 && d < N.standoff + 0.3) {
              x -= L.nx * (d + 0.5);
              z -= L.nz * (d + 0.5);
              this.sieved[ni]++;
            }
            continue;
          }
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
          ns = S_GUIDED;
          lane[i] = ni;
          this.onNet[ni]++;
          this.tally[ni][k] += kg;

          // The net stops the part of the flow that would carry the animal through it, and the rest sweeps it along.
          const vn = dvx * L.nx + dvz * L.nz;
          const vt = dvx * L.tx + dvz * L.tz;
          const press = d > N.standoff ? vn : Math.max(0, vn);
          let sweep = Math.max(vt, 0) * N.slide;

          // A snagged animal stays put until the flow works it free, or the panel's jets push it off.
          if (fl & F_SNAGGED) {
            timer[i] -= dt;
            if (this.jets.firing[ni][k] > 0) {
              fl &= ~F_SNAGGED;
              timer[i] = 0;
              this.jets.freed++;
              this.jets.lastFreed++;
            } else if (timer[i] <= 0) fl &= ~F_SNAGGED;
            else {
              sweep = 0;
              this.snagged[ni][k]++;
            }
          } else {
            const u = net.through[k] / ASSUMPTIONS.screenCriteria.approachMax;
            if (hash01(aid, stepNo) < N.snagRate * u * u * dt) {
              fl |= F_SNAGGED;
              timer[i] = N.snagTime * (0.4 + 1.2 * hash01(aid, 3));
            }
          }

          // Behind a full funnel the animals stack up along the net (only net B has one).
          if (transfer && ni === 1) {
            const full = transfer.queues[ni as NetIndex].length >= this.holdCapacity;
            const stop = L.pocketS - this.backed[ni] * stackSpacing;
            if (full && s >= stop) {
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
            this.onNet[ni]--;
            this.noteLeak(ni, x, depth, z);
            break;
          }

          // Into the funnel.
          if (transfer && ni === 1 && s >= L.pocketS && transfer.queues[ni as NetIndex].length < this.holdCapacity) {
            flags[i] = fl;
            px[i] = x;
            pz[i] = z;
            py[i] = -depth;
            this.enqueue(i, ni as NetIndex);
            guided = false;
            ns = S_TRANSFER_QUEUE;
          }
          break;
        }
        if (ns === S_TRANSFER_QUEUE) continue;
      }
      if (!guided && st === S_GUIDED && ns === S_GUIDED) ns = S_FREE_DRIFT;
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
    }
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

  /** Motion through the pocket toward the suction: the funnel narrows, the animals close up and rise to it. */
  private queueDynamics(i: number, dt: number, relax: number, L: NetLine): void {
    const p = this.pool;
    const aid = p.id[i];
    const K = SITE.collector;
    const end = collectorPoint(L);
    const rx = p.px[i] - end.x;
    const rz = p.pz[i] - end.z;
    const q = Math.min(1, Math.hypot(rx, rz) / K.pocketLength);
    const lat = (hash01(aid, 11) - 0.5) * 2 * (K.throatHalfWidth + (K.mouthHalfWidth - K.throatHalfWidth) * q) * 0.7;
    const ahead = 1 + q * K.pocketLength * 0.5;
    // Stay inside the funnel: off net B's face and clear of the wall.
    const ex = end.x - L.tx * ahead;
    const ez = end.z - L.tz * ahead;
    const room = (SITE.channel.halfWidth - ex) / Math.max(0.2, L.nx) - 0.8;
    const off = Math.min(Math.max(lat + 2, 0.6), Math.max(0.6, room));
    const tx = ex + L.nx * off;
    const tz = ez + L.nz * off;
    const tdepth = 2.2 + hash01(aid, 13) * 4;
    const vf = ASSUMPTIONS.collector.funnelSpeed;
    let dvx = (tx - p.px[i]) * 0.2 + L.tx * vf;
    let dvz = (tz - p.pz[i]) * 0.2 + L.tz * vf;
    const m = Math.hypot(dvx, dvz);
    if (m > vf) {
      dvx *= vf / m;
      dvz *= vf / m;
    }
    const depth = -p.py[i];
    let dvy = (depth - tdepth) * 0.3;
    if (dvy > 0.08) dvy = 0.08;
    else if (dvy < -0.08) dvy = -0.08;
    dvx += (valueNoise(aid * 5 + 2, this.time * 0.3) - 0.5) * 0.03;
    dvz += (valueNoise(aid * 5 + 3, this.time * 0.3) - 0.5) * 0.03;
    p.vx[i] += (dvx - p.vx[i]) * relax * 2;
    p.vy[i] += (dvy - p.vy[i]) * relax * 2;
    p.vz[i] += (dvz - p.vz[i]) * relax * 2;
    p.px[i] += p.vx[i] * dt;
    p.pz[i] += p.vz[i] * dt;
    p.py[i] += p.vy[i] * dt;
    // The wall and net B bound the funnel and the hopper.
    const wall = SITE.channel.halfWidth - 0.8;
    if (p.px[i] > wall) p.px[i] = wall;
    const dn = netDistance(L, p.px[i], p.pz[i]);
    if (dn < 0.3) {
      p.px[i] += L.nx * (0.3 - dn);
      p.pz[i] += L.nz * (0.3 - dn);
    }
  }

  private clearLiftCounts(): void {
    const c = this.lift;
    c.hopper = 0;
    c.bucket = 0;
    c.chute = 0;
    c.line = 0;
  }

  /**
   * Jet purge: a panel that has held a snagged animal for `holdTime` s fires its jets for a
   * `burst`, which frees every snagged animal on it (see the snag branch in `updateAgents`).
   */
  private updateJets(dt: number): void {
    const J = ASSUMPTIONS.jets;
    const jets = this.jets;
    for (let n = 0; n < this.nets.length; n++) {
      const held = jets.held[n];
      const firing = jets.firing[n];
      const cool = jets.cooldown[n];
      const snag = this.snagged[n];
      for (let k = 0; k < held.length; k++) {
        if (firing[k] > 0) {
          firing[k] = Math.max(0, firing[k] - dt);
          jets.energyKWh += (J.kW * dt) / 3600;
          if (firing[k] === 0) cool[k] = J.cooldown;
          continue;
        }
        if (cool[k] > 0) cool[k] = Math.max(0, cool[k] - dt);
        held[k] = snag[k] > 0 ? held[k] + dt : 0;
        if (held[k] >= J.holdTime && cool[k] === 0) {
          firing[k] = J.burst;
          held[k] = 0;
          jets.bursts++;
          jets.lastNet = n;
          jets.lastPanel = k;
          jets.lastFreed = 0;
        }
      }
    }
  }

  /** The elevator takes animals from the head of net B's funnel into the hopper, as fast as its buckets have room. */
  private processTransfer(dt: number): void {
    const tr = this.transfer!;
    const p = this.pool;
    const st = tr.lift;
    const queue = tr.queues[1];
    if (queue.length > 0 && st.credit >= 1) {
      const end = collectorPoint(NETS[1]);
      let n = 0;
      while (st.credit >= 1 && queue.length > 0) {
        const i = queue[0];
        if (Math.hypot(p.px[i] - end.x, p.pz[i] - end.z) > 9) break;
        queue.shift();
        st.credit -= 1;
        n++;
        p.state[i] = S_LIFT;
        p.stateTime[i] = 0;
        p.queueIndex[i] = 0;
        p.timer[i] = 0;
        p.lane[i] = 1;
        this.lift.hopper++;
      }
      if (n > 0) for (let j = 0; j < queue.length; j++) p.queueIndex[queue[j]] = j;
    }
    tr.processedEMA += (this.transfersThisStep / dt - tr.processedEMA) * (1 - Math.exp(-dt / 45));
    this.transfersThisStep = 0;
  }

  /**
   * An animal in the elevator. `queueIndex` holds the section: 0 drawn across the hopper to the
   * scoop, 1 riding a bucket (`timer` = its bucket's chain coordinate, m from the scoop), 2 sliding
   * down the chute to the head tank (`timer` = m down it).
   */
  private liftDynamics(i: number, dt: number): void {
    const p = this.pool;
    const tr = this.transfer!;
    const st = tr.lift;
    const aid = p.id[i];
    const out = this.tmp3;
    const section = p.queueIndex[i];
    if (section === 0) {
      // Drawn down the hopper to the tail, where the buckets come round full of water.
      const tgt = toWorld(-0.4 + (hash01(aid, 41) - 0.5) * 0.8, TAIL.y - 0.2, (hash01(aid, 42) - 0.5) * 1.0, out);
      const dx = tgt.x - p.px[i];
      const dy = tgt.y - p.py[i];
      const dz = tgt.z - p.pz[i];
      const d = Math.hypot(dx, dy, dz);
      const bucket = Math.floor(st.phase);
      if (bucket !== st.fillBucket) {
        st.fillBucket = bucket;
        st.fillCount = 0;
      }
      if (d < 0.45 && st.speed > 0.02 && st.fillCount < this.pocketCap) {
        // Scooped into the bucket now leaving the tail; a full one leaves it for the next.
        st.fillCount++;
        p.timer[i] = (st.phase - bucket) * PITCH;
        p.queueIndex[i] = 1;
        this.lift.bucket++;
        this.placeInBucket(i);
        return;
      }
      const m = d > 1e-6 ? Math.min(ASSUMPTIONS.lift.hopperSpeed * dt, d) / d : 0;
      p.vx[i] = (dx * m) / dt;
      p.vy[i] = 0;
      p.vz[i] = (dz * m) / dt;
      p.px[i] += dx * m;
      p.py[i] += dy * m;
      p.pz[i] += dz * m;
      this.lift.hopper++;
      return;
    }
    if (section === 1) {
      // In its bucket: the bucket moves with the chain.
      p.timer[i] += ASSUMPTIONS.lift.chainSpeed * st.speed * dt;
      if (p.timer[i] < TIP_AT) {
        this.lift.bucket++;
        this.placeInBucket(i);
        return;
      }
      // Tipped at the head: into the chute with its water.
      p.queueIndex[i] = 2;
      p.timer[i] = 0;
    }
    p.timer[i] += ASSUMPTIONS.lift.chuteSpeed * dt;
    if (p.timer[i] >= CHUTE_LENGTH) {
      this.transferAgent(i);
      this.transfersThisStep++;
      return;
    }
    chutePoint(p.timer[i], out, this.chuteSide);
    const spread = (hash01(aid, 47) - 0.5) * 0.5;
    p.px[i] = out.x + this.chuteSide.x * spread;
    p.py[i] = out.y + 0.15;
    p.pz[i] = out.z + this.chuteSide.z * spread;
    p.vx[i] = p.vy[i] = p.vz[i] = 0;
    this.lift.chute++;
  }

  /** Where an animal riding a bucket is: in the water in the bottom of its bucket, a little to one side. */
  private placeInBucket(i: number): void {
    const p = this.pool;
    const loc = pivotLocalAt(p.timer[i], this.tmp3);
    const B = ASSUMPTIONS.lift.bucket;
    const out = toWorld(
      loc.x + (hash01(p.id[i], 44) - 0.5) * (B.length - 0.35),
      loc.y - HANG - B.depth / 2 + BUCKET_FILL * 0.55,
      (hash01(p.id[i], 45) - 0.5) * (B.width - 0.45),
      this.tmp3,
    );
    p.px[i] = out.x;
    p.py[i] = out.y;
    p.pz[i] = out.z;
    p.vx[i] = p.vy[i] = p.vz[i] = 0;
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
    // A jump to the outlet, not a move: nothing to draw in between.
    p.ox[i] = p.px[i];
    p.oy[i] = p.py[i];
    p.oz[i] = p.pz[i];
    this.counters.released++;
    this.releasesThisStep++;
    if ((this.counters.released & 3) === 0) this.pushMarker(p.px[i], p.py[i], p.pz[i], 'release');
  }

  /** The unit whose intake this animal ends up at. */
  private intakeX(i: number): number {
    const u = SITE.basin.units;
    return basinX(u[Math.min(u.length - 1, Math.floor(hash01(this.pool.id[i], 31) * u.length))]);
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
