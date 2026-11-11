/**
 * Reference coastal intake geometry — schematic, not any real plant's layout.
 *
 * World frame (used by both the simulation and the Three.js scene):
 *   - units are metres, y is up, still-water level is y = 0
 *   - +x runs along-shore (bearing 242°, WSW, as placed on the real coast by the map intro)
 *   - +z runs offshore (bearing 332°, NNW); the coastline lies toward −z
 *
 * The site is a dredged intake channel between two rock breakwaters, laid out like the reference
 * plant's satellite image: a long straight breakwater on the west side (+x), and an east breakwater
 * (−x) that bends round a side basin along the plant wall, where each unit has its own intake.
 * Everything the plant pumps comes through the channel, so inside it the water always runs one way,
 * toward the screens, whatever the tide outside is doing. SweepLine uses that flow: two full-depth
 * nets stand across the channel at a shallow angle, the water passes through them and the jellyfish
 * are swept along their faces to the collector at net B's end, against the west breakwater.
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
   * The side basin. Past the nets the channel bends along the plant wall toward the east (−x, see
   * `BASIN_SIDE`), and the east breakwater curves round the basin and ties back to the shore at its
   * far end. The simulation counts an animal as at the screens when it reaches `intake.mouthZ`, the
   * point where the channel opens into this basin and nothing further can stop it; it then rides on
   * to its unit's intake. Along-shore figures here are distances from the channel centreline into the
   * basin; multiply by `BASIN_SIDE` for x.
   */
  basin: {
    /** Plant wall, and the still-water line along the seaward side (z). */
    wallZ: -120,
    northZ: 30,
    /** Still-water line at the far end (distance into the basin, m). */
    endX: 900,
    /** Radii of the bend at the channel and of the tie-in to the shore, on the crest line (m). */
    bendRadius: 42,
    tieRadius: 90,
    /** Intake centres along the plant wall, one per unit (distance into the basin, m). */
    units: [220, 390, 560, 730],
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
    /**
     * Height of the float line above still water, and the tubular pile diameter (m). The piles stand
     * just behind the mesh, on its downstream side, and the panels run in slim guides on their
     * upstream face: the face the bloom slides along is smooth, with nothing to catch on.
     */
    freeboard: 0.6,
    pileDiameter: 0.8,
  },

  /** Collection funnel at net B's end, against the west breakwater (net A's end is open and feeds it). */
  collector: {
    /** Length of the funnel along net B, from where the bloom is taken into the collector's care to the net's end (m). */
    pocketLength: 22,
    /**
     * Where the funnel narrows into the hopper: the barred mouth across it, from net B to the wall,
     * this far back along net B from its end (m). The hopper is the funnel's tip past the mouth, net B
     * on one side and the wall on the other, so the water carries on through net B and the current
     * carries the bloom straight in. The elevator stands in it, along the wall.
     */
    mouthBack: 19,
    /**
     * Clear gap of the bar screens across both openings, net A's open panel and the hopper's mouth
     * (m): wider than the largest target bell (45 cm), narrower than a turtle or a big fish.
     */
    barGap: 0.5,
    /** Half-width of the funnel mouth, and of the suction it narrows to (m). */
    mouthHalfWidth: 8,
    throatHalfWidth: 1.4,
    /** Pump platform position (on piles, against the wall) relative to the net's end. */
    platformHalfWidth: 7,
    deckY: 4.6,
  },

  /** Release line: from the head tank on the west breakwater's crest, down its seaward side, then along the seabed to the outlet. */
  pipeRoute: [
    [88, 38.5],
    [104, 40],
    [132, 47],
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

/**
 * Side of the channel the basin opens to: −1 toward −x, the east (ENE), as on the satellite image.
 * Basin distances in `SITE.basin` times this give x.
 */
export const BASIN_SIDE = -1;

/** x of a point `d` metres into the basin side. */
export function basinX(d: number): number {
  return BASIN_SIDE * d;
}

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

/** 1 inside the dredged side basin and the channel's end, feathering to 0 at its edges. */
function basinWeight(x: number, z: number): number {
  const B = SITE.basin;
  const hw = SITE.channel.halfWidth;
  x *= BASIN_SIDE;
  return smoothstep(-hw - 8, -hw + 4, x) * (1 - smoothstep(B.endX - 10, B.endX + 20, x)) * smoothstep(B.wallZ - 6, B.wallZ + 4, z) * (1 - smoothstep(B.northZ - 2, B.northZ + 22, z));
}

/** Seabed depth below still water (positive metres) — shared by the simulation and seabed/water shaders. */
export function seabedDepth(x: number, z: number): number {
  const d0 = naturalDepth(x, z);
  const C = SITE.channel;
  let d = d0;
  if (z >= SITE.shore.toeZ) {
    // Dredged channel and forebay, feathering out beyond the mouth.
    const w = (1 - smoothstep(C.halfWidth + 2, C.halfWidth + 26, Math.abs(x))) * (1 - smoothstep(C.mouthZ + 20, C.mouthZ + 130, z));
    d = d0 + (Math.max(d0, C.depth) - d0) * w;
  }
  const b = basinWeight(x, z);
  return d + (Math.max(d, C.depth) - d) * b;
}

/** {@link seabedDepth} sampled every 2.5 m over the agent domain, built on first use. */
// A grid line sits exactly on the shoreline toe, where the seabed slope changes, so the table is exact there.
const SEABED_GRID = { x0: SITE.domain.xMin - 40, z0: SITE.shore.toeZ - 2.5 * Math.ceil((SITE.shore.toeZ + 140) / 2.5), x1: SITE.domain.xMax + 40, z1: SITE.domain.zMax + 40, cell: 2.5 };
let seabedGrid: Float32Array | null = null;
let seabedNx = 0;
let seabedNz = 0;

function buildSeabedGrid(): Float32Array {
  const G = SEABED_GRID;
  seabedNx = Math.ceil((G.x1 - G.x0) / G.cell) + 1;
  seabedNz = Math.ceil((G.z1 - G.z0) / G.cell) + 1;
  const g = new Float32Array(seabedNx * seabedNz);
  for (let j = 0; j < seabedNz; j++) {
    const z = G.z0 + j * G.cell;
    for (let i = 0; i < seabedNx; i++) g[j * seabedNx + i] = seabedDepth(G.x0 + i * G.cell, z);
  }
  return g;
}

/**
 * Seabed depth from a 2.5 m lookup table (bilinear): what the agent model reads every step, at a
 * fraction of the cost of {@link seabedDepth}. Within a few centimetres of it (`npm test` checks).
 */
export function seabedDepthFast(x: number, z: number): number {
  const g = seabedGrid ?? (seabedGrid = buildSeabedGrid());
  const G = SEABED_GRID;
  let fx = (x - G.x0) / G.cell;
  let fz = (z - G.z0) / G.cell;
  if (fx < 0) fx = 0;
  else if (fx > seabedNx - 1.001) fx = seabedNx - 1.001;
  if (fz < 0) fz = 0;
  else if (fz > seabedNz - 1.001) fz = seabedNz - 1.001;
  const i = fx | 0;
  const j = fz | 0;
  const u = fx - i;
  const v = fz - j;
  const k = j * seabedNx + i;
  const a = g[k] + (g[k + 1] - g[k]) * u;
  const b = g[k + seabedNx] + (g[k + seabedNx + 1] - g[k + seabedNx]) * u;
  return a + (b - a) * v;
}

/** GLSL twin of {@link seabedDepth}. Keep both in sync. */
export const SEABED_DEPTH_GLSL = /* glsl */ `
float seabedDepth(vec2 p) {
  float dz = p.y - (${SITE.shore.toeZ.toFixed(3)});
  float d;
  if (dz < 0.0) {
    d = max(0.5, ${SITE.bathymetry.depthAtToe.toFixed(3)} + dz * 0.75);
  } else {
    d = ${SITE.bathymetry.depthAtToe.toFixed(3)} + ${SITE.bathymetry.slope.toFixed(4)} * dz
      + 0.28 * sin(p.x * 0.0051 + p.y * 0.0037)
      + 0.16 * sin(p.x * 0.0173 - p.y * 0.0113);
    d = min(d, ${SITE.bathymetry.maxDepth.toFixed(3)});
    float w = (1.0 - smoothstep(${(SITE.channel.halfWidth + 2).toFixed(1)}, ${(SITE.channel.halfWidth + 26).toFixed(1)}, abs(p.x)))
      * (1.0 - smoothstep(${(SITE.channel.mouthZ + 20).toFixed(1)}, ${(SITE.channel.mouthZ + 130).toFixed(1)}, p.y));
    d = mix(d, max(d, ${SITE.channel.depth.toFixed(1)}), w);
  }
  float bx = ${BASIN_SIDE.toFixed(1)} * p.x;
  float b = smoothstep(${(-SITE.channel.halfWidth - 8).toFixed(1)}, ${(-SITE.channel.halfWidth + 4).toFixed(1)}, bx)
    * (1.0 - smoothstep(${(SITE.basin.endX - 10).toFixed(1)}, ${(SITE.basin.endX + 20).toFixed(1)}, bx))
    * smoothstep(${(SITE.basin.wallZ - 6).toFixed(1)}, ${(SITE.basin.wallZ + 4).toFixed(1)}, p.y)
    * (1.0 - smoothstep(${(SITE.basin.northZ - 2).toFixed(1)}, ${(SITE.basin.northZ + 22).toFixed(1)}, p.y));
  return mix(d, max(d, ${SITE.channel.depth.toFixed(1)}), b);
}
`;

/**
 * How much the breakwaters calm the sea at (x, z): 1 in the open sea, down to `shelter` deep in the
 * channel. The share of the offshore wave height that reaches a point.
 */
export function waveExposure(x: number, z: number): number {
  const C = SITE.channel;
  const B = SITE.basin;
  const inside = (1 - smoothstep(C.halfWidth - 6, C.halfWidth + 40, Math.abs(x))) * (1 - smoothstep(C.mouthZ - 180, C.mouthZ + 30, z));
  // The side basin, behind the curved breakwater.
  const bx = BASIN_SIDE * x;
  const basin = smoothstep(C.halfWidth, C.halfWidth + 40, bx) * (1 - smoothstep(B.endX - 20, B.endX + 60, bx)) * (1 - smoothstep(B.northZ + 40, B.northZ + 75, z));
  return 1 - Math.max(inside, basin) * (1 - WAVE_SHELTER);
}

/** Share of the offshore wave height that reaches the sheltered channel. Assumption, typical of a rubble-mound basin. */
export const WAVE_SHELTER = 0.2;

/** GLSL twin of {@link waveExposure}. */
export const WAVE_EXPOSURE_GLSL = /* glsl */ `
float waveExposure(vec2 p) {
  float inside = (1.0 - smoothstep(${(SITE.channel.halfWidth - 6).toFixed(1)}, ${(SITE.channel.halfWidth + 40).toFixed(1)}, abs(p.x)))
    * (1.0 - smoothstep(${(SITE.channel.mouthZ - 180).toFixed(1)}, ${(SITE.channel.mouthZ + 30).toFixed(1)}, p.y));
  float bx = ${BASIN_SIDE.toFixed(1)} * p.x;
  float basin = smoothstep(${SITE.channel.halfWidth.toFixed(1)}, ${(SITE.channel.halfWidth + 40).toFixed(1)}, bx)
    * (1.0 - smoothstep(${(SITE.basin.endX - 20).toFixed(1)}, ${(SITE.basin.endX + 60).toFixed(1)}, bx))
    * (1.0 - smoothstep(${(SITE.basin.northZ + 40).toFixed(1)}, ${(SITE.basin.northZ + 75).toFixed(1)}, p.y));
  return 1.0 - max(inside, basin) * ${(1 - WAVE_SHELTER).toFixed(3)};
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

/** Crest centre line of the channel's breakwaters, from the shared crest profile (m from the centreline). */
export const CREST = {
  inner: SITE.channel.halfWidth + SITE.breakwater.crestY * SITE.breakwater.slope,
  get outer() {
    return this.inner + SITE.breakwater.crestWidth;
  },
  get centre() {
    return this.inner + SITE.breakwater.crestWidth / 2;
  },
};

/** Crest line of the east breakwater (the basin side), head to shore: down the channel, round the bend, along the basin, into the shore. */
export function eastCrestLine(step = 6): Array<[number, number]> {
  const B = SITE.basin;
  const hx = CREST.centre;
  const inset = CREST.inner - SITE.channel.halfWidth + SITE.breakwater.crestWidth / 2;
  const zb = B.northZ + inset;
  const R = B.bendRadius;
  const R2 = B.tieRadius;
  const ex = B.endX + inset - R2;
  const pts: Array<[number, number]> = [];
  for (let z = SITE.channel.mouthZ; z > zb + R; z -= step) pts.push([hx, z]);
  for (let a = 180; a <= 270; a += 6) pts.push([hx + R + R * Math.cos((a * Math.PI) / 180), zb + R + R * Math.sin((a * Math.PI) / 180)]);
  for (let x = hx + R + step; x < ex; x += step) pts.push([x, zb]);
  for (let a = 90; a >= 0; a -= 6) pts.push([ex + R2 * Math.cos((a * Math.PI) / 180), zb - R2 + R2 * Math.sin((a * Math.PI) / 180)]);
  for (let z = zb - R2 - step; z > SITE.shore.crestZ - 20; z -= step) pts.push([ex + R2, z]);
  for (const p of pts) p[0] *= BASIN_SIDE;
  return pts;
}

/** Crest line of the west breakwater, head to shore: straight down the channel's west side. */
export function westCrestLine(step = 6): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let z = SITE.channel.mouthZ; z > SITE.basin.wallZ - 8; z -= step) pts.push([-BASIN_SIDE * CREST.centre, z]);
  return pts;
}

/** True where a drawing of the water should appear: open sea, the channel or the side basin. */
export function isWater(x: number, z: number): boolean {
  const C = SITE.channel;
  const B = SITE.basin;
  if (inMound(x, z)) return false;
  x *= BASIN_SIDE;
  if (z < SITE.shore.toeZ) return x > -C.halfWidth && x < B.endX && z > B.wallZ;
  if (x > C.halfWidth && x < B.endX + 60 && z > B.northZ && z < B.northZ + 72) return false;
  if (x > B.endX && x < B.endX + 60 && z < B.northZ) return false;
  return true;
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
