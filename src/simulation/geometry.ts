import { ASSUMPTIONS } from '../config/assumptions';
import { SITE } from '../config/site';
import type { NetIndex } from './types';

/**
 * Plan geometry of the two guide nets. A net is a straight line from the west wall to the east
 * wall of the channel. `s` runs along it from the west wall to the collector; the normal points
 * upstream, so a signed distance d > 0 is on the bloom face.
 */
export interface NetLine {
  index: NetIndex;
  name: 'Net A' | 'Net B';
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Unit vector along the net, toward the collector. */
  tx: number;
  tz: number;
  /** Unit normal, toward the upstream (bloom) face. */
  nx: number;
  nz: number;
  length: number;
  panels: number;
  panelLength: number;
}

const DEG = Math.PI / 180;

function makeNet(index: NetIndex): NetLine {
  const hw = SITE.channel.halfWidth;
  const a = SITE.net.angle * DEG;
  const dz = (2 * hw) / Math.tan(a);
  const az = SITE.net.upstreamZ - index * SITE.net.lineSpacing;
  const bz = az - dz;
  const length = (2 * hw) / Math.sin(a);
  const tx = Math.sin(a);
  const tz = -Math.cos(a);
  const panels = Math.ceil(length / SITE.net.panelLength);
  return {
    index,
    name: index === 0 ? 'Net A' : 'Net B',
    ax: -hw,
    az,
    bx: hw,
    bz,
    tx,
    tz,
    nx: Math.cos(a),
    nz: Math.sin(a),
    length,
    panels,
    panelLength: length / panels,
  };
}

export const NETS: readonly [NetLine, NetLine] = [makeNet(0), makeNet(1)];

/** Point on a net at arc length `s`. */
export function pointOnNet(L: NetLine, s: number): { x: number; z: number } {
  return { x: L.ax + L.tx * s, z: L.az + L.tz * s };
}

/** Signed distance from a net (> 0 on the bloom face). */
export function netDistance(L: NetLine, x: number, z: number): number {
  return (x - L.ax) * L.nx + (z - L.az) * L.nz;
}

/** Arc length of the nearest point on a net's line. */
export function netArc(L: NetLine, x: number, z: number): number {
  return (x - L.ax) * L.tx + (z - L.az) * L.tz;
}

/** Distance off the net's bloom face to the east wall, along the normal, at arc length `s` (m). */
export function wallGap(L: NetLine, s: number): number {
  return (SITE.channel.halfWidth - (L.ax + L.tx * s)) / L.nx;
}

interface P2 {
  x: number;
  z: number;
}

/**
 * The funnel at the end of one net: one set of numbers that the engine moves animals through and
 * the 3D scene draws. In plan it sits in the wedge between the net and the east wall:
 *
 *   approach (on the net) → mouth → wings narrow → throat → pocket → wet-well entry (lift suction)
 *
 * The net is the inner side all the way. A perforated wing is the outer side from the mouth, where
 * it meets the wall, to the throat; the pocket's sides are solid. Widths are measured off the net face.
 */
export interface Funnel {
  index: NetIndex;
  line: NetLine;
  /** Arc length along the net of the mouth, the throat and the wet-well entry (m). */
  mouthS: number;
  throatS: number;
  entryS: number;
  mouthWidth: number;
  throatWidth: number;
  /** Plan corners: on the net (In) and on the wing or pocket side (Out). */
  mouthIn: P2;
  mouthOut: P2;
  throatIn: P2;
  throatOut: P2;
  entryIn: P2;
  entryOut: P2;
  /** Centre of the wet-well entry, where the lift draws. */
  entry: P2;
  /** Spray bar of the sweep assist, along the net ahead of the mouth (arc length, m). */
  barS0: number;
  barS1: number;
}

const off = (L: NetLine, s: number, w: number): P2 => ({ x: L.ax + L.tx * s + L.nx * w, z: L.az + L.tz * s + L.nz * w });

function makeFunnel(L: NetLine): Funnel {
  const K = SITE.collector;
  const mouthS = L.length - K.mouthBack;
  const throatS = L.length - K.throatBack;
  const entryS = L.length - K.entryBack;
  const mouthWidth = wallGap(L, mouthS);
  return {
    index: L.index,
    line: L,
    mouthS,
    throatS,
    entryS,
    mouthWidth,
    throatWidth: K.throatWidth,
    mouthIn: off(L, mouthS, 0),
    mouthOut: off(L, mouthS, mouthWidth),
    throatIn: off(L, throatS, 0),
    throatOut: off(L, throatS, K.throatWidth),
    entryIn: off(L, entryS, 0),
    entryOut: off(L, entryS, K.throatWidth),
    entry: off(L, entryS - 0.4, K.throatWidth / 2),
    barS0: mouthS - ASSUMPTIONS.assist.barLength,
    barS1: mouthS,
  };
}

export const FUNNELS: readonly [Funnel, Funnel] = [makeFunnel(NETS[0]), makeFunnel(NETS[1])];

/** Open width off the net face at arc length `s` (m): the wedge to the wall ahead of the mouth, then the funnel and pocket. */
export function funnelWidth(F: Funnel, s: number): number {
  if (s < F.mouthS) return wallGap(F.line, s);
  if (s <= F.throatS) return F.mouthWidth + ((F.throatWidth - F.mouthWidth) * (s - F.mouthS)) / (F.throatS - F.mouthS);
  if (s <= F.entryS) return F.throatWidth;
  return 0;
}

/** Inside the funnel proper: past the mouth, short of the throat, between the net and the wing. */
export function inFunnel(F: Funnel, x: number, z: number): boolean {
  const s = netArc(F.line, x, z);
  if (s < F.mouthS || s >= F.throatS) return false;
  const w = netDistance(F.line, x, z);
  return w >= -0.2 && w <= funnelWidth(F, s);
}

/** Where a net's collector draws the animals in: the wet-well entry at the end of its pocket. */
export function collectorPoint(L: NetLine): P2 {
  return FUNNELS[L.index].entry;
}
