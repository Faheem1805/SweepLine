import { AgentPool } from './Agent';

/**
 * Deep copies of simulation state, for the story timeline: a recorded moment of a run that the
 * twin can jump back (or ahead) to.
 *
 * `capture` turns an object graph (engines, nets, the agent pool…) into plain objects, arrays and
 * typed arrays that share nothing with the original and can be posted between threads. `restore`
 * writes such a copy back into a live graph of the same shape, in place, so everything that holds a
 * reference to the live objects (the 3D scene, the UI) keeps working. Class prototypes are never
 * needed: the live graph already has them.
 */

export type Snap = unknown;

type Typed = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

/** Marks a second reference to an object already copied: restore leaves the live one as it is. */
const REF = '__ref';

/** The agent pool, with only the slots up to the highest one in use (the rest are inactive). */
function capturePool(pool: AgentPool, walk: (v: unknown) => unknown): Record<string, unknown> {
  let hi = pool.capacity;
  while (hi > 0 && pool.state[hi - 1] === 0) hi--;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(pool)) {
    const v = (pool as unknown as Record<string, unknown>)[k];
    if (typeof v === 'function') continue;
    if (ArrayBuffer.isView(v) && k !== 'freeList' && (v as Typed).length === pool.capacity) out[k] = (v as Typed).slice(0, hi);
    else out[k] = walk(v);
  }
  return out;
}

/** A deep, standalone copy of `root`'s own data (functions and prototypes left out). */
export function capture(root: unknown): Snap {
  const seen = new Set<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (ArrayBuffer.isView(v)) return (v as Typed).slice();
    if (seen.has(v)) return { [REF]: true };
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof AgentPool) return capturePool(v, walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x !== 'function') out[k] = walk(x);
    }
    return out;
  };
  return walk(root);
}

/**
 * Write `snap` into `target` in place where the shapes match (typed arrays are copied into, objects
 * filled key by key, arrays resized), and return what the field should now hold. A snapshot can be
 * restored any number of times: nothing in the live graph ever aliases it.
 */
export function restore(target: unknown, snap: Snap): unknown {
  if (snap === null || typeof snap !== 'object') return snap;
  if (ArrayBuffer.isView(snap)) {
    const s = snap as Typed;
    if (ArrayBuffer.isView(target) && target.constructor === s.constructor && (target as Typed).length >= s.length) {
      const t = target as Typed;
      t.set(s as never);
      if (t.length > s.length) t.fill(0, s.length);
      return t;
    }
    return s.slice();
  }
  if ((snap as Record<string, unknown>)[REF]) return target;
  if (Array.isArray(snap)) {
    const arr: unknown[] = Array.isArray(target) ? target : [];
    arr.length = snap.length;
    for (let i = 0; i < snap.length; i++) arr[i] = restore(arr[i], snap[i]);
    return arr;
  }
  const live = target !== null && typeof target === 'object' && !Array.isArray(target) && !ArrayBuffer.isView(target);
  const obj = (live ? target : {}) as Record<string, unknown>;
  for (const k of Object.keys(snap as object)) obj[k] = restore(obj[k], (snap as Record<string, unknown>)[k]);
  return obj;
}

/** Every buffer inside a snapshot, to transfer it between threads without copying. */
export function buffersOf(snap: Snap, out: ArrayBuffer[] = []): ArrayBuffer[] {
  if (snap === null || typeof snap !== 'object') return out;
  if (ArrayBuffer.isView(snap)) {
    const b = (snap as Typed).buffer;
    if (b instanceof ArrayBuffer && !out.includes(b)) out.push(b);
    return out;
  }
  if (Array.isArray(snap)) for (const x of snap) buffersOf(x, out);
  else for (const k of Object.keys(snap as object)) buffersOf((snap as Record<string, unknown>)[k], out);
  return out;
}

/** Bytes held by a snapshot's typed arrays. */
export function snapBytes(snap: Snap): number {
  return buffersOf(snap).reduce((a, b) => a + b.byteLength, 0);
}
