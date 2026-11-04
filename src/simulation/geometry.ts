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
  /** Where the collection pocket starts, as arc length along the net. */
  pocketS: number;
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
    pocketS: length - SITE.collector.pocketLength,
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

/** Where a net's collector draws the animals in (near its end, against the east wall). */
export function collectorPoint(L: NetLine): { x: number; z: number } {
  return pointOnNet(L, L.length - 3);
}
