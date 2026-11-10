import { ASSUMPTIONS } from '../config/assumptions';
import { NETS } from './geometry';
import type { NetIndex } from './types';

/**
 * Layout and numbers of the screw lifts, shared by the simulation and the 3D scene so a jellyfish is
 * drawn in the pocket the model has it in.
 *
 * Each net ends in a hopper against the east wall. The funnel along the net delivers into the
 * hopper's mouth; two inclined screws (duty and standby) stand in it and rise along the wall to a
 * deck between the nets, where each spills into a launder that runs to the head tank.
 */

const K = ASSUMPTIONS.lift;
const DEG = Math.PI / 180;

/** Pockets closed off at the bottom per second at full speed: one per flight start each turn. */
export const POCKET_RATE = (K.starts * K.rpm) / 60;
/** Spacing of the pockets along the axis (m). */
export const POCKET_SPACING = K.pitch / K.starts;
/** Speed a pocket rides up the axis at full speed (m/s). */
export const AXIAL_SPEED = POCKET_SPACING * POCKET_RATE;
/** Water in one pocket (m³): at full speed a screw lifts the line's design flow. */
export const POCKET_M3 = ASSUMPTIONS.transfer.designFlowM3h / 3600 / POCKET_RATE;
/** Jellyfish one pocket carries at most (kg), at the line's limit by volume. */
export const POCKET_KG = POCKET_M3 * ASSUMPTIONS.transfer.maxJellyFraction * 1025;
/** Axis length from the bottom pocket to the discharge (m). */
export const SCREW_LENGTH = (K.dischargeY - K.inletY) / Math.sin(K.incline * DEG);
/** The flights run on this far below the bottom pocket, into the hopper (m along the axis). */
export const SCREW_TAIL = 1.0;
/** How far below the axis an animal rides, in the water at the bottom of its pocket (m). */
export const POCKET_DROP = 0.6;
/** Launder water level (m above still water): below the spout lip, above the head tank's level. */
export const LAUNDER_Y = 6.8;
/** Head tank on the deck between the nets (plan centre and radius, m). */
export const HEAD_TANK = { x: 74.8, z: 62.8, r: 2.6 };
/** Deck between the nets that the screws rise to (plan extent, m) and the top of its slab. */
export const LIFT_DECK = { x0: 63, x1: 79.5, z0: 48.2, z1: 75, top: 4.85 };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Screw {
  /** Axis point at the bottom pocket (a = 0) and at the discharge (a = SCREW_LENGTH). */
  inlet: Vec3;
  top: Vec3;
  /** Unit vectors: up the axis, from the axis to the floor of the tube, and across it (horizontal). */
  axis: Vec3;
  down: Vec3;
  across: Vec3;
  /** Launder from this screw's spout to the head tank, and its length (m). */
  launder: Vec3[];
  launderLength: number;
}

export interface Station {
  net: NetIndex;
  name: string;
  /** Hopper mouth, where the funnel ends: the net's end against the east wall. */
  mouth: { x: number; z: number };
  /** Hopper in plan (m) and the level of its floor. */
  hopper: { x0: number; x1: number; z0: number; z1: number; floor: number };
  /** +1 if the screws rise toward +z, −1 toward −z. */
  rise: number;
  /** Duty [0] and standby [1]. */
  screws: [Screw, Screw];
}

/** Duty screw on the channel side, standby against the wall (x, m). */
const SCREW_X = [65.2, 67.9] as const;

function makeStation(net: NetIndex): Station {
  const L = NETS[net];
  // Net A's screws rise downstream, away from its pocket; net B's rise upstream, over its own end, to the same deck.
  const rise = net === 0 ? -1 : 1;
  const inletZ = net === 0 ? L.bz - 2.8 : L.bz - 4.8;
  const i = K.incline * DEG;
  const axis = { x: 0, y: Math.sin(i), z: rise * Math.cos(i) };
  const down = { x: 0, y: -Math.cos(i), z: rise * Math.sin(i) };
  const across = { x: 1, y: 0, z: 0 };
  const T = HEAD_TANK;
  const screws = SCREW_X.map((x) => {
    const inlet = { x, y: K.inletY, z: inletZ };
    const top = { x, y: K.inletY + axis.y * SCREW_LENGTH, z: inletZ + axis.z * SCREW_LENGTH };
    const lz = top.z + down.z * (K.diameter / 2) + rise * 0.2;
    const launder = [
      { x, y: LAUNDER_Y, z: lz },
      { x: T.x, y: LAUNDER_Y, z: lz },
      { x: T.x, y: LAUNDER_Y, z: T.z - rise * T.r },
    ];
    let len = 0;
    for (let k = 1; k < launder.length; k++) len += Math.hypot(launder[k].x - launder[k - 1].x, launder[k].z - launder[k - 1].z);
    return { inlet, top, axis, down, across, launder, launderLength: len };
  }) as [Screw, Screw];
  return {
    net,
    name: net === 0 ? 'Lift A' : 'Lift B',
    mouth: { x: L.bx - 1.2, z: L.bz + 0.4 },
    hopper: { x0: 63.4, x1: 69.8, z0: L.bz - 7, z1: L.bz + 0.2, floor: -7 },
    rise,
    screws,
  };
}

export const STATIONS: readonly [Station, Station] = [makeStation(0), makeStation(1)];

/** Point on a screw's axis at `a` metres up from the bottom pocket. */
export function axisPoint(s: Screw, a: number, out: Vec3): Vec3 {
  out.x = s.inlet.x + s.axis.x * a;
  out.y = s.inlet.y + s.axis.y * a;
  out.z = s.inlet.z + s.axis.z * a;
  return out;
}

/** Point `d` metres along a launder. */
export function launderPoint(s: Screw, d: number, out: Vec3): Vec3 {
  const P = s.launder;
  for (let k = 1; k < P.length; k++) {
    const seg = Math.hypot(P[k].x - P[k - 1].x, P[k].z - P[k - 1].z);
    if (d <= seg || k === P.length - 1) {
      const f = seg > 0 ? Math.min(1, Math.max(0, d / seg)) : 1;
      out.x = P[k - 1].x + (P[k].x - P[k - 1].x) * f;
      out.y = P[k - 1].y;
      out.z = P[k - 1].z + (P[k].z - P[k - 1].z) * f;
      return out;
    }
    d -= seg;
  }
  out.x = P[P.length - 1].x;
  out.y = P[P.length - 1].y;
  out.z = P[P.length - 1].z;
  return out;
}
