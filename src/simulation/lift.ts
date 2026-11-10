import { ASSUMPTIONS } from '../config/assumptions';
import { SITE } from '../config/site';
import { NETS } from './geometry';

/**
 * Layout and numbers of the bucket elevator, shared by the simulation and the 3D scene so a
 * jellyfish is drawn in the bucket the model has it in.
 *
 * One elevator serves both nets. It stands at net B's end against the west breakwater: net A's
 * catch leaves A through the open panel at its end and the channel flow carries it down the wall
 * into net B's funnel, where it joins what net B caught. The funnel delivers into a hopper. An
 * inclined chain of pivoted buckets dips through the hopper, each bucket scooping water and the
 * jellyfish in it, carries them up over the breakwater's crest and tips them into a chute to the
 * head tank on the crest. The release line runs from the tank.
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
/** Plane the elevator runs in (z): across the hopper, just downstream of net B's end. */
export const ELEVATOR_Z = L.bz - 4;
const ci = Math.cos(K.incline * DEG);
const si = Math.sin(K.incline * DEG);
/** Unit vector up the incline, and its normal (up and back), in the x-y plane. */
export const UP = { x: ci, y: si, z: 0 };
export const NORMAL = { x: -si, y: ci, z: 0 };
/** Tail sprocket (in the hopper) and head sprocket (over the crest) centres. */
export const TAIL: Vec3 = { x: hw - 8.4, y: -3.9, z: ELEVATOR_Z };
export const HEAD: Vec3 = { x: TAIL.x + ci * K.length, y: TAIL.y + si * K.length, z: ELEVATOR_Z };
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

/** Hopper in plan (m), its floor, and its mouth: the funnel's end, at net B's end against the wall. */
export const HOPPER = { x0: TAIL.x - 2.3, x1: hw - 0.2, z0: L.bz - 8.2, z1: L.bz + 0.2, floor: -7 };
export const MOUTH = { x: L.bx - 1.4, z: L.bz + 0.6 };
/** Head tank on the breakwater crest, past the head. */
export const HEAD_TANK = { x: HEAD.x + 3.6, z: ELEVATOR_Z, r: 1.9 };
/** Platform on the crest that carries the head, the tank, the drives and the feed pump. */
export const CREST_DECK = { x0: HEAD.x - 2.2, x1: HEAD.x + 8.2, z0: ELEVATOR_Z - 6, z1: ELEVATOR_Z + 6, top: SITE.breakwater.crestY + 0.45 };
/** Where a tipped bucket's contents fall: down the chute into the tank (polyline, m). */
export const CHUTE: Vec3[] = [
  { x: HEAD.x + 0.9, y: HEAD.y - 0.2, z: ELEVATOR_Z },
  { x: HEAD_TANK.x - 0.6, y: ASSUMPTIONS.transfer.headTankLevel + 0.6, z: ELEVATOR_Z },
  { x: HEAD_TANK.x, y: ASSUMPTIONS.transfer.headTankLevel - 0.3, z: ELEVATOR_Z },
];
export const CHUTE_LENGTH = CHUTE.slice(1).reduce((a, p, k) => a + Math.hypot(p.x - CHUTE[k].x, p.y - CHUTE[k].y, p.z - CHUTE[k].z), 0);

/**
 * Pivot of the bucket at chain coordinate `s` (m from the scoop, around the loop): up the carrying
 * run, over the head sprocket, down the return run and round the tail sprocket in the hopper.
 */
export function pivotAt(s: number, out: Vec3): Vec3 {
  const r = K.sprocketRadius;
  const Ln = K.length;
  s = ((s % LOOP) + LOOP) % LOOP;
  out.z = ELEVATOR_Z;
  if (s < Ln) {
    out.x = TAIL.x + NORMAL.x * r + UP.x * s;
    out.y = TAIL.y + NORMAL.y * r + UP.y * s;
    return out;
  }
  s -= Ln;
  const arc = Math.PI * r;
  if (s < arc) {
    // Over the head: the normal turns forward and down.
    const a = s / r;
    out.x = HEAD.x + r * (NORMAL.x * Math.cos(a) + UP.x * Math.sin(a));
    out.y = HEAD.y + r * (NORMAL.y * Math.cos(a) + UP.y * Math.sin(a));
    return out;
  }
  s -= arc;
  if (s < Ln) {
    out.x = HEAD.x - NORMAL.x * r - UP.x * s;
    out.y = HEAD.y - NORMAL.y * r - UP.y * s;
    return out;
  }
  s -= Ln;
  const a = Math.min(1, s / arc) * Math.PI;
  out.x = TAIL.x + r * (-NORMAL.x * Math.cos(a) - UP.x * Math.sin(a));
  out.y = TAIL.y + r * (-NORMAL.y * Math.cos(a) - UP.y * Math.sin(a));
  return out;
}

/** How far a bucket at chain coordinate `s` is tipped (rad): the trip cam turns it over at the head. */
export function tipAt(s: number): number {
  s = ((s % LOOP) + LOOP) % LOOP;
  const a = (s - K.length) / (Math.PI * K.sprocketRadius);
  if (a <= 0 || a >= 1.6) return 0;
  return 2.3 * Math.sin((Math.min(a, 1.6) / 1.6) * Math.PI);
}

/** Point `d` metres down the chute. */
export function chutePoint(d: number, out: Vec3): Vec3 {
  for (let k = 1; k < CHUTE.length; k++) {
    const a = CHUTE[k - 1];
    const b = CHUTE[k];
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (d <= seg || k === CHUTE.length - 1) {
      const f = seg > 0 ? Math.min(1, Math.max(0, d / seg)) : 1;
      out.x = a.x + (b.x - a.x) * f;
      out.y = a.y + (b.y - a.y) * f;
      out.z = a.z + (b.z - a.z) * f;
      return out;
    }
    d -= seg;
  }
  return out;
}
