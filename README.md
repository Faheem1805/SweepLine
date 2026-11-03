# SweepLine — Adaptive Live Jellyfish Bypass Visualiser

**Don't stop the bloom. Give it another path.**

SweepLine is an engineering design visualiser and agent-based simulation of a temporary marine
guide curtain that diverts seasonal Blue Blubber jellyfish (*Catostylus mosaicus*) blooms away from
a coastal seawater intake. It acts **after** the plant's existing early warning:

```
DETECT → DEPLOY → SWEEP → TRANSFER → RELEASE
```

A smooth curtain stands upstream of the intake at a shallow angle (15° / 20° / 25° pre-engineered
anchor layouts). The current sweeps jellyfish sideways along it into a large, low-stress recovery
throat. A large-aperture, low-shear transfer module carries them around the protected intake and
releases them alive down-current. **Existing intake screens remain unchanged.**

**SweepLine Active** adds two things to the curtain itself:

- **It pops up.** The curtain is stowed flat on the seabed along its anchor line. After the valve
  checks, an inflation front runs along the float line from the throat end; each inflated section
  rises through the water with its skirt hanging beneath it, breaks the surface and only then starts
  guiding. The whole 20° curtain is up about 1.3 minutes after the command, with no vessel. The
  ascent speed (`deploy.riseSpeed`, ~10–16 s over 5–8 m of water) is an assumption to be confirmed
  by flume tests. (A workboat-laid option is kept for comparison.)
- **It makes its own current.** Low-velocity water jets built into the float line and hem drive a
  conveyor current along the bloom face toward the throat, so the sweep keeps going when the natural
  current is weak, and push water upward at the skirt edge to cancel the downward flow that drags
  jellyfish underneath. No air bubbles and no moving parts in the animals' path.

Jet speeds, flow and power (`jets` in `src/config/assumptions.ts`) are first estimates from plane
wall-jet scaling, to be sized by CFD and flume tests. Compare the passive and active curtain on the
same seed with the *Water jets* switch on the 3D Visualiser, and the *Slack Tide* and *Workboat
Deployment* scenarios.

**SweepLine Twin-Line** answers the tide. At the reference site the along-shore current is 79 %
tide and reverses about 3.8 times a day (Copernicus record, see [Real tidal current](#real-tidal-current)),
so any one-way barrier faces the wrong way about half the time. A second line, the mirror image of
the first, lies stowed on the seabed on the other side of the intake. When the tide turns, it pops
up for the new direction, and the first line guides the traffic already on it to its throat and
settles back onto the seabed. Both throats feed one manifold and one release line. Run the *Tide
Turn* scenario, and switch *Second line* off in Stress test to see a single curtain face the wrong
way.

> Engineering design visualiser. Performance values are simulation estimates and are not
> field-validated. Reference coastal intake geometry is schematic and does not represent
> confidential or exact ENEC facility design.

---

## Run it

Requirements: Node.js 20+ (developed on Node 22) and a WebGL2-capable browser (Chrome / Edge recommended).

```bash
npm install
npm run dev
```

Open http://localhost:5173. A short geographic intro plays, then hands off into Live Simulation at
the start of the run: the bloom is approaching and the curtain pops up from the seabed in front of
it (see [Opening intro](#opening-intro)). Press Esc to skip the intro (clicks do nothing while it
plays); add `?intro=0` to the URL to turn it off.

### Build

```bash
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the production build locally
```

The production build is a static site (everything is bundled locally — no CDN or network needed at
demo time, fonts included).

---

## What's in the application

Three pages:

| Page | Purpose |
| --- | --- |
| **01 Live Simulation** | The 3D twin fills the screen. A compact headline (collapsible to one line) states the situation (e.g. *Dense bloom approaching*), SweepLine's response (*SweepLine deployed · water jets on*) and the result: diverted, fewer intake contacts, under-skirt escape. Camera views: **Release Point** (close-up of the outlet), **Top View**, **Perspective**, **Underwater**. Compact timeline with **Replay** (runs the sequence from bloom approach, including the pop-up deployment), envelope status, **Stress test** (faults, operator SafeOpen, jets on/off, pop-up vs workboat), event log on demand. SafeOpen steps appear only while SafeOpen runs. Scenarios are picked from the top bar. |
| **02 How It Works** | *Don't stop the bloom. Give it another path.* Deploy → Sweep → Recover → Release, the plan view, the current/angle diagram and the three-layer safety story. Engineering detail (side section, specification, operating envelope) sits behind **Technical details**. |
| **03 Evidence** | Same-seed result (fewer intake contacts), diversion efficiency and under-skirt escape, one with/without chart, validation status (built / next) and the run-data export (JSON / CSV). Simulation estimates — not field-validated. |

### Opening intro

When the app opens on Live Simulation, an animated map takes the viewer from the **United Arab
Emirates** to the **Abu Dhabi emirate**, west along the **Al Dhafra** coast to the **Al Dhannah
coast**, and onto the **SweepLine reference site**. There the real coastline straightens into the
schematic revetment, the bloom, current, intake and guide path appear in the simulation's own site
frame, and the map crossfades into the Three.js view. The final map frame and the 3D camera are
solved to match exactly (top-down pose derived from the map scale, heading and the canvas
rectangle), then the camera swings into the normal perspective view.

- **Geography is real; the site is schematic.** Coastlines, islands, roads and place names come
  from Natural Earth and OpenStreetMap. The reference site sits on a natural stretch of beach
  south-west of Jebel Dhanna, kept clear of the Shuweihat and Ruwais facilities, and the geography
  fades into the schematic frame before the zoom reaches facility scale. The intake, curtain and
  transfer route are the `src/config/site.ts` geometry — not ENEC/Barakah or any other real plant.
- **Names are never translated by us.** English and Arabic labels are read from source tags
  (`name:en` / `name:ar`, Natural Earth `NAME_EN` / `NAME_AR`; "Arabian Gulf" is Natural Earth's
  `namealt`). Each label carries its source in the generated data.
- **Simulated current · alongshore.** On this north-facing coast the simulation's +x axis (the
  nominal current) points along the shore toward the WSW (242°) and +z offshore toward the NNW
  (332°), as `site.ts` now records them, so compass readings in the twin match the real coast.
- **One continuous zoom.** The zoom speed (in log scale) rises and falls once — a slow push-in on
  the UAE, the fastest zoom over the coast, then a long ease-out that lands on the site — and the
  site drifts to its final screen position in one direction, so there are no surges or reversals
  between map levels.
- **Run start:** the run opens on the bloom approach and waits, paused, until the map gives way to
  the 3D view, so the early warning and the pop-up deployment play out on screen. With an automatic
  pop-up deployment the bloom starts in view, just upstream of the curtain's upstream anchor: its
  leading edge is set back from every section by the drift (slower near the revetment) until that
  section has surfaced, so the curtain is up before the bloom reaches it
  (`ASSUMPTIONS.bloom.popUpFrontMargin`). Ahead of it, a few stragglers in the inshore lanes reach
  the curtain's starting end while it is still rising and slip past — the leak a pop-up deployment
  still allows (`ASSUMPTIONS.bloom.leadingScatter`); later the odd deep jellyfish passes under the
  skirt. **Replay** starts the same way. The **Perspective** view keeps that start, the curtain, the
  throat and the intake in frame on any landscape screen.
- **Loading:** the 3D view's shaders compile in the background while the map plays
  (`KHR_parallel_shader_compile`). Its first frame still stalls briefly, so it is drawn behind a
  still map — while the opening caption holds, if compilation has finished by then, otherwise on
  the landed site, where the intro holds until it is done. The map itself is hidden until its first
  frame has been laid out.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the reference-site frame is shown
  without zooming and fades straight into the simulation.
- Landscape screens are the target for now.

The map data is generated at build time, never fetched at runtime:

```bash
npm run build:map-intro              # uses downloads cached in .cache/map-intro/
npm run build:map-intro -- --refresh # re-download Natural Earth and OpenStreetMap (Overpass)
```

This writes `src/data/mapIntro.generated.ts` (~135 KB): a local equirectangular projection centred
on the site, clipped and simplified separately for the national, regional, local and destination
levels. Map data © OpenStreetMap contributors (ODbL) · Natural Earth (public domain); the
attribution stays on screen while geographic data is visible.

In `npm run dev`, `await __mapIntroAt(2500)` renders exactly that frame (in ms) and stops,
`await __mapIntroPlay(0)` replays the intro including the hand-off, and `__mapIntroSkip()` skips.
`await __sl.page('name')` captures the intro composited over the 3D view.

### Suggested 2-minute demo

1. **Live Simulation** — the run opens on the bloom approach: the curtain pops up in front of it, then
   the bloom bends along the curtain into the throat. **Release Point** shows the animals leaving the
   outlet alive; **Replay** runs the sequence again.
2. **Stress test → Transfer failure**, then *Fail the standby path too*: SafeOpen retracts the
   upstream end first and the steps appear on screen. Re-arm when it completes.
3. **Scenario → Tide Turn** — the recorded tide slackens and reverses (time-lapse through slack
   water): Line B pops up on the other side of the intake and Line A settles back. Then *Second
   line* off in Stress test: one curtain faces the wrong way and SafeOpen hands the intake back to
   its screens.
4. **Scenario → Slack Tide** — the current dies away; switch *Water jets* off in Stress test to see a
   passive curtain stall. **Scenario → Workboat Deployment** (or *Deployment → Workboat* in Stress
   test, which replays the run) shows the late-deployment leak.
5. **How It Works**, then **Evidence** for the same-seed numbers and what still needs testing.

**Stress test** — each option injects a condition and the system responds on its own:

| Option | Response |
| --- | --- |
| Transfer failure | The standby transfer path takes over within seconds (*Fail the standby path too* → SafeOpen) |
| Extreme current 0.78 m/s | Outside the 0.60 m/s limit: SafeOpen retracts the curtain, upstream end first |
| Deep bloom (mean 3.2 m) | The adaptive skirt lowers to cover the bloom's P90 depth, within the seabed clearance |
| High density | A dense surge reaches the curtain; if the recovery throat overfills, SafeOpen |
| Curtain overload | Fouling builds up on the curtain until its load limit triggers SafeOpen |
| High waves Hs 1.9 m | The sea builds past the 1.5 m limit: SafeOpen |

Injected conditions belong to the run: **Replay** starts clean.

---

## 3D assets (Hyper3D GLBs)

The scene runs entirely on procedural geometry, and each element can be swapped for a GLB/GLTF
model without touching simulation logic. Drop files into **`public/models/`**:

| File | Replaces |
| --- | --- |
| `blue-blubber.glb` | Jellyfish (one model, instanced for the whole bloom; used for the near LOD) |
| `coastal-intake.glb` | Intake structure and screens |
| `breakwater.glb` | Rock revetment / breakwater |
| `guide-curtain.glb` | One float element, instanced along the curtain float line |
| `recovery-throat.glb` | Recovery throat bellmouth |
| `transfer-module.glb` | Transfer module housing |

Missing files fall back to the procedural geometry silently — no broken models. The dev server
checks each file with a HEAD request, so a dropped-in model shows up on reload; a production build
only requests the models that were in `public/models/` when it was built, so a deployment never
404s on the absent ones. Draco- and Meshopt-compressed GLBs are supported (decoders are bundled
from three.js).

### Adjusting model transforms

Edit **`src/config/assets.ts`**: per asset `url`, `enabled`, `scale` (uniform or `[x, y, z]`),
`rotation` (degrees, XYZ) and `offset` (world metres, y-up, still water at y = 0). The jellyfish
model is merged into one geometry, normalised to a 1.0 m bell diameter (bell up = +y) and given
animation attributes automatically, so the pulse/arm-sway shader works on any model.

---

## Rendering

The 3D view renders in linear HDR into a 4× MSAA buffer and finishes in post-processing
(`src/three/post/PostPipeline.ts`, [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)):

```
scene → ambient occlusion → sanitize → above water: tilt-shift · bloom · grade · LUT · vignette
                                     → underwater:  light shafts + wobble → depth of field · bloom · grade · LUT · vignette
                                     → SMAA → canvas
```

- **Sanitize.** A NaN or infinite pixel from any material would be smeared over the frame by the
  blur and bloom passes as a black flash; `SanitizeEffect` drops it and caps the HDR range first.
  Shaders also keep `pow()` bases non-negative (a negative base is NaN on Direct3D).

- **Grade.** `GradeEffect` is the same ACES filmic curve + vibrance lift the scene always used
  (`environment/grade.ts`); a small generated LUT (`post/lookLut.ts`) adds a gentle S-curve with
  cool shadows and warm highlights. Swap in a colourist's `.cube` via postprocessing's `LUTCubeLoader`.
- **Ambient occlusion.** [N8AO](https://github.com/N8python/n8ao) at half resolution. A depth-only
  copy of the water surface (`Water.depthCap`) is drawn last, so contact shadows form at the water
  line and nothing under the surface is darkened through it.
- **Bloom** only picks up HDR highlights (sun glitter, beacons, jets); **tilt-shift** softens the
  far coast in high oblique views only; **depth of field** is underwater only.
- **Water.** Just before the surface draws, everything already rendered (seabed, skirt, bloom) is
  copied with its depth (`Water.captureBackdrop`). The surface bends each view ray at the wavy
  surface and samples that copy, so you see the seabed, the stowed curtain and the bloom through
  moving water. Broken white water forms wherever the backdrop meets the surface (revetment,
  floats, pontoon, piles), and the sun's glare breaks into glitter.
- **Caustics** (`CAUSTIC_GLSL` in `environment/shaderChunks.ts`) are computed from the same waves
  and ripple maps the surface is drawn with: the focusing of sunlight is the inverse determinant of
  the refracted-ray map, so the pattern moves with the visible surface and strengthens with sea
  state. They modulate direct sunlight only, so shadows — including the curtain's own shadow on the
  seabed — carve them out. The skirt and floats cast shadows; the shadow map refreshes while the
  curtain moves and about once a second otherwise (in Compare it is captured with the baseline
  world so that half never shows an installation it does not have).
- **Underwater light shafts** (`post/UnderwaterEffect.ts`) are ray-marched at half resolution
  through the water column: wave-focused sunlight, absorbed on the way down and back, cut by the
  shadow map behind the curtain and pontoon, with forward scattering toward the sun.
- **Sky** (`environment/atmosphere.ts`, `environment/Sky.ts`): a physically based clear-sky model
  (Rayleigh + dusty Mie scattering for hazy Gulf air, thin cirrus) baked once into the cube map
  that serves the visible sky, the water reflections and image-based lighting. Its horizon colour
  becomes the haze colour, so distant water fades into the actual sky. Haze thins with height, so
  overhead views stay clear.
- **Jellyfish** (`systems/JellyfishSystem.ts`, `assets/procedural/jellyfishGeometry.ts`): the
  *Catostylus mosaicus* colour forms (mostly blue, some cream, a few brown), granular "mosaic" bell
  with radial canals and a darker rim band, short thick frilly oral arms, light glowing through thin
  tissue, and caustics playing over the bells. From the air their legibility glow keeps each
  animal's colour.
- **Pixel budget.** Above ~2.4 megapixels per frame (large high-DPI windows) the chain renders at
  a reduced internal resolution and the final pass upsamples, keeping the GPU cost bounded.

---

## Where things live

```
src/
  config/
    site.ts               Reference site geometry (shore, intake mouth, curtain end, throat, pipe route, release), bathymetry
    assumptions.ts        Every simulation & design assumption (agent motion, curtain interaction, throat, transfer, SafeOpen timing, loads)
    operatingEnvelope.ts  Assumed operating-envelope thresholds (hard limits vs advisory)
    assets.ts             Replaceable GLB paths and transforms
  simulation/             Pure TypeScript — no three.js
    SimulationEngine.ts   Agent-based engine (one per world)
    Agent.ts              Typed-array agent pool + states
    geometry.ts           Curtain layouts (15/20/25°), funnel curve, throat bellmouth, spatial grid
    flowField.ts          Current field (shore slow-down, intake draw, throat draws, release jets)
    tide.ts               Recorded tidal current at the site (from src/data/tide.generated.ts)
    curtain.ts            Curtain deploy (pop-up rise per section) / reef / unreef / stow state and per-segment skirt depth
    transfer.ts           Primary / standby / passive transfer paths
    waves.ts              Shared sea-state model (also generates the water shader GLSL)
    safety.ts             Operating-envelope evaluation + SafeOpen sequencing
    metrics.ts            Metric definitions (all derived from simulation state)
    scenarios.ts          Scenario presets and scripts
    SimController.ts      Runtime: both engines in lock-step, timeline, events, failures, history, export
    seededRandom.ts       Deterministic RNG and stateless per-agent noise
  three/
    SceneManager.ts       Renderer, scene graph, single + split (per-half viewport) rendering, picking
    post/                 Post-processing chain (PostPipeline), scene grade, look LUT, underwater shafts
    environment/          Sky + atmosphere model, ocean shader, seabed, coast & intake, underwater particulate,
                          shared light-transport and caustics shader chunks
    systems/              JellyfishSystem, CurrentField, CurtainSystem, TransferSystem, ReleaseSystem, LabelSystem, Annotations
    cameras/              Camera presets and smooth transitions
    assets/               GLB loader + procedural fallbacks (jellyfish, rocks, workboat)
  components/, pages/     React UI (Tailwind CSS v4, lucide-react, Recharts)
  components/intro/       Opening intro: MapIntro (scaffolding), IntroPlayer (rAF loop, hold, skip, hand-off),
                          introTimeline (camera curve and timed values), mapCamera, mapLabels, introStory, handoff
  data/                   mapIntro.generated.ts (from scripts/build-map-intro-data.ts) and its types
scripts/
  build-map-intro-data.ts Downloads, projects, clips and simplifies the intro's map data (map-intro/ helpers)
```

The simulation runs outside React: one `requestAnimationFrame` loop advances the engines with a
fixed time step and renders the scene; React receives throttled snapshots (~8 Hz) only.

---

## How Baseline vs SweepLine works

Two `SimulationEngine` instances run **in lock-step** at all times — `baseline` (no SweepLine, no
transfer) and `sweepline` — with the **same seed and parameters**:

- Spawning consumes a fixed number of draws per jellyfish from a seeded generator, so both worlds
  receive an identical bloom: same spawn times, positions, depths, sizes and swim parameters.
- Per-agent stochastic motion comes from stateless hashes of *(agent id, time)*, so an individual
  follows exactly the same path in both worlds until SweepLine changes it.
- Environmental stress tests (current, waves, bloom depth/density) apply to both worlds; transfer
  and curtain faults apply only to SweepLine.

The Baseline / SweepLine toggle chooses which world is displayed; **Compare** renders both side by
side with one renderer (scissor viewports). Changing the seed or the agent budget restarts both.

**Metric definitions** (`src/simulation/metrics.ts`) — percentages use resolved outcomes only:

- *Intake contact* = agents reaching the screens ÷ (contacts + diverted + passed the intake line)
- *Diversion efficiency* = reached the recovery throat ÷ resolved curtain encounters
- *Under-skirt escape* = passed beneath the skirt ÷ resolved curtain encounters
- *Transfer utilisation* = throughput ÷ available transfer capacity
- *Screen load* = contact rate per minute (5-min window) per 1000 agents → LOW / MEDIUM / HIGH

The agent model is a kinematic engineering simulation — **not CFD and not validated field
performance**. Each assumption is named in `src/config/assumptions.ts` and mapped to the test that
will calibrate it on the Validation page.

Agents leave the view only after their outcome has been counted: released animals are followed for
~40 s after leaving the outlet and then fade, and animals that passed the site offshore fade out
downstream of the throat, so the water between the throat and the release point shows only real
traffic.

**Reference demo rule.** The reference bloom drifts along the coast in the band the intake draws
from, and the curtain's upstream end is tied into the revetment toe. With the reference parameters
(3.5 m skirt, transfer sized for ~55–75 % utilisation) no more than 5 jellyfish are ever on the
protected shore side of the curtain at once; `npm run test:demo` checks this over 60 simulated
minutes from the bloom approach (how the app opens, and Replay) and after the steady pre-roll, and
fails if either run exceeds it or is not nominal.

---

## Real tidal current

`npm run build:tide` downloads the Copernicus Marine global surface current (SMOC: total current,
tides included) for 2022–2025 through the Open-Meteo Marine API, at the model cell nearest the
reference site (12 km offshore), and projects it onto the site's along-shore axis. A harmonic fit of
11 tidal constituents explains 79 % of the along-shore variance (88 % with the 25 h low-passed
residual); M2 alone is 0.09 m/s. The bloom season (Oct–Nov 2025) is written to
`src/data/tide.generated.ts` as the fitted tide plus that slow residual, which removes the 0.03 m/s
quantisation of the published values. Spring flows reach about ±0.13–0.2 m/s and the current
reverses about 3.8 times a day. The small cross-shore component is left out. Nothing is fetched at
runtime.

A run with `tide: true` (the *Tide Turn* scenario) drives the current speed and direction from that
record (`src/simulation/tide.ts`), starting `tideStart` hours into it. The *Recorded tide* card under
the headline shows the current, its trace six hours either side, the time to the next turn and
which line is on duty; it appears only on tide runs.

**Twin-Line handover** (`twin` in `src/config/assumptions.ts`, assumptions): once the current has
run against the duty line at more than 0.015 m/s for 30 s, duty passes to the other line, which
deploys (pop-up, or a workboat if selected). The previous line keeps its jets running and its throat
open until at most one jellyfish is left guided on it and its throat is empty (not before 60 s, at
the latest after 7 min), then vents back onto the seabed. Both throats feed one manifold on the
intake centreline and one release line down-drift (see [Where released jellyfish go](#where-released-jellyfish-go));
`ASSUMPTIONS.release.design.side = 'down-tide'` switches to the alternative, a valve sending each
animal to the outlet down-current at that moment. Line B's hoses lie stowed until it is in use. The operating envelope judges the
current against the line laid for its direction; with *Second line* off it judges the single line,
so a turned tide is an envelope violation and SafeOpen follows.

`npm run test:tide` replays the recorded turn (8 Oct 2025, 02:43 UTC) with and without the second
line and counts intake contacts against the same-seed baseline: over the three hours after the
turn the Twin-Line keeps about 99 % of them off the intake, while a single line keeps about 1 %.

## Where released jellyfish go

The twin follows a released animal for under a minute; whether it comes back is decided over days.
`npm run study:drift` follows released animals for 7 days (`src/simulation/drift.ts`): they drift
with both components of the recorded current (the build also fits the cross-shore component), 1 % of
the recorded ERA5 10 m wind (windage) and a 1 m²/s random walk, against the real coastline decoded
from the map intro's OpenStreetMap data. Near land the current's onshore part fades out, so it runs
along the shore. An animal counts as back at the plant once it re-enters the intake's approach band
(±300 m along the shore, within 150 m of the origin offshore) at least 2 h after release.

One release an hour across Oct–Nov 2025, 20 animals each:

| Release | Back at the plant in 7 days | Across windage 0–2 %, spreading 0.3–3 m²/s |
| --- | --- | --- |
| Near the intake (~110 m along, 70 m out) | 16 % | 9–26 % |
| Straight out, 2 km offshore | 14 % | 13–18 % |
| Two lines, valve to the down-tide side, 2 km along | 2 % | — |
| **One line, 2 km down-drift (WSW) along the shore (design)** | **1 %** | **1–3 %** |

Sending animals offshore does not help: the season's mean drift is onshore (1.2 cm/s) and so is the
wind. Along the shore they stay away. One release line 2 km down-drift (toward the WSW, with the
season's residual drift and wind) brings back as few as two lines with a valve choosing the
down-tide side, with half the pipe, and still only 4 % if the drift ran the other way. So the design
is one release line shared by both guide lines, 2 km along the shore, 300 m out
(`ASSUMPTIONS.release.design`). The twin still draws the outlet close to the site. Almost everything
at the surface reaches the shore within a week in this season: 99 % of the released animals, and
90 % of a natural bloom nearby with no
SweepLine. The Evidence page shows the comparison with sample tracks. Kinematic drift model with the
current taken as uniform over the area; to be checked with drifters at sea.

## Build and run it

How It Works has a *Build and run it* panel (`src/simulation/feasibility.ts`, `src/config/costs.ts`):

- **Throughput.** A dense bloom on a spring tide (0.1–0.3 animals per m³, 0.33–3 kg each, the
  season's 95th-percentile current 0.13 m/s through the 44 m × 3.5 m band the curtain spans) brings
  about 2–64 t/h across a line. The transfer line (1.0 m bore, at least twice the largest bell, at
  1.5 m/s, ~4,200 m³/h) carries about 217 t/h at 5 % jellyfish by volume. A boat clears about 1 t/h.
- **Power while running** ≈ 87 kW: transfer pump 66 kW (3.4 m head over the 2.2 km release line,
  Darcy–Weisbach) and jets 21 kW. Nothing runs while stowed.
- **Hardware cost, both lines: US$2–12M (AED 7–44M)**, from public prices only: inflatable offshore
  boom (UK coastguard) up to an installed fabric intake barrier (US EPA), moorings, fish-friendly
  pumps (New Zealand and Canadian tenders, US Fish and Wildlife), and PE100 pipe up to an installed
  power-plant fish-return line (US EPA). The shared release line is the largest item. Not included:
  inflation system and manifold, controls and sensors, engineering, permits and contingency.
- **Payback after 1–9 avoided unit-days**, at US$1.3–3.7M per day of a 1.4 GW unit (Torness up to an
  analyst's Barakah generation cost); Hanul 2021 cost 14–26 unit-days. Running costs are about
  US$20–45k a season, against about US$0.6M a year for EDF's boats and crews at Gravelines.

Every price, its year and its source URL are in `src/config/costs.ts`.

## Alive on the way

No published study measures scyphozoan jellyfish through a pump or a long pipe, so the survival
budget on How It Works (`src/config/survival.ts`) uses fish and invertebrate analogues, as
published: guidance 90–100 % (fish on rotating return screens, EPRI 2010), one Archimedes screw lift
94–100 % (McNabb et al. 2003; Borthwick & Liston 2003), the 2.2 km gravity line 70–100 % (power-plant
return lines, EPRI 2010) and the diffuser 99–100 % (Johnson et al. 2003): **59–100 % end to end**.
The transfer follows the US NMFS fish-bypass rules: lift the animals once into a head tank, then
gravity down a smooth line with bends of at least five bores, never below atmospheric pressure, and
no air at all (air harms medusae, Raskoff et al. 2003). The decisive test: live 30–45 cm Blue
Blubber through the screw and a 25-minute recirculating pipe loop at 1.5 m/s against paired
controls, scored over 96 h.

## Booth kiosk

`?kiosk=1` runs a self-running loop for a stand (`src/app/kiosk.ts`): the reference run (pop-up,
sweep, release point), the recorded tide turn (Line B taking over), then the Evidence page, with one
caption at a time. Captions follow the simulation's state, so they match the scene. Any touch, key
or scroll hands control back. In `npm run dev`, `__sl.startKiosk()` and `__sl.stopKiosk()` drive it.

## Wildlife and side effects

How It Works has a *Wildlife and side effects* card, built from data and the twin's own geometry:
`npm run build:wildlife` counts open records near the site (OBIS: the Gulf Green Turtle Project's
2016–2019 satellite fixes, 54 of them within 10 km and the closest 300 m away; GBIF: dugongs, none
within 90 km in the open data, though Abu Dhabi holds the world's second-largest population). The
solid skirt hangs from the surface and leaves 1.5–4.2 m of open water above the seabed at the
reference 3.5 m skirt (never under the 1 m clearance limit), so air-breathers dive under it. The
recovery throat has an excluder grid (`ASSUMPTIONS.throat.excluderBarSpacing`, 55 cm between smooth
bars: the 30–45 cm bells pass, adult turtles and dugongs do not) and is open to the air. The card
also covers jets and noise, the stowed curtain's seabed footprint, fouling and polyps, and where the
released jellyfish go.

## Creating a new scenario

Add an entry to `SCENARIOS` in **`src/simulation/scenarios.ts`**:

```ts
{
  id: 'night-surge',
  name: 'Night Surge',
  tagline: 'Dense patch arrives during operation',
  description: 'What the scenario shows…',
  demonstrates: ['Throat congestion'],
  params: { bloomDensity: 0.9, currentSpeed: 0.3, skirtDepth: 3.0, anchorAngle: 20 },
  start: 'steady',             // 'sequence' = from bloom approach; 'steady' = pre-rolled operation
  script: [                     // optional timed actions (simulated seconds after start)
    { at: 40, action: { kind: 'fail', failure: 'highDensity' } },
    { at: 120, action: { kind: 'params', params: { waveHeight: 1.3 }, message: 'Sea state increasing' } },
  ],
  tone: 'stress',               // 'nominal' | 'stress' | 'failure'
}
```

It appears automatically on the Scenarios page and in the top-bar scenario menu. Outcomes are always
computed by the agent model, never scripted.

---

## Standby transfer line

- **In the app:** 3D Visualiser → right rail → *Transfer System* card → **Standby transfer path armed**.
  Disarm it, then use *Stress Test* → *Transfer failure*: with no standby, SafeOpen starts immediately.
- **Default:** `standbyEnabled` in `DEFAULT_PARAMS` (`src/simulation/types.ts`); scenarios can
  override it in their `params`.
- **Behaviour:** `standbyActivationTime` and `passiveDrainFraction` (the residual open-flow line used
  while SafeOpen clears existing traffic; set it to `0` to model no passive path) are in
  `src/config/assumptions.ts`. The Cost Analysis page has an independent toggle to include or
  exclude the optional standby module from CAPEX.

## Operating envelope

Thresholds live in **`src/config/operatingEnvelope.ts`**. *Hard* limits block deployment and, when
exceeded during operation for `safeOpen.violationDwell` seconds, trigger SafeOpen automatically.
*Advisory* limits (bloom deeper than the deepest skirt) report a recommended action — SweepLine
would be ineffective, not unsafe. The anchor layout is fixed while deployed: selecting another
layout restarts the run and redeploys on the new pre-engineered anchors.

---

## Developer tools

```bash
npm run calibrate -- minutes=40 skirtDepth=2.5   # headless Baseline vs SweepLine metrics for any parameters
npm run test:scenario -- safeopen 9             # headless event log for a scenario (id, minutes)
npm run test:lifecycle                           # SafeOpen → stow → redeploy → anchor change
npm run test:demo                                # reference run: ≤ 5 jellyfish on the shore side at any time
npm run test:tide                                # recorded tide turn: Twin-Line vs single line vs baseline
npm run build:map-intro                          # regenerate the opening intro's map data
npm run build:tide                               # regenerate the tidal-current and wind data (Copernicus, ERA5 via Open-Meteo)
npm run study:drift                              # released-animal drift study; rewrites src/data/drift.generated.ts
npm run build:wildlife                           # turtle and dugong records near the site (OBIS, GBIF)
```

In `npm run dev`, `window.__sl` exposes the controller and scene; `await __sl.shot('name')` and
`await __sl.page('name')` save PNG captures of the 3D view / whole UI to `.snapshots/` (dev server
only — handy for slides).

## Performance notes

Instanced jellyfish (two LODs, ~1–2k agents per world), shared materials, typed-array agent
storage, a mostly static shadow map, and React updates at ~8 Hz keep the app at 60 FPS on a typical
modern laptop. Measured CPU+GPU frame cost on the development machine: ~6 ms single view,
~9 ms compare + Flow View.

With the rendering upgrades, GPU time per frame on a laptop RTX 3050 at a 1414 × 774 view is
about 5.4 ms above water (scene 3.3 ms, ambient occlusion 0.7 ms, grade/bloom/tilt-shift 1.0 ms,
SMAA 0.3 ms) and about 6.7 ms underwater (light shafts 1.9 ms, depth of field + grade 1.7 ms).
Larger views are held to the pixel budget described under [Rendering](#rendering).

### Third-party rendering libraries

| Package | Used for | Licence |
| --- | --- | --- |
| [`postprocessing`](https://github.com/pmndrs/postprocessing) | Effect composer, bloom, tilt-shift, depth of field, LUT, vignette, SMAA | Zlib |
| [`n8ao`](https://github.com/N8python/n8ao) | Ambient occlusion | CC0 |
