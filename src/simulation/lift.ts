import { ASSUMPTIONS } from '../config/assumptions';
import { SITE } from '../config/site';
import { NETS, pointOnNet } from './geometry';

/**
 * Layout and numbers of the bucket elevator, shared by the simulation and the 3D scene so a
 * jellyfish is drawn in the bucket the model has it in.
 *
 * One elevator serves both nets. It stands inside net B's funnel, against the west breakwater, and
 * runs along the wall in the direction the bloom is already travelling: net A's catch leaves A
 * through the open panel at its end and the channel flow carries it down the wall into net B's
 * funnel, where it joins what net B caught. The funnel narrows to a barred mouth, and past it the
 * tip of the funnel is the hopper: net B on one side, the wall on the other, a floor below. The
 * buckets dip through the hopper at the elevator's tail, scoop water and the jellyfish in it, carry
 * them up along the wall and over the end of net B, and tip them at the head into a chute that runs
 * across to the head tank on the breakwater. The release line runs from the tank.
 *
 * The elevator is laid out in its own frame: u along the run (horizontal, downstream), y up and w
 * across it (toward the wall). `toWorld` places a point of that frame on the site.
 */

const K = ASSUMPTIONS.lift;
const DEG = Math.PI / 180;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const L = NETS[1];
const hw = SITE.channel.halfWidth;
const tanA = Math.tan(SITE.net.angle * DEG);

/** x of net B's line at a given z in the funnel (the hopper's west side). */
export function netBX(z: number): number {
  return hw - (z - L.bz) * tanA;
}

/** Where net B meets the hopper's mouth. */
const M = pointOnNet(L, L.length - SITE.collector.mouthBack);
/** The mouth: across the funnel from net B to the wall, facing the flow, barred. */
export const MOUTH = { x0: M.x, x1: hw - 0.2, z: M.z, x: (M.x + hw - 0.2) / 2 };
/**
 * Hopper: the tip of net B's funnel past the mouth, between net B (west) and the wall (east), with a
 * floor. `x0` is its widest west edge, at the mouth; `hopperWestX` gives the edge at any z.
 */
export const HOPPER = { x0: M.x, x1: hw - 0.2, z0: L.bz + 0.6, z1: M.z, floor: -7 };
/** The hopper's west edge (net B) at z. */
export function hopperWestX(z: number): number {
  return Math.max(HOPPER.x0, netBX(z));
}
/** Is (x, z) inside the hopper? */
export function inHopper(x: number, z: number): boolean {
  return z > HOPPER.z0 && z < HOPPER.z1 && x < HOPPER.x1 && x > netBX(z);
}

/** The elevator's frame on the site: its centre line along the wall, the tail's z, and its heading. */
export const ELEVATOR = {
  /** Centre line (x), clear of the wall by the bucket's half-width and the frame. */
  x: hw - 1.3,
  /** z of the tail sprocket, in the hopper just behind the mouth. */
  z: M.z - 2.85,
  /** Rotation about +y that turns the frame's +u (local +x) to −z on the site: downstream along the wall. */
  rotY: Math.PI / 2,
};

/** A point of the elevator's frame (u along, y up, w across toward the wall) on the site. */
export function toWorld(u: number, y: number, w: number, out: Vec3): Vec3 {
  out.x = ELEVATOR.x + w;
  out.y = y;
  out.z = ELEVATOR.z - u;
  return out;
}

const ci = Math.cos(K.incline * DEG);
const si = Math.sin(K.incline * DEG);
/** Unit vector up the incline, and its normal (up and back), in the elevator's frame (x = u, y up). */
export const UP_L = { x: ci, y: si, z: 0 };
export const NORMAL_L = { x: -si, y: ci, z: 0 };
/** Tail sprocket (in the hopper) and head sprocket (past the end of net B), in the elevator's frame. */
export const TAIL_L: Vec3 = { x: 0, y: -3.9, z: 0 };
export const HEAD_L: Vec3 = { x: ci * K.length, y: TAIL_L.y + si * K.length, z: 0 };
/** The same on the site. */
export const TAIL: Vec3 = toWorld(TAIL_L.x, TAIL_L.y, 0, { x: 0, y: 0, z: 0 });
export const HEAD: Vec3 = toWorld(HEAD_L.x, HEAD_L.y, 0, { x: 0, y: 0, z: 0 });
/** Chain loop length (m), the number of buckets on it and their spacing along it (m). */
export const LOOP = 2 * K.length + 2 * Math.PI * K.sprocketRadius;
export const BUCKETS = Math.round(LOOP / K.pitch);
export const PITCH = LOOP / BUCKETS;
/** Buckets past the scoop each second at full speed. */
export const BUCKET_RATE = K.chainSpeed / PITCH;
/** Chain distance from the scoop to where a bucket tips at the head (m). */
export const TIP_AT = K.length + (Math.PI / 2) * K.sprocketRadius;
/** How far below its pivot a bucket's centre hangs (m). */
export const HANG = 0.1 + K.bucket.depth / 2;
/** Water depth in a full bucket (m). */
export const BUCKET_FILL = K.bucketWater / (K.bucket.width * K.bucket.length);

/** Short sheet-pile cell in the west breakwater along the elevator's head, the hopper and the funnel (z range, m). */
export const SHEET_PILE_Z: readonly [number, number] = [HEAD.z - 9, MOUTH.z + 10];
/** Platform on the breakwater beside the head: it carries the head tank, the feed pump and the control kiosk. */
export const CREST_DECK = { x0: hw - 0.1, x1: hw + 16, z0: HEAD.z - 7, z1: HEAD.z + 5.5, top: SITE.breakwater.crestY + 0.45 };
/** Head tank on the platform, just past and beside the head. */
export const HEAD_TANK = { x: hw + 5.2, z: HEAD.z - 1.6, r: 1.9 };
/** Where a tipped bucket's contents fall: off the head, down the chute across to the tank (polyline, m). */
export const CHUTE: Vec3[] = [
  toWorld(HEAD_L.x + 0.9, HEAD_L.y - 0.2, 0, { x: 0, y: 0, z: 0 }),
  { x: HEAD_TANK.x - 1.7, y: ASSUMPTIONS.transfer.headTankLevel + 0.7, z: HEAD_TANK.z },
  { x: HEAD_TANK.x, y: ASSUMPTIONS.transfer.headTankLevel - 0.3, z: HEAD_TANK.z },
];
export const CHUTE_LENGTH = CHUTE.slice(1).reduce((a, p, k) => a + Math.hypot(p.x - CHUTE[k].x, p.y - CHUTE[k].y, p.z - CHUTE[k].z), 0);

/**
 * Pivot of the bucket at chain coordinate `s` (m from the scoop, around the loop), in the elevator's
 * frame (x = u along, y up, z = w across): up the carrying run, over the head sprocket, down the
 * return run and round the tail sprocket in the hopper.
 */
export function pivotLocalAt(s: number, out: Vec3): Vec3 {
  const r = K.sprocketRadius;
  const Ln = K.length;
  s = ((s % LOOP) + LOOP) % LOOP;
  out.z = 0;
  if (s < Ln) {
    out.x = TAIL_L.x + NORMAL_L.x * r + UP_L.x * s;
    out.y = TAIL_L.y + NORMAL_L.y * r + UP_L.y * s;
    return out;
  }
  s -= Ln;
  const arc = Math.PI * r;
  if (s < arc) {
    // Over the head: the normal turns forward and down.
    const a = s / r;
    out.x = HEAD_L.x + r * (NORMAL_L.x * Math.cos(a) + UP_L.x * Math.sin(a));
    out.y = HEAD_L.y + r * (NORMAL_L.y * Math.cos(a) + UP_L.y * Math.sin(a));
    return out;
  }
  s -= arc;
  if (s < Ln) {
    out.x = HEAD_L.x - NORMAL_L.x * r - UP_L.x * s;
    out.y = HEAD_L.y - NORMAL_L.y * r - UP_L.y * s;
    return out;
  }
  s -= Ln;
  const a = Math.min(1, s / arc) * Math.PI;
  out.x = TAIL_L.x + r * (-NORMAL_L.x * Math.cos(a) - UP_L.x * Math.sin(a));
  out.y = TAIL_L.y + r * (-NORMAL_L.y * Math.cos(a) - UP_L.y * Math.sin(a));
  return out;
}

const tmp: Vec3 = { x: 0, y: 0, z: 0 };
/** Pivot of the bucket at chain coordinate `s`, on the site. */
export function pivotAt(s: number, out: Vec3): Vec3 {
  pivotLocalAt(s, tmp);
  return toWorld(tmp.x, tmp.y, tmp.z, out);
}

/** How far a bucket at chain coordinate `s` is tipped (rad): the trip cam turns it over at the head. */
export function tipAt(s: number): number {
  s = ((s % LOOP) + LOOP) % LOOP;
  const a = (s - K.length) / (Math.PI * K.sprocketRadius);
  if (a <= 0 || a >= 1.6) return 0;
  return 2.3 * Math.sin((Math.min(a, 1.6) / 1.6) * Math.PI);
}

/**
 * Point `d` metres down the chute, and in `side` the horizontal unit vector across the chute there
 * (for spreading the animals over its width).
 */
export function chutePoint(d: number, out: Vec3, side?: { x: number; z: number }): Vec3 {
  for (let k = 1; k < CHUTE.length; k++) {
    const a = CHUTE[k - 1];
    const b = CHUTE[k];
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (d <= seg || k === CHUTE.length - 1) {
      const f = seg > 0 ? Math.min(1, Math.max(0, d / seg)) : 1;
      out.x = a.x + (b.x - a.x) * f;
      out.y = a.y + (b.y - a.y) * f;
      out.z = a.z + (b.z - a.z) * f;
      if (side) {
        const h = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        side.x = -(b.z - a.z) / h;
        side.z = (b.x - a.x) / h;
      }
      return out;
    }
    d -= seg;
  }
  return out;
}
