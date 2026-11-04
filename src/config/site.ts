/**
 * Reference coastal intake geometry — schematic, not any real plant's layout.
 *
 * World frame (used by both the simulation and the Three.js scene):
 *   - units are metres, y is up, still-water level is y = 0
 *   - +x runs along-shore (bearing 242°, WSW, as placed on the real coast by the map intro)
 *   - +z runs offshore (bearing 332°, NNW); the coastline lies toward −z
 *
 * The site is a dredged intake channel between two rock breakwaters. Everything the plant pumps
 * comes through it, so inside the channel the water always runs one way, toward the screens,
 * whatever the tide outside is doing. SweepLine uses that flow: two full-depth nets stand across
 * the channel at a shallow angle, the water passes through them and the jellyfish are swept along
 * their faces to a collector at the east wall.
 *
 * Everything the agent model treats as physical structure is defined here, so a replaced GLB model
 * never changes simulation behaviour.
 */
export const SITE = {
  /** Compass bearing that the world +x axis points toward (degrees); matches the map intro's hand-off. */
  bearingOfPlusX: 242,

  shore: {
    /** Toe of the rock revetment — offshore limit of the armour slope. */
    toeZ: -50,
    /** Crest of the revetment / crown wall line. */
    crestZ: -62,
    crestY: 3.4,
    landY: 3.0,
  },

  bathymetry: {
    depthAtToe: 6.0,
    /** Natural seabed deepening per metre offshore. */
    slope: 0.0065,
    maxDepth: 14,
  },

  /** The dredged intake channel: walls (inner toes of the breakwaters) at x = ±halfWidth, open to the sea at mouthZ. */
  channel: {
    halfWidth: 70,
    depth: 12,
    mouthZ: 540,
  },

  breakwater: {
    crestY: 4.2,
    crestWidth: 10,
    /** Armour slope, horizontal per vertical. */
    slope: 1.5,
    /** Outer toe of the rock mound, measured from the channel centreline (m). */
    outerToe: 125,
    /** Rounded head beyond the mouth (m). */
    headRadius: 26,
  },

  intake: {
    /** Seaward screen face spans x0..x1 at z = mouthZ, facing offshore (+z). */
    x0: -60,
    x1: 60,
    mouthZ: -30,
    backZ: -84,
    sillDepth: 12,
    deckY: 3.8,
    bays: 12,
    pierWidth: 1.6,
  },

  /**
   * The two guide nets. Each runs from the west wall to the east wall at `angle` to the channel axis,
   * net A upstream, net B `lineSpacing` behind it (measured along the channel).
   */
  net: {
    angle: 20,
    /** z at which net A meets the west wall. */
    upstreamZ: 480,
    lineSpacing: 60,
    panelLength: 20,
    /** Height of the float line above still water, and the tubular pile diameter (m). */
    freeboard: 0.6,
    pileDiameter: 1.1,
  },

  /** Collection pocket at the downstream end of each net, against the east wall. */
  collector: {
    /** Length of the funnel ahead of the suction, along the net (m). */
    pocketLength: 16,
    /** Half-width of the funnel mouth, and of the suction it narrows to (m). */
    mouthHalfWidth: 8,
    throatHalfWidth: 1.4,
    /** Pump platform position (on piles, against the wall) relative to the net's end. */
    platformHalfWidth: 7,
    deckY: 4.6,
  },

  /** Release line: over the east breakwater, then along the seabed to the outlet. */
  pipeRoute: [
    [80, 89],
    [100, 89],
    [132, 94],
    [620, 150],
    [2040, 300],
  ] as ReadonlyArray<readonly [number, number]>,

  /** Release outlet, 2 km along the shore on the down-drift side (`ASSUMPTIONS.release.design`). */
  release: {
    x: 2040,
    z: 300,
    dirX: 0.94,
    dirZ: 0.34,
  },

  /** Agents leaving these bounds are considered to have passed the site. */
  domain: { xMin: -1100, xMax: 2200, zMin: -52, zMax: 1200 },

  /**
   * Where the bloom is when a run starts: a patch drifting along the coast, centred on the band of
   * water the intake draws in (a bloom further out would pass the site and never involve it).
   */
  spawn: {
    /** Distance upstream of the mouth (along the current) of the patch's leading edge and trailing supply line (m). */
    leadX: 150,
    supplyX: 620,
    jitterX: 20,
    zCenter: 610,
    zSigma: 95,
    zMin: 400,
    zMax: 980,
  },
} as const;

/** Inner half-width of the mound's footprint at height of the seabed: the region an agent cannot enter. */
const BW = SITE.breakwater;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Natural seabed depth below still water (positive metres), before dredging. */
function naturalDepth(x: number, z: number): number {
  const b = SITE.bathymetry;
  const dz = z - SITE.shore.toeZ;
  if (dz < 0) return Math.max(0.5, b.depthAtToe + dz * 0.75);
  const d = b.depthAtToe + b.slope * dz + 0.28 * Math.sin(x * 0.0051 + z * 0.0037) + 0.16 * Math.sin(x * 0.0173 - z * 0.0113);
  return Math.min(d, b.maxDepth);
}

/** Seabed depth below still water (positive metres) — shared by the simulation and seabed/water shaders. */
export function seabedDepth(x: number, z: number): number {
  const d0 = naturalDepth(x, z);
  const C = SITE.channel;
  if (z < SITE.shore.toeZ) return d0;
  // Dredged channel and forebay, feathering out beyond the mouth.
  const w = (1 - smoothstep(C.halfWidth + 2, C.halfWidth + 26, Math.abs(x))) * (1 - smoothstep(C.mouthZ + 20, C.mouthZ + 130, z));
  const dredged = Math.max(d0, C.depth);
  return d0 + (dredged - d0) * w;
}

/** GLSL twin of {@link seabedDepth}. Keep both in sync. */
export const SEABED_DEPTH_GLSL = /* glsl */ `
float seabedDepth(vec2 p) {
  float dz = p.y - (${SITE.shore.toeZ.toFixed(3)});
  if (dz < 0.0) return max(0.5, ${SITE.bathymetry.depthAtToe.toFixed(3)} + dz * 0.75);
  float d = ${SITE.bathymetry.depthAtToe.toFixed(3)} + ${SITE.bathymetry.slope.toFixed(4)} * dz
    + 0.28 * sin(p.x * 0.0051 + p.y * 0.0037)
    + 0.16 * sin(p.x * 0.0173 - p.y * 0.0113);
  d = min(d, ${SITE.bathymetry.maxDepth.toFixed(3)});
  float w = (1.0 - smoothstep(${(SITE.channel.halfWidth + 2).toFixed(1)}, ${(SITE.channel.halfWidth + 26).toFixed(1)}, abs(p.x)))
    * (1.0 - smoothstep(${(SITE.channel.mouthZ + 20).toFixed(1)}, ${(SITE.channel.mouthZ + 130).toFixed(1)}, p.y));
  return mix(d, max(d, ${SITE.channel.depth.toFixed(1)}), w);
}
`;

/**
 * How much the breakwaters calm the sea at (x, z): 1 in the open sea, down to `shelter` deep in the
 * channel. The share of the offshore wave height that reaches a point.
 */
export function waveExposure(x: number, z: number): number {
  const C = SITE.channel;
  const inside = (1 - smoothstep(C.halfWidth - 6, C.halfWidth + 40, Math.abs(x))) * (1 - smoothstep(C.mouthZ - 180, C.mouthZ + 30, z));
  return 1 - inside * (1 - WAVE_SHELTER);
}

/** Share of the offshore wave height that reaches the sheltered channel. Assumption, typical of a rubble-mound basin. */
export const WAVE_SHELTER = 0.2;

/** GLSL twin of {@link waveExposure}. */
export const WAVE_EXPOSURE_GLSL = /* glsl */ `
float waveExposure(vec2 p) {
  float inside = (1.0 - smoothstep(${(SITE.channel.halfWidth - 6).toFixed(1)}, ${(SITE.channel.halfWidth + 40).toFixed(1)}, abs(p.x)))
    * (1.0 - smoothstep(${(SITE.channel.mouthZ - 180).toFixed(1)}, ${(SITE.channel.mouthZ + 30).toFixed(1)}, p.y));
  return 1.0 - inside * ${(1 - WAVE_SHELTER).toFixed(3)};
}
`;

/** True inside the breakwaters' rock mound (where water, and any jellyfish, cannot be). */
export function inMound(x: number, z: number): boolean {
  const ax = Math.abs(x);
  const C = SITE.channel;
  if (z > C.mouthZ + BW.headRadius || z < SITE.shore.toeZ) return false;
  if (z <= C.mouthZ) return ax > C.halfWidth && ax < BW.outerToe;
  // Rounded head.
  const cx = (C.halfWidth + BW.outerToe) / 2;
  const r = (BW.outerToe - C.halfWidth) / 2;
  const dx = ax - cx;
  const dz = (z - C.mouthZ) * (r / BW.headRadius);
  return dx * dx + dz * dz < r * r;
}

/** Convert a compass bearing (direction of travel) to a unit world-plane vector (x, z). Bearings turn clockwise from +x toward +z. */
export function bearingToWorld(bearingDeg: number): { x: number; z: number } {
  const a = ((bearingDeg - SITE.bearingOfPlusX) * Math.PI) / 180;
  return { x: Math.cos(a), z: Math.sin(a) };
}

/** Compass point label (16-wind) for a bearing. */
export function compassLabel(bearingDeg: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const i = Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16;
  return pts[i];
}
