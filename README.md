# SweepLine

**Don't stop the bloom. Give it another path.**

A digital twin of a way to keep jellyfish blooms off a coastal plant's cooling intake. Built for the ENEC challenge, Demo Days 2026, stand 54.

Everything a plant pumps comes down one channel, so inside it the water always runs one way, whatever the tide is doing outside. SweepLine uses that flow. Two nets stand across the channel at 20°, ahead of every intake. Water passes through the mesh. Jellyfish cannot, so the plant's own flow sweeps them along the net to a collector. A slow screw lift sends them over the breakwater and 2 km down the coast. Nothing in the plant changes.

```
Warning → Net → Pocket → Screw lift → Release
```

## What is real here

| Built | Simulated | Missing |
| --- | --- | --- |
| This twin | How jellyfish behave at a net | Any test on live jellyfish |
| Agent model of the same bloom with and without SweepLine | Fouling rate, from other seas | The real channel: width, depth, flow |
| Hydraulic model of every net panel | What the screens can wash off | Survival through the lift and line |
| Recorded current and wave data | Bloom size and depth | A contractor's price |

The reference site is schematic and does not represent any real plant. Every result is a model estimate, not a field result. The numbers hardly move when the assumptions do, which is a warning as much as a comfort: the model has no way for an animal to pass except the leaks it was given. A flume test comes first for that reason.

## Run it

```bash
npm ci
```

```bash
npm run dev
```

Open <http://localhost:5173>. `?intro=0` skips the map, `?kiosk=1` runs the unattended booth loop.

For a presentation, run the production build: it is faster and smoother than the dev server.

```bash
npm run build
```

```bash
npx vite preview
```

Open <http://localhost:4173>. The twin steps the model every 0.4 simulated seconds, as the studies do, and draws the animals between steps. The simulation never takes more than a few milliseconds of a frame: on a slow machine it runs a little below the set speed rather than dropping frames. The 3D view lowers its own resolution if the GPU falls behind, and raises it again when there is headroom.

```bash
npm test
```

```bash
npm run build
```

## The three pages

- **Live Simulation.** The twin. The problem cards on the right are the places other approaches get caught out. Each runs live: what the trap is, what we did, and the numbers as they happen. The bottom strip follows the bloom from the sea to the release point.
- **How It Works.** A to-scale plan, a sizing tool that works for any channel, answers to the questions a plant engineer asks, the failure table, a comparison with the usual answers, and costs.
- **Evidence.** The result, what it rests on, where released jellyfish go, survival on the way, what happens if the assumptions are wrong, and the test plan.

## The design basis

The reference site is a straight channel between two breakwaters that bends into a side basin along the plant wall, with one intake per unit. The model counts an animal as at the screens where the channel opens into the basin, because nothing further can stop it, and it then rides on to its unit's intake. The layout is schematic, and left-right mirrored from any site it resembles.

Sized on fish-screen practice (NMFS): at most 0.12 m/s through the screen, and sweep faster than that.

- 2 million m³/h through a 140 × 12 m channel runs at 0.33 m/s.
- A 20° net splits that into 0.113 m/s through the mesh and 0.31 m/s along it.
- For any channel, the shortest net is flow ÷ (depth × 0.12 m/s). Width only sets the angle.
- Each net is 409 m long, 21 panels on piles, surface to seabed, 50 mm bar mesh, with a second net 60 m behind.
- At 0.12 m of head the float line dips and water spills over, so the net can never act as a dam.
- The line is 1 m bore, 2.2 km, about 24 minutes at 1.5 m/s, 217 t/h at 5 % jellyfish by volume, about 130 kW while collecting.

`src/simulation/sizing.ts` holds these sums on their own so anyone can check them. Every assumption is in `src/config/assumptions.ts`, with its source or the test that settles it.

## The funnel and the experimental sweep assist

Each net ends in a funnel in the wedge between the net and the east wall: a mouth from the net to the wall 16 m from the net's end, a perforated wing narrowing to a 1.6 m throat 7 m from the end, and a solid pocket ending at the wet-well entry where the screw lift draws. `FUNNELS` in `src/simulation/geometry.ts` is the one set of numbers the engine moves animals through and the 3D scene draws.

- An animal counts as **collected** only when it passes the throat into the pocket. Between the mouth and the throat it is **in the funnel**, and not counted yet. **In the line** means in transfer, and **released** means out at the outlet.
- The pocket holds 0.9 t and the funnel 2.9 t. A full pocket closes the throat. A full funnel closes the mouth, so the bloom stacks up along the net.
- The lift takes an animal only once it reaches the wet-well entry.
- The 20 cm bar rack across the mouth is smaller than a 30–45 cm Blue Blubber bell, so as drawn it would stop them. The model lets every animal through the rack. Rack size and turtle bycatch are not validated.
- The model treats the channel walls as vertical. The collector at net A's end is drawn with a vertical sheet-pile face, because a rock slope would cut into the funnel.

**Sweep assist (experimental, off by default).** A small variable-speed seawater pump feeds a spray bar on the bloom face just ahead of each mouth. It adds up to 0.1 m/s along the mesh, falling off away from the net and past the last outlet. It is sized at 216 m³/h at 5 m head, about 5 kW at full speed. The same velocity field moves the animals and draws the close-up's arrows. It does not speed up the channel, and it does not move or free animals by itself.

- **Modes.** Off, Auto, or a manual test run.
- **When Auto starts.** Animals must be at the funnel and either the sweep or crowding must stay bad for 90 s. The sweep has to be below 0.06 m/s, read on the net ahead of the bar where the jets can't reach. Crowding means more than 1.2 t at the mouth.
- **When Auto stops.** The condition has to be clear for 180 s, and the pump runs at least 300 s once started.
- **Interlocks.** In either active mode, the pump is held off if the pocket is full, no lift is running, head is at 90 mm or more, or relief is open.

`npm run study:assist` replays the Funnel assist scenario on five seeds with the assist Off and on Auto, through the app's own controller, and writes `src/data/assist.generated.ts`. In the model, Auto shortens mouth-to-throat time while the sweep is weak, from about 195 s to 155 s. It does not change what is collected or what reaches the screens.

## Studies

```bash
npm run study
```

Runs every case with and without SweepLine (`scripts/study-all.sh`, a few minutes) and writes `src/data/study.generated.ts`, which the app reads. `npm run study:assist` runs the sweep-assist comparison. `npm run study:drift` runs the release drift study on the recorded current and wind, and `npm run study:hindcast` the wave and current record.

## The poster

```bash
node poster/build.mjs
```

Builds `poster/54.ENEC.SweepLine.pdf`, 1200 × 1600 mm, from `poster/content.json`, `poster/data` and the renders in `poster/images`. It is a white page because it is printed.

## How the code is laid out

```
src/config        site geometry, assumptions, problem cards, costs, failure table
src/simulation    agent engine, net hydraulics, flow field, transfer, screens, drift, sizing
src/three         the 3D scene: water, breakwaters, nets, collector, jellyfish, cameras, post
src/components    panels, charts, the map intro
src/pages         the three pages
scripts           studies, tests, data builders
poster            the poster
```

The simulation does not depend on the 3D scene, so every study runs headless on the same code the twin shows.
