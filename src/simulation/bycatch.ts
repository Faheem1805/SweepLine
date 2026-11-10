import { ASSUMPTIONS } from '../config/assumptions';
import { SITE, seabedDepthFast } from '../config/site';
import type { FlowField } from './flowField';
import { NETS } from './geometry';
import { HOPPER, TAIL } from './lift';
import { hash01, SeededRandom, valueNoise } from './seededRandom';

const B = ASSUMPTIONS.bycatch;

/**
 * Other animals in the channel with the bloom: fish and sea turtles. Illustrative, not calibrated.
 *
 * What the design does for them: the mesh runs at fish-screen speed, so a fish that meets a net
 * turns and swims back up the channel and out of the mouth, against a current it easily beats; net
 * A's coarse mesh lets small fish through either way. A fish caught in the hopper rides up in a
 * bucket of water and goes out to sea down the line with the jellyfish, alive, instead of onto the
 * plant's screens. A turtle (they eat jellyfish, so they follow a bloom into the funnel) is seen by
 * the hopper camera; the elevator waits until it has swum back out of the open funnel.
 */
export class BycatchState {
  readonly n = B.fish + B.turtles;
  readonly px = new Float32Array(this.n);
  readonly py = new Float32Array(this.n);
  readonly pz = new Float32Array(this.n);
  readonly ox = new Float32Array(this.n);
  readonly oy = new Float32Array(this.n);
  readonly oz = new Float32Array(this.n);
  readonly vx = new Float32Array(this.n);
  readonly vz = new Float32Array(this.n);
  readonly heading = new Float32Array(this.n);
  /** 0 swimming, 1 lifted (in a bucket, then the line: not drawn), 2 waiting to come back in. */
  readonly state = new Uint8Array(this.n);
  readonly timer = new Float32Array(this.n);
  /** Fish that turned back at a net, fish that swam out of the mouth, fish lifted and sent to sea alive, elevator pauses for a turtle. */
  turnedBack = 0;
  swamOut = 0;
  lifted = 0;
  turtlePauses = 0;
  private readonly met = new Uint8Array(this.n);
  private readonly rng: SeededRandom;
  private readonly tmp = { x: 0, z: 0 };
  private holding = false;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed * 7 + 3);
    for (let i = 0; i < this.n; i++) this.spawn(i, true);
  }

  isTurtle(i: number): boolean {
    return i >= B.fish;
  }

  private spawn(i: number, anywhere: boolean): void {
    const r = this.rng;
    const C = SITE.channel;
    const turtle = this.isTurtle(i);
    // In the channel ahead of net A; later arrivals come in at the mouth.
    const A = NETS[0];
    for (let tries = 0; tries < 20; tries++) {
      this.px[i] = (r.next() - 0.5) * 2 * (C.halfWidth - 6);
      this.pz[i] = anywhere ? 140 + r.next() * (C.mouthZ - 160) : C.mouthZ - 10 - r.next() * 30;
      if ((this.px[i] - A.ax) * A.nx + (this.pz[i] - A.az) * A.nz > 8) break;
    }
    this.py[i] = turtle ? -0.6 - r.next() * 1.5 : -1.5 - r.next() * 7;
    this.ox[i] = this.px[i];
    this.oy[i] = this.py[i];
    this.oz[i] = this.pz[i];
    this.heading[i] = r.next() * Math.PI * 2;
    this.state[i] = 0;
    this.met[i] = 0;
  }

  /** One step. Returns true while a turtle is in the hopper (the elevator must wait). */
  update(dt: number, t: number, flow: FlowField, liftTurning: boolean): boolean {
    const C = SITE.channel;
    const tmp = this.tmp;
    let hold = false;
    this.ox.set(this.px);
    this.oy.set(this.py);
    this.oz.set(this.pz);
    for (let i = 0; i < this.n; i++) {
      const turtle = this.isTurtle(i);
      if (this.state[i] !== 0) {
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) this.spawn(i, false);
        continue;
      }
      let x = this.px[i];
      let z = this.pz[i];
      const depth = -this.py[i];
      flow.sample(x, z, depth, tmp);
      // Own swimming: a wandering heading, and a cruise speed well above the channel's.
      const h = this.heading[i] + (valueNoise(i * 7 + 1, t * 0.08) - 0.5) * 1.6 * dt;
      this.heading[i] = h;
      const cruise = turtle ? B.turtleSpeed : B.fishSpeed * (0.7 + 0.6 * hash01(i, 5));
      let sx = Math.cos(h) * cruise * 0.5;
      let sz = Math.sin(h) * cruise * 0.5;
      // A net ahead: turn and swim back up the channel, away from it (fish sense the mesh and the slow through-flow).
      let near = false;
      for (let ni = 0; ni < NETS.length; ni++) {
        const L = NETS[ni];
        const d = (x - L.ax) * L.nx + (z - L.az) * L.nz;
        const s = (x - L.ax) * L.tx + (z - L.az) * L.tz;
        if (s < 0 || s > L.length) continue;
        // Small fish slip through net A's coarse mesh either way; nothing slips through net B.
        if (ni === 0 && !turtle && hash01(i, 9) < B.smallShare) continue;
        if (d > -0.5 && d < B.senseRange) {
          near = true;
          sx = L.nx * cruise + L.tx * cruise * 0.15;
          sz = L.nz * cruise + Math.abs(L.tz) * cruise * 0.3;
          if (d < 0.6) {
            x += L.nx * (0.6 - d);
            z += L.nz * (0.6 - d);
          }
          if (!turtle && !this.met[i]) this.turnedBack++;
          this.met[i] |= 1 << ni;
        }
      }
      // Turtles go where the jellyfish are thickest: the funnel.
      if (turtle && !near) {
        const fx = TAIL.x - x;
        const fz = HOPPER.z1 + 6 - z;
        const fd = Math.hypot(fx, fz) || 1;
        const pull = valueNoise(i * 13 + 5, t * 0.01) > 0.55 ? 0.6 : 0.1;
        sx = sx * (1 - pull) + (fx / fd) * cruise * pull;
        sz = sz * (1 - pull) + (fz / fd) * cruise * pull;
      }
      // Once headed upstream, keep going: fish swim against the current (rheotaxis).
      if (!near && this.met[i]) sz += cruise * 0.6;
      const vx = tmp.x + sx;
      const vz = tmp.z + sz;
      this.vx[i] = vx;
      this.vz[i] = vz;
      x += vx * dt;
      z += vz * dt;
      // Walls.
      const lim = C.halfWidth - 1.5;
      if (x > lim) x = lim;
      if (x < -lim) x = -lim;
      // In the hopper: a turtle holds the elevator; a fish next to the scoop may be lifted with the water.
      const inHopper = x > HOPPER.x0 && x < HOPPER.x1 && z > HOPPER.z0 && z < HOPPER.z1;
      if (inHopper && turtle) {
        hold = true;
        // It turns round and swims back out of the open funnel.
        this.heading[i] = Math.PI / 2;
        z += B.turtleSpeed * dt;
      } else if (inHopper && liftTurning && Math.hypot(x - TAIL.x, z - TAIL.z) < 1.5 && hash01(i, Math.floor(t / dt)) < B.scoopPerSecond * dt) {
        this.state[i] = 1;
        this.timer[i] = ASSUMPTIONS.transfer.length / ASSUMPTIONS.transfer.pipeVelocity;
        this.lifted++;
        continue;
      }
      // Out of the mouth: gone to sea; another one comes in later.
      if (z > C.mouthZ + 30) {
        if (this.met[i]) this.swamOut++;
        this.state[i] = 2;
        this.timer[i] = B.returnTime * (0.5 + this.rng.next());
        continue;
      }
      // Below the nets the plant's screens are next: these are the ones that would be at risk without a way out.
      if (z < NETS[1].bz - 30) z = NETS[1].bz - 30;
      const bed = seabedDepthFast(x, z);
      let y = this.py[i] + (valueNoise(i * 3 + 7, t * 0.05) - 0.5) * 0.3 * dt;
      if (turtle) y = Math.min(-0.4, Math.max(-2.5, y));
      else y = Math.min(-0.8, Math.max(-bed + 0.6, y));
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
    }
    if (hold && !this.holding) this.turtlePauses++;
    this.holding = hold;
    return hold;
  }
}
