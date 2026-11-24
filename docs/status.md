# Project status

_Last updated: 2026-11-24._

**Current state:** Phase 5 (economy) in progress: 5.1 (player stocks, construction costs paid at placement, resource bar) 5.2 (serfs gather wood and stone; trees and rocks run out) 5.3 (carried goods are visible) 5.4 (builders carry the materials to sites) and 5.6 (workers in the lumbermill and quarry) are done. Phase 5 continues with the postponed storehouse (5.5) and the rest of the economy; see the plan. The approved plan and milestone status are in [phase-5-plan.md](phase-5-plan.md).

## Phases

| Phase | Scope                                                                             | Status  |
| ----- | --------------------------------------------------------------------------------- | ------- |
| 1     | Monorepo foundation: client, server, shared, game-data, tooling                   | ✅ Done |
| 2.1   | Terrain heightmap, atmosphere, forests, RTS camera                                | ✅ Done |
| 2.1b  | Camera-following shadows, mountain border ring                                    | ✅ Done |
| 2.2   | First settlement with KayKit buildings, terrain flattening, paths                 | ✅ Done |
| 2.2b  | Visual tuning: scale, layout, fields, soft paths, props, sun                      | ✅ Done |
| 2.3   | Terrain detail shader, muted crops, lake with stylized water                      | ✅ Done |
| 2.3b  | Grass tufts and flowers, uniform tree scale, subtler water highlights             | ✅ Done |
| 2.3c  | Meadow-scale grass carpet, smaller flowers, calm water with a shoreline foam line | ✅ Done |
| 3.1   | `@roe/sim` package; world creation moved out of the client                        | ✅ Done |
| 3.2   | Placement rules, commands, game state, unit tests                                 | ✅ Done |
| 3.3   | Construction menu, placement preview and placing                                  | ✅ Done |
| 4.1   | Sim core: 10 Hz tick, serfs, nav grid + A*, separation, construction, commands    | ✅ Done |
| 4.2   | Client tick loop, interpolation, placeholder serfs, recruiting                    | ✅ Done |
| 4.3   | Selection (click, box), move command, mouse scheme, edge scrolling                | ✅ Done |
| 4.4   | Construction sites: visuals, progress, right-click assignment                     | ✅ Done |
| 4.5   | Character models with baked-animation instancing                                  | ✅ Done |
| 4.6   | Context cursors and command markers                                               | ✅ Done |
| 5.1   | Resource stock, paid construction costs, resource bar                             | ✅ Done |
| 5.2   | Finite trees and rocks, serf gathering, axe/pickaxe cursors                       | ✅ Done |
| 5.3   | Carrying visual: walk with held load, low-poly bundles on the rig                 | ✅ Done |
| 5.4   | Material delivery to construction sites                                           | ✅ Done |
| 5.6   | Workers: lumbermill and quarry                                                    | ✅ Done |
| 5     | Economy: see [phase-5-plan.md](phase-5-plan.md) for the remaining milestones      | ⏳ Next |

## What works today

- **World:** a 240×240 playable map generated deterministically from a seed. It has rolling hills, a flat 40×40 settlement plateau, noise-clustered forests, scattered rocks, one lake, and about 41,000 instanced grass patches (a short meadow carpet) with about 950 flower clusters. A ring of forested mountains surrounds the map and fades into the fog.
- **Settlement:** a Town Hall, a market, a well, six houses, a mill with two 2×3 fields and a lumbermill, connected by dirt paths. Two roads leave toward the map edge.
- **Rendering:**
  - sky dome, fog, ACES tone mapping
  - a sun at about 48° whose shadows follow the camera
  - chunked instancing for trees (5,700) and ground cover, and per-model instancing for buildings
  - procedural terrain detail and stylized water, with no texture downloads
- **Camera:** WASD and arrow keys, middle drag or the screen edges (toggle in the settings) to pan, right drag to rotate, mouse wheel to zoom. The focus point stays inside the playable area and on the ground.
- **Building placement:** a construction menu lists the seven buildable types (including the quarry) with their costs; costs the stock can't cover are red, and the ghost says what is missing ("Not enough gold"). A ghost follows the mouse, snapped to a 1-unit grid, rotating in 90° steps, green or red by the shared placement rules (area, water, slope, buildings, paths, trees, rocks). A placed building becomes a construction site, pays its full cost from the stock, and flattens the terrain and clears grass under it.
- **Resources:** a top bar shows the player's stock of wood, stone, iron, gold, food and mana (original icons), starting at 30 / 20 / 0 / 5 / 20 / 0, with a short +/- flash on every change.
- **Gathering:** with serfs selected, the cursor shows an axe over trees and a pickaxe over rocks; a right click sends them to harvest (a group spreads over nearby trees or rocks). Each serf chops (3 s) or quarries (4 s) one unit, carries it to the Town Hall, and goes back; when a tree or rock runs out (trees 3–5 wood, rocks 6–12 stone by size) it moves on to the next one nearby. On the way back they hold the load in both arms (low-poly logs or stones). Felled trees disappear, rocks shrink as they're quarried, and the ground they blocked becomes walkable and buildable. Five serfs gather roughly 5–6 wood per minute from a forest edge about 35 units from the Town Hall, and about 5 stone per minute from rocks at a similar distance.
- **Serfs:** five start in front of the Town Hall; more are recruited there (select the Town Hall → "Recruit serf", up to 200, no cost yet). They are KayKit characters (the Ranger without cape and quiver) with baked skeletal animation: idle, walking (2.0 units/s), hammering while building, each unit out of phase with the others, and the scarf in the player color. Primitive placeholder serfs show while the models load, or if they fail to load. Left click or a box selects them (Shift adds), and a right click sends them to the ground point (spread out) or to a construction site.
- **Cursors and command feedback:** the cursor shows what a click would do: select over own units and buildings, move over the ground and build over own construction sites while serfs are selected. Water and steep slopes count as ground: serfs go to the nearest walkable spot. "Not allowed" shows over other buildings, trees and rocks (until Phase 5), and where nothing walkable is near or outside the playable area; a right click there does nothing. A move shows chevrons converging where the serfs will end up, in the player color (0.6 s); assigning to a site pulses an outline around it with a hammer icon above.
- **Workers:** a finished lumbermill or quarry gets a worker (the Rogue character, hooded, in green). It works on its own: walks to the nearest tree or rock within reach of its building (25 / 30 units), harvests it, brings the unit back to the building, prepares it briefly, carries it to the Town Hall and starts again. The starting lumbermill has its woodcutter from the start (about 1 wood per 40 s at the forest edge next to it). Workers can't be selected or ordered; selecting their building shows what the worker is doing. The quarry uses the pack's mine model.
- **Construction sites:** dirt, a wooden scaffold and the real model rising from the ground as work progresses, with a progress bar. Idle serfs take sites within 30 units on their own (up to the building's `maxBuilders`: house 3, mill 4...). Builders first carry the materials from the Town Hall, one unit per trip, and the work can't get ahead of what has arrived; each working serf then adds the same amount of work (linear). A house near the Town Hall takes about 45 s with three serfs (30 s of work for one serf, 10 s for three, plus the trips). Selecting a site shows its progress, the delivered materials (e.g. wood 3 / 4, stone 0 / 2) and its builders. Finished sites become normal buildings.
- **Pathfinding:** A* on a 1-unit grid (water, slopes, trees, rocks and buildings block) with smoothed routes; units push each other apart instead of stacking. On the prototype map a path takes about 1–1.5 ms on average and a tick with 300 moving serfs about 0.5 ms (p99 about 7 ms when many paths are planned at once).
- **Shared rules ready for Phase 3:** `createHeightField`, `flattenHeightField`, `entrancePoint`, `createBuildRules().isBuildable` and `createWaterMap().isWater`.
- **Server:** a Colyseus server with a placeholder 2–4 player match room. The client doesn't connect to it yet.
- **Performance:** a steady 60 FPS (vsync-capped) on an Apple M1 Pro in Chrome, also with 200 animated serfs walking at once. Uncapped frame times were last measured before Phase 4 (about 2.4 ms at the default view).

## Known limitations

### Rendering

- **R3F warning:** React Three Fiber 9.8 logs a harmless `THREE.Clock` deprecation warning with three r187. It goes away when R3F updates.
- **Shadow distance:** the shadow frustum is capped at 220×220 units, so distant trees have no shadows when fully zoomed out.
- **Water:** it doesn't receive shadows and has no reflections. The open surface is intentionally calm (depth gradient plus a shoreline foam line), with no waves.
- **Blurry ground marks:** worn ground and lake sand are baked into a 1-unit terrain grid, so they look blurry very close up.
- **Paths:** they follow the terrain without flattening, so on steep slopes they would tilt sideways. Overlapping junctions are simply stacked.
- **Building culling:** each instanced building mesh draws all of its placements together. Large player towns will need chunked culling like the trees have.
- **Ground cover fades with distance:** beyond 100–140 units from the camera it shrinks away, so fully zoomed out the far ground shows only the terrain colors.- **Grass ignores trees:** tufts are not cleared under trees or rocks; this is not visible at RTS distance.
- **Models load without a placeholder:** buildings appear only once their GLB files have loaded.

### Assets

- **Pack style:** the KayKit pack has no standalone village clutter; barrels, crates and fences are baked into the buildings. Its farm plots are blocky crop boxes.
- **Mixed tree styles:** garden trees from the pack are round, while forest trees are our own conifers.
- **Production build size:** the build includes the whole medieval pack (about 4.6 MB, including 196 unused tile models) and all character assets (9.4 MB: six characters and all eight Rig_Medium animation libraries, of which three are loaded). Unused files can be pruned before release.

### Input

- **Cursor crispness on retina is unverified:** the cursors use `image-set(... 2x)` with 64 px SVGs. Headless Chrome screenshots don't include the OS cursor, so the cursor images, hotspots and sharpness were not seen live; the `data-cursor` states and the computed CSS were checked.

### Units and pathfinding

- **Quick steps (accepted):** serfs walk at 2.0 units/s at the building-matched scale 0.62 (~1.4 units tall). `Walking_B` covers only ~0.66 units per cycle at this size, so it plays at ~3.2× (≈360 steps/min, feet planted). It reads fine at RTS zoom; close up the legs look hurried. A larger scale (tried 0.99) slows the cadence but makes serfs taller than the houses suggest.
- **Animations switch instantly** (no cross-fade between clips), and serfs hammer without a tool in their hands (the free pack has no hammer model).
- **Team color relies on the blue scarf:** only texels where blue dominates are recolored, so workers (the Rogue has no blue area) show no player color yet.
- **Workers don't look for a better spot:** a production building placed where nothing is in reach keeps its worker waiting (the placement ghost doesn't warn about it yet).
- **Carrying is a combined clip:** the walk's legs with the `Holding_A` arms; the upper body doesn't sway with the steps, and the load is put down instantly (no pick-up or drop animation). Bundles are small at the default zoom.
- **Units don't avoid each other while planning:** separation only pushes overlapping units apart, so crowds in narrow gaps can jostle and a stuck unit gives up after two re-plans.
- **Gatherers often work on the far side of a tree,** hidden by its crown from the default camera angle. Felled trees leave no stump.
- **Goods are kept through other orders:** a serf moved away while carrying keeps the load until its next gather trip delivers it.
- **Fields block walking:** every building footprint, including fields, is an obstacle. Roads give no speed bonus.
- **The game pauses in a hidden tab:** the client tick runs from the render loop (fine for single player; the server will be authoritative).
- **Only buildings and own units can be selected;** there is no double-click "select all of type" yet.
- **Building picking uses footprint boxes** with a rough height, not the model shape.

### Architecture

- **Multiplayer isn't wired yet:** the client runs the tick locally. The server runs the same tick and validates commands with the same rules, but keeps its game state privately (no state sync, no client connection yet), and its starting settlement is neutral, so nobody can recruit there.
- **No persistence:** placed buildings disappear on reload (by design for now).
- **Builders are the only carriers:** there are no separate carrier jobs, and serfs beyond a site's `maxBuilders` don't help carrying. Delivered material isn't shown as piles on the site.
- **The server's settlement has no stock:** it stays neutral, so players on the server can't place buildings until matches have start positions.
- **Placed buildings get no paths and no worn ground** at their entrances.
- **Cosmetic layers are client-only by design:** props, worn ground and grass live in the client (`decorateWorld`); everything gameplay-relevant comes from `@roe/sim`.
- **Settlement data is hand-authored** for one map. There are no generators or editors yet.
- **Footprints are bounding boxes,** slightly larger than the buildings. Selection and collision will need finer shapes.
- **Tests cover the simulation only:** `@roe/sim` has unit tests for placement rules and commands; rendering is verified with browser screenshots.
