import { ASSUMPTIONS } from '../config/assumptions';
import { SITE, bearingToWorld } from '../config/site';
import { DEFAULT_PARAMS } from './types';

/**
 * Flow around the intake. This is a kinematic engineering model, not CFD:
 *
 *   - Inside the channel the water runs toward the screens at Q / (width × depth), slowed at the
 *     walls. The plant's pumps set it, so it does not care about the tide.
 *   - Outside, the along-shore current plus a sink at the channel mouth. Their sum is what makes a
 *     band of the passing water end up at the plant: about Q / (current × depth) wide.
 *   - The breakwaters turn the along-shore flow out around their heads.
 */
export interface Vec2Out {
  x: number;
  z: number;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class FlowField {
  /** Along-shore current outside (m/s) and the direction it flows toward. */
  speed = DEFAULT_PARAMS.currentSpeed;
  dirX = 1;
  dirZ = 0;
  /** Plant flow through the channel (m³/s). */
  plantFlow: number = ASSUMPTIONS.plant.unitFlowM3s * ASSUMPTIONS.plant.units;
  /** Release jet activity at the outlet (0..1). */
  releaseJet = 0;

  setCurrent(speed: number, bearingDeg: number): void {
    const d = bearingToWorld(bearingDeg);
    this.speed = speed;
    this.dirX = d.x;
    this.dirZ = d.z;
  }

  /** Mean speed along the channel (m/s). */
  get channelSpeed(): number {
    return this.plantFlow / (2 * SITE.channel.halfWidth * SITE.channel.depth);
  }

  /** Width of the band of passing water the intake draws in (m): Q / (current × depth). Unbounded at slack water. */
  captureBand(): number {
    return this.plantFlow / (Math.max(this.speed, 0.02) * SITE.channel.depth);
  }

  /** Ambient flow at (x, z) and depth (m). */
  sample(x: number, z: number, depth: number, out: Vec2Out): void {
    const C = SITE.channel;
    const hw = C.halfWidth;
    const M = C.mouthZ;
    const ax = Math.abs(x);
    // 0 well inside the channel, 1 out at sea.
    const seaward = ax > hw + 2 ? 1 : smoothstep(M - 70, M + 24, z);

    let ux = 0;
    let uz = 0;

    if (seaward < 1) {
      const U = this.channelSpeed;
      const wall = 1.06 - 0.5 * smoothstep(0.78, 1, ax / hw);
      const prof = 1.04 - 0.14 * Math.min(1, depth / C.depth);
      const vz = -U * wall * prof;
      // Forebay: the flow narrows onto the screen face.
      const fore = 1 - smoothstep(SITE.intake.mouthZ, 60, z);
      const vx = fore > 0 ? (-x / hw) * U * 0.34 * fore : 0;
      ux += vx * (1 - seaward);
      uz += vz * (1 - seaward);
    }

    if (seaward > 0) {
      const sh = SITE.shore;
      const f = 0.5 + 0.5 * smoothstep(sh.toeZ, sh.toeZ + 160, z);
      let ax0 = this.dirX * this.speed * f;
      let az0 = this.dirZ * this.speed * f;

      // The breakwaters turn the along-shore flow out toward their heads.
      if (z < M + 60 && ax > hw) {
        const d = ax - SITE.breakwater.outerToe;
        const w = (1 - smoothstep(0, 170, d)) * (1 - smoothstep(M - 20, M + 60, z));
        if (w > 0) {
          const toward = x < 0 ? ax0 : -ax0;
          if (toward > 0) {
            az0 += toward * w * 0.95;
            ax0 *= 1 - w;
          } else {
            ax0 *= 1 - w * 0.65;
          }
        }
      }

      // Sink at the mouth: the plant drawing from the sea, over about three quarters of a circle.
      const dx = -x;
      const dz = M - 8 - z;
      const r = Math.sqrt(dx * dx + dz * dz);
      // Close to the mouth the plant's draw takes over from the passing current.
      const pass = smoothstep(50, 240, r);
      ax0 *= pass;
      az0 *= pass;
      const rr = Math.max(r, 2 * hw * 0.62);
      const vs = this.plantFlow / (1.5 * Math.PI * rr * C.depth);
      let sx = (dx / Math.max(r, 1)) * vs;
      let sz = (dz / Math.max(r, 1)) * vs;
      // Behind the heads the sink cannot draw straight through the rock.
      if (z < M && ax > hw) {
        sx *= 0.25;
        sz = Math.abs(sz) * 0.6;
      }
      ux += (ax0 + sx) * seaward;
      uz += (az0 + sz) * seaward;
    }

    // Release outlet jet.
    if (this.releaseJet > 0) {
      const r = SITE.release;
      const dx = x - r.x;
      const dz = z - r.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 16) {
        const v = ASSUMPTIONS.release.jetSpeed * this.releaseJet * (1 - d / 16) * (1 - d / 16);
        ux += r.dirX * v;
        uz += r.dirZ * v;
      }
    }

    out.x = ux;
    out.z = uz;
  }
}
