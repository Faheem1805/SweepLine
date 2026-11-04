import { ASSUMPTIONS } from '../config/assumptions';

/**
 * The hand sums behind the net, kept apart from the agent model so anyone can check them. Nothing
 * here depends on the reference channel: put in a real channel and it says what net it needs.
 */

const RHO = 1025;
const G = 9.81;
/** Kinematic viscosity of warm seawater (m²/s) and HDPE wall roughness (m). */
const NU = 0.9e-6;
const ROUGHNESS = 7e-6;

export interface Sizing {
  /** Mean speed down the channel (m/s). */
  channelSpeed: number;
  /** Speed through the mesh and along its face (m/s). */
  through: number;
  sweep: number;
  /** Net length that fits this channel at this angle (m). */
  netLength: number;
  /** Shortest net that keeps the through-mesh speed at the limit, for any channel of this depth (m). */
  minNetLength: number;
  /** Largest angle that keeps within the limit (degrees); 90 means square-on is fine. */
  maxAngle: number;
  /** Time for an animal to ride the whole net to the collector (min). */
  rideMin: number;
  ok: boolean;
}

/** Split the channel flow across a net at `angleDeg` to the channel axis. */
export function sizeNet(flowM3s: number, width: number, depth: number, angleDeg: number): Sizing {
  const limit = ASSUMPTIONS.screenCriteria.approachMax;
  const a = (angleDeg * Math.PI) / 180;
  const channelSpeed = flowM3s / (width * depth);
  const through = channelSpeed * Math.sin(a);
  const sweep = channelSpeed * Math.cos(a);
  const netLength = width / Math.sin(a);
  return {
    channelSpeed,
    through,
    sweep,
    netLength,
    minNetLength: flowM3s / (depth * limit),
    maxAngle: channelSpeed <= limit ? 90 : (Math.asin(limit / channelSpeed) * 180) / Math.PI,
    rideMin: netLength / (sweep * ASSUMPTIONS.net.slide) / 60,
    ok: through <= limit && sweep > through,
  };
}

export interface LineSizing {
  /** Water flow (m³/s) and biomass the line can carry (t/h). */
  flow: number;
  capacityTph: number;
  /** Friction and fittings loss down the line (m), the screw's lift (m), and power while running (kW). */
  head: number;
  lift: number;
  kW: number;
  transitMin: number;
}

/** The transfer line: a head tank above the breakwater, then a smooth bore to the outlet. */
export function sizeLine(): LineSizing {
  const T = ASSUMPTIONS.transfer;
  const area = (Math.PI / 4) * T.pipeBore * T.pipeBore;
  const flow = area * T.pipeVelocity;
  const capacityTph = (flow * T.maxJellyFraction * RHO * 3600) / 1000;
  const re = (T.pipeVelocity * T.pipeBore) / NU;
  const f = 0.25 / Math.log10(ROUGHNESS / (3.7 * T.pipeBore) + 5.74 / re ** 0.9) ** 2;
  const vHead = (T.pipeVelocity * T.pipeVelocity) / (2 * G);
  const head = f * (T.length / T.pipeBore) * vHead + T.minorLossK * vHead;
  // The lift is set by the tank having to stand above the breakwater, not by friction: the tank is
  // higher than the line needs, and the outlet valve takes up the difference.
  const lift = T.headTankLevel - T.wetWellLevel;
  const kW = (RHO * G * flow * lift) / T.pumpEfficiency / 1000;
  return { flow, capacityTph, head, lift, kW, transitMin: T.length / T.pipeVelocity / 60 };
}
