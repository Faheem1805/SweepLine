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

## Studies

```bash
npm run study
```

Runs every case with and without SweepLine (`scripts/study-all.sh`, a few minutes) and writes `src/data/study.generated.ts`, which the app reads. `npm run study:drift` runs the release drift study on the recorded current and wind, and `npm run study:hindcast` the wave and current record.

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
