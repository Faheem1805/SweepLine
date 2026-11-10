# SweepLine

**Don't stop the bloom. Give it another path.**

A digital twin of a way to keep jellyfish blooms off a coastal plant's cooling intake. Built for the ENEC challenge, Demo Days 2026, stand 54.

Everything a plant pumps comes down one channel, so inside it the water always runs one way, whatever the tide is doing outside. SweepLine uses that flow. Two nets stand across the channel at 20°, ahead of every intake. Water passes through the mesh. Jellyfish cannot, so the plant's own flow sweeps them along the net to a collector. A slow screw lift sends them over the breakwater and 2 km down the coast. Nothing in the plant changes.

```
Warning → Net → Pocket → Screw lift → Release
```

## The screw lift

Each net ends in a funnel against the east wall, and the funnel ends in a hopper. Two inclined screws stand in each hopper, a duty and a standby, and rise along the wall to a deck between the nets. They are enclosed screws: the flights are welded inside a 2 m tube that turns, so there is no gap for a bell to be caught in. Every part-turn closes off a pocket of water at the bottom and carries it up the 30° incline; a jellyfish rides up in its pocket, in water all the way, spills into a launder and runs to the head tank, and the line takes it 2.2 km to the release. A pocket holds about 0.75 m³ of water and at most 38 kg of jellyfish (5 % by volume), so at 31.5 rpm one screw lifts the line's design flow.

A lift turns only while it has work. An imaging sonar looks down each funnel into the hopper. A lift starts when its sensor sees about a pocket's worth, or anything at all that has waited 10 minutes, and stops once the funnel is clear and its last pocket has reached the top. The line only moves while a screw feeds it, so the last lift to stop runs on until the line is flushed and no animal is left in a still pipe. In the reference run lift A sits idle, drawing nothing, until the bloom reaches its funnel; lift B, which sees only strays past net A, starts a few times an hour. The duty screws share one power feed and the standby screws the other: if the duty feed trips, the animals already in the duty screws stay there in their pockets of water until it is back.

The **Lift** camera shows net A's lift cut away, with each section labelled and a card with what is in each one. **Follow one jellyfish** rides along with one animal from the hopper to the head tank. The view drops to real time while lift A turns.

There is no bar rack: a 20 cm rack would stop the 30–45 cm bells it is there to pass. A camera at each hopper mouth lets the operator stop a lift for a turtle.

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
