/** Captures a frame of the twin, flow lines and the tide record for the poster's figures. */
import { writeFileSync } from 'node:fs';
import { SITE, seabedDepth } from '../src/config/site';
import { S_GUIDED, S_INACTIVE, S_TRANSFERRED, S_TRANSFER_QUEUE } from '../src/simulation/Agent';
import { FlowField } from '../src/simulation/flowField';
import { NETS } from '../src/simulation/geometry';
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { TIDE, tideCurrent, tideDate } from '../src/simulation/tide';
import { DEFAULT_PARAMS } from '../src/simulation/types';

const out = process.argv.find((a) => a.startsWith('out='))!.split('=')[1];
const AT = 105 * 60;
const p = { ...DEFAULT_PARAMS, seed: 1000 };
const s = new SimulationEngine('sweepline', p);
s.reset(p, 'approach');
s.transfer!.running = true;
for (let t = 0; t < AT; t += 0.4) s.step(0.4);

const a = s.pool;
const agents: Array<[number, number, number, number]> = [];
for (let i = 0; i < a.capacity; i++) {
  const st = a.state[i];
  if (st === S_INACTIVE || st === S_TRANSFERRED) continue;
  agents.push([Math.round(a.px[i]), Math.round(a.pz[i]), -Math.round(a.py[i] * 10) / 10, st === S_GUIDED ? 1 : st === S_TRANSFER_QUEUE ? 2 : 0]);
}

// Flow lines, traced through the same field the agents ride.
const f = new FlowField();
f.setCurrent(p.currentSpeed, p.currentBearing);
const lines: Array<Array<[number, number]>> = [];
const v = { x: 0, z: 0 };
function trace(x0: number, z0: number, secs: number) {
  const pts: Array<[number, number]> = [];
  let x = x0;
  let z = z0;
  for (let t = 0; t < secs; t += 30) {
    pts.push([Math.round(x), Math.round(z)]);
    f.sample(x, z, 2, v);
    x += v.x * 30;
    z += v.z * 30;
    if (z < SITE.intake.mouthZ + 2 || Math.abs(x) > 1300 || z > 1250) break;
    const ax = Math.abs(x);
    if (ax > SITE.channel.halfWidth - 1 && ax < SITE.breakwater.outerToe + 1 && z < SITE.channel.mouthZ + 20) {
      if (ax < SITE.breakwater.outerToe - 30) break;
      x = Math.sign(x) * (SITE.breakwater.outerToe + 1);
    }
  }
  pts.push([Math.round(x), Math.round(z)]);
  lines.push(pts);
}
for (let z = 180; z <= 1180; z += 75) trace(-1250, z, 16000);
for (let x = -56; x <= 56; x += 16) trace(x, 500, 3000);

// Depth contours sampled on a grid (for the sea's shading).
const contours: number[][] = [];
for (let z = -50; z <= 1250; z += 25) {
  const row: number[] = [];
  for (let x = -1250; x <= 1250; x += 25) row.push(Math.round(seabedDepth(x, z) * 10) / 10);
  contours.push(row);
}

// The recorded tide around the reference turn.
const t0 = TIDE.referenceTurn - 18;
const tide: Array<[number, number]> = [];
for (let h = 0; h <= 36; h += 0.25) tide.push([h - 18, Math.round(tideCurrent(t0 + h) * 1000) / 1000]);

writeFileSync(
  out,
  JSON.stringify({
    atMin: AT / 60,
    agents,
    lines,
    contours,
    tide,
    turnDate: tideDate(TIDE.referenceTurn).toISOString(),
    channelSpeed: s.flow.channelSpeed,
    nets: NETS.map((L) => ({ ax: L.ax, az: L.az, bx: L.bx, bz: L.bz, length: L.length, panels: L.panels, panelLength: L.panelLength })),
    through: Array.from(s.nets[0].through),
    head: s.nets[0].head,
    kgPerAgent: s.kgPerAgent,
  }),
);
console.log('agents', agents.length, 'lines', lines.length);
