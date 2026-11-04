import { ASSUMPTIONS } from '../config/assumptions';
import { SITE } from '../config/site';
import { hash01 } from './seededRandom';
import type { NetLine } from './geometry';

const N = ASSUMPTIONS.net;
const G = 9.81;
const RHO = 1025;
/** Mesh solidity when clean: twine each way across the bar. */
export const MESH_SOLIDITY = (2 * N.twine) / N.meshBar;

/** Head loss coefficient of a screen with open-area fraction ε. */
const lossAt = (open: number) => (N.lossK * (1 - open * open)) / (open * open);

/**
 * One guide net as a small hydraulic network. Every panel is a parallel path for the same flow, so
 * all panels share one head difference, and the through-speed of each follows from its own loss
 * coefficient: a panel fouled or covered in jellyfish passes less, its neighbours pass more, and a
 * torn-out panel takes a large share. This is what makes the failure cases behave, rather than a
 * scripted response.
 */
export class NetState {
  readonly line: NetLine;
  readonly n: number;
  /** Progress of each panel down its pile guides, 0 (above water) to 1 (in place). */
  readonly drop: Float32Array;
  /** Added solidity from marine growth. */
  readonly foul: Float32Array;
  /** Biomass held on each panel (kg). */
  readonly bioKg: Float32Array;
  readonly torn: Uint8Array;
  /** Relief sections: how far the float line has dipped, 0..1. */
  readonly relief: Float32Array;
  /** Open area, loss coefficient and through-speed of each panel. */
  readonly open: Float32Array;
  readonly lossK: Float32Array;
  readonly through: Float32Array;
  /** Head difference across the net (m). */
  head = 0;
  /** Share of the mesh blinded by a debris mat, and where it is heading (0..1). */
  debris = 0;
  debrisTarget = 0;
  /** The net is installed (the second net can be switched off in a what-if). */
  active = true;
  /** Seconds since the installation sequence began (Infinity once it is done). */
  private armClock = Infinity;

  constructor(line: NetLine) {
    this.line = line;
    this.n = line.panels;
    this.drop = new Float32Array(this.n).fill(1);
    this.foul = new Float32Array(this.n);
    this.bioKg = new Float32Array(this.n);
    this.torn = new Uint8Array(this.n);
    this.relief = new Float32Array(this.n);
    this.open = new Float32Array(this.n).fill(1);
    this.lossK = new Float32Array(this.n);
    this.through = new Float32Array(this.n);
  }

  /** Panel area in the water (m²). */
  get panelArea(): number {
    return this.line.panelLength * SITE.channel.depth;
  }

  /** Force on one panel at the present head (kN). */
  get panelLoadKN(): number {
    return (RHO * G * this.head * this.panelArea) / 1000;
  }

  /** Load as a fraction of the panels' design head. */
  get loadFraction(): number {
    return this.head / N.designHead;
  }

  get reliefFraction(): number {
    let r = 0;
    for (let k = 0; k < this.n; k++) r = Math.max(r, this.relief[k]);
    return r;
  }

  get tornCount(): number {
    let t = 0;
    for (let k = 0; k < this.n; k++) t += this.torn[k];
    return t;
  }

  /** Total biomass on the net (kg). */
  get totalKg(): number {
    let t = 0;
    for (let k = 0; k < this.n; k++) t += this.bioKg[k];
    return t;
  }

  /** Set every panel's marine growth for an age in the water; panels foul at slightly different rates. */
  setFouling(weeks: number): void {
    for (let k = 0; k < this.n; k++) {
      const w = weeks * (0.8 + 0.4 * hash01(k + 1, this.line.index + 41));
      this.foul[k] = N.foulMax * (1 - Math.exp(-w / N.foulWeeks));
    }
  }

  /** Begin the season's installation: panels go down their pile guides one after another, west to east. */
  arm(): void {
    this.drop.fill(0);
    this.armClock = 0;
  }

  get arming(): boolean {
    return this.armClock !== Infinity;
  }

  /** How much of the net is in place, 0..1. */
  get inPlace(): number {
    let d = 0;
    for (let k = 0; k < this.n; k++) d += this.drop[k];
    return d / this.n;
  }

  /** Solve the head and through-speeds for a flow Q (m³/s). `blockPerKg`: bell area blocking the mesh, m² per kg. */
  update(dt: number, Q: number, blockPerKg: number): void {
    if (this.armClock !== Infinity) {
      this.armClock += dt;
      let all = true;
      for (let k = 0; k < this.n; k++) {
        const v = (this.armClock - k * N.panelDropStagger) / N.panelDropTime;
        this.drop[k] = Math.min(1, Math.max(0, v));
        if (this.drop[k] < 1) all = false;
      }
      if (all) this.armClock = Infinity;
    }
    this.debris += (this.debrisTarget - this.debris) * Math.min(1, dt / 240);
    const area = this.panelArea;
    let conductance = 0;
    for (let k = 0; k < this.n; k++) {
      let K: number;
      let open = 1;
      if (!this.active || this.drop[k] < 1 || this.torn[k]) {
        K = N.tornK;
      } else {
        const blocked = Math.min(0.97, (this.bioKg[k] * blockPerKg) / area);
        open = (1 - MESH_SOLIDITY) * (1 - this.foul[k]) * (1 - blocked) * (1 - this.debris);
        K = lossAt(open);
      }
      this.open[k] = open;
      this.lossK[k] = K;
      conductance += area / Math.sqrt(K);
      // A dipped float line lets water spill over the top of the panel.
      if (this.relief[k] > 0) conductance += this.relief[k] * N.reliefDip * this.line.panelLength;
    }
    this.head = (Q / conductance) ** 2 / (2 * G);
    for (let k = 0; k < this.n; k++) this.through[k] = Math.sqrt((2 * G * this.head) / this.lossK[k]);
    // Relief sections at the upstream end: open past the relief head, close again well below it.
    const rate = dt / 45;
    const up = this.head > N.reliefHead;
    const down = this.head < N.reliefHead * 0.55;
    for (let k = 0; k < Math.min(N.reliefPanels, this.n); k++) {
      if (up) this.relief[k] = Math.min(1, this.relief[k] + rate);
      else if (down) this.relief[k] = Math.max(0, this.relief[k] - rate * 0.5);
    }
  }

  /**
   * Biomass the net could still take before the relief head, for a flow Q (kg). Finds the open area
   * at which the whole net reaches the relief head, and how much bell area gets it there.
   */
  marginKg(Q: number, blockPerKg: number): number {
    const area = this.panelArea * this.n;
    const v = Q / area;
    const Krelief = (2 * G * N.reliefHead) / (v * v);
    const openRelief = Math.sqrt(N.lossK / (N.lossK + Krelief));
    let clean = 0;
    for (let k = 0; k < this.n; k++) clean += (1 - MESH_SOLIDITY) * (1 - this.foul[k]);
    clean /= this.n;
    const blockedAtRelief = Math.max(0, 1 - openRelief / clean) * area;
    return Math.max(0, blockedAtRelief / blockPerKg - this.totalKg);
  }

  reset(): void {
    this.debris = 0;
    this.debrisTarget = 0;
    this.drop.fill(1);
    this.bioKg.fill(0);
    this.torn.fill(0);
    this.relief.fill(0);
    this.head = 0;
    this.armClock = Infinity;
    this.active = true;
  }
}
