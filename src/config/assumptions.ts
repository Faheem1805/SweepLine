/**
 * Simulation and design assumptions.
 *
 * Every number in this file is a DESIGN ASSUMPTION used by the agent-based engineering simulation,
 * unless its comment names a source. None of them is a validated field value. They are grouped here
 * so they can be reviewed, challenged and calibrated against flume and field data later without
 * touching simulation code. `src/config/sensitivity.ts` says which test settles which number.
 */

/** Jellyfish the twin can be run against. The brief names the first and asks designs to adapt to others. */
export const SPECIES = {
  catostylus: {
    name: 'Blue Blubber',
    latin: 'Catostylus',
    /** Bell diameter range (m) and wet mass of one animal (kg). */
    bellMin: 0.3,
    bellMax: 0.45,
    kgEach: 1.2,
    /** Self-propulsion (m/s), from bell pulsation: lab bells swim about one bell-width a second (Neil & Askew 2018). */
    swimMin: 0.02,
    swimMax: 0.06,
    /** Share of animals that work through the mesh or a panel joint, per panel travelled. Firm bell: low. */
    leakPerPanel: 0.0006,
    /** Bell area blocking the net, per kg on it (m²/kg). */
    blockPerKg: 0.1,
    meanDepth: 2.4,
    depthSD: 1.4,
    tint: 0,
  },
  aurelia: {
    name: 'Moon jellyfish',
    latin: 'Aurelia',
    bellMin: 0.12,
    bellMax: 0.28,
    kgEach: 0.15,
    swimMin: 0.01,
    swimMax: 0.04,
    /** Soft and easily torn: more fragments pass the mesh. */
    leakPerPanel: 0.002,
    blockPerKg: 0.22,
    meanDepth: 3.2,
    depthSD: 2.0,
    tint: 1,
  },
  crambionella: {
    name: 'Crambionella',
    latin: 'Crambionella orsini',
    bellMin: 0.15,
    bellMax: 0.3,
    kgEach: 0.5,
    swimMin: 0.02,
    swimMax: 0.05,
    leakPerPanel: 0.001,
    blockPerKg: 0.16,
    /** Reported at depth, up to 90 % of bottom-trawl catches off Iran (Daryanabard & Dawson 2008). */
    meanDepth: 5.0,
    depthSD: 2.2,
    tint: 2,
  },
} as const;

export type SpeciesKey = keyof typeof SPECIES;

export const ASSUMPTIONS = {
  /** Fixed integration step for the agent model (simulated seconds). */
  timeStep: 0.1,

  /**
   * The plant. Design flow 2 million m³/h across four units. Published condenser flow for a unit this
   * size is lower (about 100 m³/s), so this is the harder case. Check it against the real plant.
   */
  plant: {
    unitFlowM3s: 138.9,
    units: 4,
  },

  agent: {
    /** Velocity relaxation time — gives inertia so trajectories bend gradually (s). */
    tau: 2.0,
    /** Small-scale stochastic motion amplitude (m/s). */
    turbulence: 0.022,
    /** Vertical swimming toward preferred depth: gain (1/s) and cap (m/s). */
    verticalGain: 0.06,
    verticalMax: 0.04,
    /** Vertical turbulent mixing amplitude (m/s). */
    verticalNoise: 0.02,
    /** Shallowest depth an agent will occupy (m). */
    minDepth: 0.3,
    /** Biomass one simulated agent stands for at the default agent budget (kg). */
    kgPerAgent: 8,
    /** Agent budget `kgPerAgent` refers to. A smaller budget means each agent stands for more. */
    referenceBudget: 3000,
  },

  bloom: {
    /** Fraction of spawns drawn from the main patch; the rest is a broad background. */
    mainPatchFraction: 0.86,
    /** Slow lateral wander of the patch centre (m). */
    patchWander: 40,
    /** Temporal patchiness of the arrival rate (± fraction). */
    rateVariation: 0.3,
  },

  /** Guide nets. All of it to be measured: flume for guidance, a 4–6 week panel test at the site for fouling. */
  net: {
    /** Bar mesh and twine (m). 50 mm bar stops every target bell and passes small debris. Solidity ≈ 2 × twine / bar. */
    meshBar: 0.05,
    twine: 0.004,
    /** Distance from the net at which an agent is on it, and its closest approach (m). */
    guideDistance: 1.4,
    standoff: 0.35,
    /** Share of the along-net flow an animal on the mesh keeps (mesh friction). */
    slide: 0.75,
    /** Chance per second that an animal snags, at the 0.12 m/s through-net speed (scales with its square). */
    snagRate: 0.0007,
    /** Mean time a snagged animal stays put before the flow frees it (s). */
    snagTime: 300,
    /** Chance per panel of a near-bed animal slipping under at a ground-line joint. */
    jointLeak: 0.0015,
    /** Height above the seabed the ground-line joints matter over (m). */
    jointBand: 0.5,
    /** Fouling: added solidity = foulMax × (1 − exp(−weeks / foulWeeks)). Proxy from the Gunderboom and tropical net-cage records. */
    foulMax: 0.6,
    foulWeeks: 5,
    /** Planned panel swap interval (weeks). */
    swapWeeks: 4,
    /** Screen loss coefficient K = lossK × (1 − ε²) / ε², ε = open area. */
    lossK: 1.5,
    /** Loss coefficient of a torn-out panel. */
    tornK: 0.08,
    /** Head difference (m) at which the relief sections let the float line dip, so the net can never act as a dam. */
    reliefHead: 0.12,
    /** Design head for the panels and piles (m): load is reported against this. */
    designHead: 0.15,
    /** How far the float line dips at full relief (m below still water), and how many panels at the upstream end relieve. */
    reliefDip: 2.5,
    reliefPanels: 6,
    /** Time to lower one panel down its pile guides during the season's installation (s). */
    panelDropTime: 5,
    panelDropStagger: 1.1,
  },

  /** Fish-screen practice used as the design basis (NMFS): through-screen speed at most 0.12 m/s, sweep faster than that. */
  screenCriteria: {
    approachMax: 0.12,
  },

  collector: {
    /** Biomass the pocket holds before animals back up along the net (kg per 1000 agents' worth is derived). */
    holdKg: 900,
    /** Speed through the funnel (m/s). */
    funnelSpeed: 0.28,
  },

  transfer: {
    /** Bore of the transfer line (m): at least twice the largest bell. */
    pipeBore: 1.0,
    /** Mean velocity in the transfer line (m/s). */
    pipeVelocity: 1.5,
    /** Nominal water flow (m³/h): the bore's cross-section at `pipeVelocity`. */
    designFlowM3h: Math.round((Math.PI / 4) * 1.0 * 1.0 * 1.5 * 3600),
    /** Largest share of the transfer water by volume taken up by jellyfish, for gentle handling. To be set by bell-damage tests. */
    maxJellyFraction: 0.05,
    /** Screw lift wire-to-water efficiency and the line's minor-loss coefficient. */
    pumpEfficiency: 0.7,
    minorLossK: 5,
    /** Water levels (m above still water): wet well when drawn down, and the head tank. The tank must stand above the pipe's crest over the breakwater so the line never runs below atmospheric. */
    wetWellLevel: -1,
    headTankLevel: 6.5,
    /** Time for the standby pump to reach full capacity after a fault (s). */
    standbyActivationTime: 12,
    /** Line length to the outlet (m). */
    length: 2200,
  },

  release: {
    /** One release line, this far along the shore on the down-drift side (+x, WSW) and this far offshore (site z, m). */
    design: { along: 2000, offshore: 300 },
    jetSpeed: 0.35,
    /** Released jellyfish are tracked while they clear the outlet plume (s), then fade out over fadeTime and leave the simulation. */
    trackTime: 40,
    fadeTime: 10,
  },

  /**
   * Far-field drift of released jellyfish over days (src/simulation/drift.ts), on the recorded
   * current and wind and the real coastline. Assumptions, to be checked with drifters at sea.
   */
  drift: {
    step: 300,
    horizon: 7 * 86400,
    /** Share of the 10 m wind speed that moves a near-surface jellyfish (windage). */
    windage: 0.01,
    /** Horizontal eddy diffusivity (m²/s), with the animals' own random swimming folded in. */
    diffusivity: 1.0,
    /** Within this distance of land (m) the current's onshore component fades out (it runs along the shore). */
    coastDamping: 100,
    /** "Back at the site": within this distance (m) of the channel mouth, the water the intake is drawing in… */
    returnRadius: 300,
    /** …at least this long (s) after release, so the release plume itself does not count. */
    returnGrace: 7200,
  },

  /** The plant's existing screens: what they can clear, and what blinding them does. Ask the plant for its own logs. */
  screens: {
    /** Biomass the travelling screens can wash off (t/h). Uljin's screens hit their limit at about 0.8–2.1 moon jellyfish per m³ (KIOST). */
    washTph: 10,
    /** Backlog on the screens (t) at which the plant reduces load, and at which it trips. */
    derateAt: 2,
    tripAt: 5,
    /** Time a jellyfish stays visible on the screens (s). */
    dwell: 150,
  },

  /** Near-field sonar at the mouth: works at night and in turbid water, where cameras do not. Range (m), sweep period (s). */
  sonar: {
    range: 420,
    period: 8,
    /** Share of the bloom it resolves at night or in turbid water (it needs no light). */
    detectShare: 0.92,
  },

  sequence: {
    /** Pre-roll used when a run starts in steady operation (s). */
    steadyPreRoll: 2200,
    /** Integration step used only during pre-roll (s). Both engines use it, so the comparison stays fair. */
    preRollStep: 1,
    /** Run speed while the panels go in, and after. */
    openingSpeed: 3,
    runSpeed: 20,
    /** Time-lapse while the bloom is still on its way to the net. */
    approachSpeed: 120,
  },

  metrics: {
    /** Screen load in t/h dividing LOW/MEDIUM/HIGH. */
    screenLoadMedium: 3,
    screenLoadHigh: 10,
    /** Rolling window for rates (s). */
    rateWindow: 300,
    /** Minimum resolved sample before a percentage is shown. */
    minSample: 12,
  },
} as const;
