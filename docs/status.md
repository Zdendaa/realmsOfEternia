# Project status

_Last updated: 2026-11-25._

**Current state:** Phase 6 (military and combat) in progress, see [phase-6-plan.md](phase-6-plan.md): 6.1 (combat core in the simulation: health, armor, counters, melee, arrows, death, auto-engage, attack / attack-move / stop) is done; there is nothing to see in the game yet (soldiers get models in 6.2 and are trained from 6.3). Phase 5 (economy) is done: 5.1 (player stocks, construction costs paid at placement, resource bar) 5.2 (serfs gather wood and stone; trees and rocks run out) 5.3 (carried goods are visible) 5.4 (builders carry the materials to sites) and 5.6 (workers in the lumbermill and quarry) are done, and of the economy-depth part 5b.1 (population and recruit cost), 5b.2 (professions look different, tools in hand), 5b.3 (farms: farmers sow, grow and harvest grain), 5b.4 (mill and bakery: grain → flour → food) and 5b.5 (gold and iron mines on ore deposits) and 5b.6 (move to the Medieval Hexagon Pack: buildings with player-colored roofs, construction stages, tree stumps, unused models pruned) are done. With that, every milestone in [phase-5b-plan.md](phase-5b-plan.md) is done. The first part of the phase is in [phase-5-plan.md](phase-5-plan.md); the storehouse (5.5) is done (built from Hexagon props in 5b.6).

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
| 5b.1  | Population (housing), recruit cost, population indicator                          | ✅ Done |
| 5b.2  | Profession looks: hats, tunic colors, tools in hand, new loads                    | ✅ Done |
| 5b.3  | Farm: farmer, sow / grow / harvest cycle, grain, walkable fields                  | ✅ Done |
| 5b.4  | Mill and bakery: process loop, spinning sails, temporary bakery                   | ✅ Done |
| 5b.5  | Gold and iron mines on ore deposits                                               | ✅ Done |
| 5b.6  | Hexagon Pack buildings, construction stages, stumps, storehouse, model pruning    | ✅ Done |
| 5b    | Economy depth: see [phase-5b-plan.md](phase-5b-plan.md)                           | ✅ Done |
| 6.1   | Combat core in the sim: health, counters, melee, arrows, death, attack orders     | ✅ Done |
| 6     | Military and combat: see [phase-6-plan.md](phase-6-plan.md)                       | ⏳ Now  |

## What works today

- **World:** a 240×240 playable map generated deterministically from a seed. It has rolling hills, a flat 40×40 settlement plateau, noise-clustered forests, scattered rocks, one lake, and about 41,000 instanced grass patches (a short meadow carpet) with about 950 flower clusters. A ring of forested mountains surrounds the map and fades into the fog.
- **Settlement:** a Town Hall, a market, a well, six houses, a mill with two 2×3 fields and a lumbermill (workers: a woodcutter, a miller and two farmers; population 9 / 34), connected by dirt paths. Two roads leave toward the map edge.
- **Building style:** the buildings are KayKit Medieval Hexagon Pack models at 4× (slightly larger than units, as in most RTS games): a tall castle as the Town Hall (3.5×, about 14 units high, the village landmark), two house styles (half-timbered cottage and a taller house with steps) that alternate by building id, a roofed well, a windmill whose sails turn while the miller works, a lumbermill (its saw blade turns while the woodcutter prepares wood), a market with stalls, the bakery and the mines. Roofs, banners and trims take the owner's color (blue for the local player; neutral buildings keep the pack's yellow), keeping the roof shading. Every building stands in a trampled dirt yard that reaches about two units past its walls and widens in front of the entrance; placed buildings get theirs when they are placed. Fields and the quarry keep their Builder Pack models (the Hexagon pack has no 2 × 3 field or quarry).
- **Combat (simulation only, not visible yet):** every unit has health; swordsmen, spearmen and archers (game-data, starting numbers) fight with armor, cooldowns, reach and counter bonuses (swordsmen ×1.5 against infantry, spearmen ×3 against buildings, archers ×0.5 against buildings; arrows lose most of their damage on a swordsman's armor). Idle soldiers engage enemies within sight on their own and walk back to their spot afterwards (or when a chase goes beyond 12 units); `attack`, `attack-move` and `stop` orders exist. Archers release arrows that fly (speed 18) and land a few ticks later; an arrow at a target that died meanwhile does nothing. The dead lie for 3 s, then vanish; they free their housing at once. A 100 vs 100 battle costs about 0.3 ms per tick (p99 1.4 ms).
- **Rendering:**
  - sky dome, fog, ACES tone mapping
  - a sun at about 48° whose shadows follow the camera
  - chunked instancing for trees (5,700) and ground cover, and per-model instancing for buildings
  - procedural terrain detail and stylized water, with no texture downloads
- **Camera:** WASD and arrow keys, middle drag or the screen edges (toggle in the settings) to pan, right drag to rotate, mouse wheel to zoom. The focus point stays inside the playable area and on the ground.
- **Building placement:** a construction menu lists the ten buildable types with their costs (two balanced rows once there are more than seven); costs the stock can't cover are red, and the ghost says what is missing ("Not enough gold"). A ghost follows the mouse, snapped to a 1-unit grid, rotating in 90° steps, green or red by the shared placement rules (area, water, slope, buildings, paths, trees, rocks, and for mines the deposit: "Must be built on a gold deposit"). A placed building becomes a construction site, pays its full cost from the stock, and flattens the terrain and clears grass under it.
- **Resources:** a top bar shows the player's stock of wood, stone, iron, gold, food and mana (original icons), starting at 30 / 20 / 0 / 5 / 20 / 0, with a short +/- flash on every change. After a divider come the goods of the production chains, smaller: grain and flour (start at 0; flour is made from 5b.4 on). After another divider it shows the population: serfs and workers against housing (Town Hall 10, each house 4; the starting settlement has 8 / 34), red when full.
- **Gathering:** with serfs selected, the cursor shows an axe over trees and a pickaxe over rocks; a right click sends them to harvest (a group spreads over nearby trees or rocks). Each serf chops (3 s) or quarries (4 s) one unit, carries it to the Town Hall, and goes back; when a tree or rock runs out (trees 3–5 wood, rocks 6–12 stone by size) it moves on to the next one nearby. On the way back they hold the load in both arms (low-poly logs or stones). Felled trees leave a stump (two Hexagon pack styles, sized to the trunk) that sinks into the ground after about three minutes and vanishes under any building placed there, rocks shrink as they're quarried, and the ground they blocked becomes walkable and buildable. Five serfs gather roughly 5–6 wood per minute from a forest edge about 35 units from the Town Hall, and about 5 stone per minute from rocks at a similar distance.
- **Serfs:** five start in front of the Town Hall; more are recruited there (select the Town Hall → "Recruit serf"; each costs 2 food and needs a free place in the housing). The button shows the cost and is disabled with the reason ("Not enough food", "No free housing") when recruiting isn't possible. They are KayKit characters (the Ranger without cape and quiver) with baked skeletal animation: idle, walking (2.0 units/s), hammering while building, each unit out of phase with the others, and the scarf in the player color. Primitive placeholder serfs show while the models load, or if they fail to load. Left click or a box selects them (Shift adds), and a right click sends them to the ground point (spread out) or to a construction site.
- **Cursors and command feedback:** the cursor shows what a click would do: select over own units and buildings, move over the ground and build over own construction sites while serfs are selected. Water and steep slopes count as ground: serfs go to the nearest walkable spot. "Not allowed" shows over other buildings, trees and rocks (until Phase 5), and where nothing walkable is near or outside the playable area; a right click there does nothing. A move shows chevrons converging where the serfs will end up, in the player color (0.6 s); assigning to a site pulses an outline around it with a hammer icon above.
- **Farms:** every finished field gets a farmer (straw hat, ochre tunic). The farmer walks from plot to plot of the 2×3 field and sows each one (2 s, hands in the soil); sprouts appear on the sown plots. Once all six are sown the crop grows for 60 s, rising and turning from green to golden in steps, while the farmer waits at the field's edge. Then it reaps plot by plot with a sickle (2 s), leaving stubble, and carries the grain to the Town Hall as sheaves, three plots' worth per trip (the farmer's carry capacity, set per profession in game-data); after the last plot it sows again. The two starting fields begin ripe, so grain comes in from the first seconds. Selecting a field shows its cycle ("Sowing: 3 / 6 plots", "Growing: ripe in 42 s", "Harvest: 2 / 6 plots") and what the farmer does. Fields are walkable: units cross them instead of walking around. Measured in the simulation: a starting field completes a cycle every 170–182 s, about 2.0–2.1 grain per minute (1.2–1.3 when every sheaf was its own trip).
- **Mill and bakery (food chain):** the mill's miller (white cap) waits until the Town Hall holds grain, takes up to 3 units out of the stock as they set off (so no other worker counts on them), fetches them, grinds them inside the mill (4 s each; the miller is hidden and the sails turn, speeding up and slowing down smoothly) and carries the flour back. A bakery (new in the construction menu: wood 5, stone 4) works the same way: its baker (toque) fetches 2 flour per trip and bakes 2 food from each (6 s per flour) while smoke rises from the oven chimney. Food pays for recruiting serfs. The panels say what the worker does ("Waiting for grain in the Town Hall", "Making food inside"). The flour and food are carried as sacks and bread baskets.
- **Mines and deposits:** the map has two ore deposits about 45 units from the Town Hall: gold to the west-north-west beyond the fields and iron to the south-east. Each shows as a soft tinted ground patch (ochre or rust) with a few dark rocks veined in the ore color, and trees and rocks never grow on it. A gold or iron mine (the Hexagon pack's mine: a rock mound with a timbered entrance and rails; wood 8, stone 4) can only be built with its center on a deposit of its ore. Its miner (helmet with lamp, dark tunic) works like the miller: fetches up to 3 food from the Town Hall (taken from the stock as they set off), mines inside (8 s per ore, 1 food each), and carries the gold or iron ore back. The marker rocks vanish once the mine stands. Deposits are infinite for now. Iron has no use yet (the blacksmith comes with military).
- **Storehouse:** a storage yard (wood 6, stone 3; 7 × 6) assembled from Hexagon props: a tent, a lumber pile, a stone pile, pallets with crates and sacks, barrels, a wheelbarrow and a flag in the owner's color. Once finished it works like the Town Hall: every villager drops goods off at, and builders fetch materials from, the nearest storage (goods still count in the one stock). Build one near the forest, the fields or the mines to cut walking.
- **Workers:** a finished lumbermill or quarry gets a worker (the Rogue character, bare-headed with long hair). It works on its own: walks to the nearest tree or rock within reach of its building (25 / 30 units), harvests it, brings the unit back to the building, prepares it briefly, carries it to the Town Hall and starts again. The starting lumbermill has its woodcutter from the start (about 1 wood per 40 s at the forest edge next to it). A worker needs a free place in the housing too: a finished production building without one waits (its panel says "waiting for housing") and gets its worker as soon as a house is finished. Workers show their profession: the woodcutter wears a rust wool cap and a green tunic, the stonecutter a cloth cap and a grey tunic (the farmer has a straw hat and an ochre tunic; hats and tunics for miller, baker and miner are ready for the next milestones), and their neckerchief and cuffs take the player color. Working units hold a tool: a hammer while building, an axe while chopping, a pickaxe while quarrying (serfs too). Workers can't be selected or ordered; selecting their building shows what the worker is doing. The quarry uses the pack's mine model.
- **Construction sites:** a dirt plate with the Hexagon pack's building stages, switching by thirds of the work: building materials (A), then a stone foundation with a timber frame (B), then walls and part of the roof (C), scaled to the footprint. From the second stage a scaffolding yard (scaffold towers, tables, stone piles) stands around it, and a flag in the owner's color marks the front corner; a progress bar floats above. Fields instead rise from the ground (their plots and crop). The placement ghost is the real model, translucent, with its roof in the player's color and a light green (valid) or red (invalid) tint over a matching ground plate. Idle serfs take sites within 30 units on their own (up to the building's `maxBuilders`: house 3, mill 4...). Builders first carry the materials from the Town Hall, one unit per trip, and the work can't get ahead of what has arrived; each working serf then adds the same amount of work (linear). A house near the Town Hall takes about 45 s with three serfs (30 s of work for one serf, 10 s for three, plus the trips). Selecting a site shows its progress, the delivered materials (e.g. wood 3 / 4, stone 0 / 2) and its builders. Finished sites become normal buildings.
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

- **Temporary models:** the bakery is the Medieval Hexagon Pack's blacksmith (yellow variant: a straw-roofed shed with a domed stone oven), flagged `temporary` in game-data until a bakery model exists. Phase 6 (military) will want it as the blacksmith. Hexagon buildings are scaled 4× (castle 3.5×; Builder Pack 3×); the Hexagon pack's CC0 license is in `assets/models/hexagon/`.

- **Two packs side by side:** fields (farm_plot) and the quarry (mine) are still Builder Pack models, and the small props around houses (round garden trees, rocks) too.
- **Pack style:** the KayKit pack has no standalone village clutter; barrels, crates and fences are baked into the buildings. Its farm plots are blocky crop boxes.
- **Mixed tree styles:** garden trees from the pack are round, while forest trees are our own conifers.
- **Production build size:** about 15 MB (was 19 MB before 5b.6 pruning). Only the seven Builder Pack models still in use ship (farm plot, mine, garden trees, rocks; 288 KB), and every Hexagon file is used. The character folder (about 11 MB) is kept whole on purpose: the Knight, Barbarian, Mage and hooded Rogue and the combat, movement-advanced, simulation and special Rig_Medium libraries are unused today but planned for Phase 6 (military).

### Input

- **Cursor crispness on retina is unverified:** the cursors use `image-set(... 2x)` with 64 px SVGs. Headless Chrome screenshots don't include the OS cursor, so the cursor images, hotspots and sharpness were not seen live; the `data-cursor` states and the computed CSS were checked.

### Units and pathfinding

- **Quick steps (accepted):** serfs walk at 2.0 units/s at the building-matched scale 0.62 (~1.4 units tall). `Walking_B` covers only ~0.66 units per cycle at this size, so it plays at ~3.2× (≈360 steps/min, feet planted). It reads fine at RTS zoom; close up the legs look hurried. A larger scale (tried 0.99) slows the cadence but makes serfs taller than the houses suggest.
- **Animations switch instantly** (no cross-fade between clips). Tools appear and vanish with the work (no draw or put-away animation). Hammer and pickaxe are built in code (the free pack has neither); the axe is the KayKit one.
- **Team color is small:** only the serf's scarf and the worker's neckerchief and cuffs take the player color.
- **Workers don't look for a better spot:** a production building placed where nothing is in reach keeps its worker waiting (the placement ghost doesn't warn about it yet).
- **Carrying is a combined clip:** the walk's legs with the `Holding_A` arms; the upper body doesn't sway with the steps, and the load is put down instantly (no pick-up or drop animation). Bundles are small at the default zoom.
- **Units don't avoid each other while planning:** separation only pushes overlapping units apart, so crowds in narrow gaps can jostle and a stuck unit gives up after two re-plans.
- **Gatherers often work on the far side of a tree,** hidden by its crown from the default camera angle.
- **Goods are kept through other orders:** a serf moved away while carrying keeps the load until its next gather trip delivers it.
- **Roads give no speed bonus.** Fields are walkable; every other building footprint is an obstacle.
- **Farmers are partly hidden while reaping:** they work from the narrow margin between a plot's fence and its crop, so from the default camera the straw hat and torso show, the sickle hardly. Ripe wheat is drawn at 60% of the model's height for this, on finished fields, construction sites and the placement ghost alike.
- **Mines are far to build:** the deposits lie beyond the 30-unit radius in which idle serfs take construction sites on their own, so a mine site needs serfs sent to it (select, right-click the site), and the 12 materials are carried one per trip over about 45 units (a few minutes).
- **Grain still takes walking:** a farmer makes two trips to storage per harvest (about 2 grain per minute per field near the village, delivering to the Town Hall); a storehouse next to the fields shortens the trips (not measured yet). A load of three sheaves looks the same as one.
- **The game pauses in a hidden tab:** the client tick runs from the render loop (fine for single player; the server will be authoritative).
- **Only buildings and own units can be selected;** there is no double-click "select all of type" yet.
- **Building picking uses footprint boxes** with a rough height, not the model shape.

### Combat

- **No opponent yet:** combat runs only in tests and, from 6.2, with the dev spawn. Villagers can be killed but never fight back or flee.
- **Workers are targetable inside their building** (they stand at its door), and a killed worker is replaced at once like any worker (free, housing permitting).
- **Units walking back after a fight ignore enemies** until they are back at their spot; units on a plain move never fight (by design: attack-move does).
- **Buildings can't be attacked yet** (6.5).

### Architecture

- **Multiplayer isn't wired yet:** the client runs the tick locally. The server runs the same tick and validates commands with the same rules, but keeps its game state privately (no state sync, no client connection yet), and its starting settlement is neutral, so nobody can recruit there.
- **No persistence:** placed buildings disappear on reload (by design for now).
- **Builders are the only carriers:** there are no separate carrier jobs, and serfs beyond a site's `maxBuilders` don't help carrying. Delivered material isn't shown as piles on the site.
- **The server's settlement has no stock:** it stays neutral, so players on the server can't place buildings until matches have start positions.
- **Placed buildings get no paths** to their entrances (they do get a worn dirt yard).
- **Cosmetic layers are client-only by design:** props, worn ground and grass live in the client (`decorateWorld`); everything gameplay-relevant comes from `@roe/sim`.
- **Settlement data is hand-authored** for one map. There are no generators or editors yet.
- **Footprints are bounding boxes,** slightly larger than the buildings. Selection and collision will need finer shapes.
- **Tests cover the simulation only:** `@roe/sim` has unit tests for placement rules and commands; rendering is verified with browser screenshots.
