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
  /** Where the collection funnel starts, as arc length along the net (net B; net A has none). */
  pocketS: number;
  /**
   * Arc length past which the net is open. Net A's last panel is left out: what it has guided
   * along its face goes through the gap and on down the wall into net B's funnel.
   */
  openFrom: number;
  /** Arc length to which the mesh is drawn: net A to its open panel, net B to the hopper's mouth (the hopper's screens take over past it). */
  drawTo: number;
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
    openFrom: index === 0 ? length - length / panels : length,
    drawTo: index === 0 ? length - length / panels : length - SITE.collector.mouthBack,
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

/** Where a net's funnel draws the animals in (near its end, against the west breakwater). */
export function collectorPoint(L: NetLine): { x: number; z: number } {
  return pointOnNet(L, L.length - 3);
}
