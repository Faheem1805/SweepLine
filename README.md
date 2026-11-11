# SweepLine

**Don't stop the bloom. Give it another path.**

A digital twin of a way to keep jellyfish blooms off a coastal plant's cooling intake. Built for the ENEC challenge, Demo Days 2026, stand 54.

Everything a plant pumps comes down one channel, so inside it the water always runs one way, whatever the tide is doing outside. SweepLine uses that flow. Two nets stand across the channel at 20°, ahead of every intake. Water passes through the mesh. Jellyfish cannot, so the plant's own flow sweeps them along the nets to one collector. A bucket elevator lifts them in water and sends them over the breakwater and 2 km down the coast. Nothing in the plant changes.

```
Warning → Nets → Funnel → Bucket elevator → Release
```

## The site

The layout follows the reference plant's satellite image, with no names: a long straight breakwater on the west side, and an east breakwater that bends round a side basin along the plant wall, where the four intakes are. The overview looks out to sea from behind the plant, as the image does, so west is on the left and the bloom comes in from the left. The recorded current's slow net drift runs the other way, toward the west, over days, which is why the release outlet is 2 km to the west.

## Two nets, one lift

Net A is coarse (80 mm bar) and net B, 60 m behind it, is fine (30 mm). Net A stops the adult bells and carries less load; the small young bells that work through it are what net B is for. In the model a bell narrower than 1.6 bars works through a mesh, and a tenth of the bloom (by mass) is young bells of 6 to 14 cm, so about 9 % of the bloom goes through A and is caught by B. Both figures are for the flume to set.

Net A's last panel, at the west wall, is left open. What A has guided along its face goes through the gap and the channel's own flow carries it down the wall into net B's funnel, with what B caught itself. So one lift serves both nets, with no pump between them: water cannot carry animals back up the channel, so the lift stands at net B's end, not A's.

## The bucket elevator

The hopper sits in the corner of net B and the west breakwater, against a short sheet-pile cell. Net B runs straight into its mouth: the mouth is inside net B's funnel, facing the flow, and the hopper's other sides are screens of net B's mesh, so the water carries on through and the current carries the bloom in. An inclined chain of pivoted buckets, like an escalator, dips through the hopper: each bucket scoops up water with the jellyfish in it, hangs level all the way up over the breakwater's crest, and is tipped by a cam at the head into a chute to the head tank. Nothing passes through a pump, and the animals are in water the whole way. A bucket brings up 0.35 m³ of water and at most 40 kg of jellyfish; at 1.2 m/s, 1.5 buckets a second, that is about the line's 217 t/h. A clean-water feed pump, drawing from behind both nets, tops the head tank up to the line's design flow. Twin drives on the head shaft, duty and standby: if the duty drive stops, the buckets pause and the standby takes over.

The elevator runs only while it has work. An imaging sonar looks down the funnel into the hopper. It starts on about a bucket's worth, or on anything that has waited 10 minutes, and stops once the funnel is clear, the last bucket has tipped and the line has flushed (the line moves only while the feed pump runs, so no animal is left in a still pipe).

The **Lift** camera shows the elevator side-on with each section labelled, and a card with what is in each one. **Follow one jellyfish** rides along with one animal from the hopper, up in its bucket, down the chute. The view drops to real time while the elevator runs.

## Stuck bells, fish and turtles

The piles are box sections with their upstream face flush with the mesh, and each panel runs in guides on their sides, so the face the bloom slides along has no bump. A bell can still be held against the mesh: each panel has a jet manifold on its downstream side, and when its load cell and camera see animals held for 90 s it fires a 12 s burst back through the mesh that pushes them into the sweep. The twin counts bursts and bells freed.

The answer for other animals has four layers. The mesh runs at fish-screen speed, so a fish that meets a net turns and swims back out of the channel against a current it easily beats; small fish slip through net A's coarse mesh. Both openings, net A's open panel and the hopper's mouth, have bar screens with 50 cm gaps: every target bell passes, turtles and big fish do not. A small fish that swims into the hopper heads back out of its open mouth; one that is scooped rides up in a bucket of water and goes out to sea alive, not onto the plant's screens. A turtle small enough to slip the bars is seen by the hopper camera, and the elevator waits until it has swum out. The twin shows all of it, illustratively; bycatch is watched in the panel test at sea.

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
