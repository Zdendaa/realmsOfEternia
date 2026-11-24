# Architecture

This document explains how the codebase is structured and why. Read it before you add a new package or a new kind of game system.

## Goals

1. **Multiplayer from day one.** Every gameplay rule must be able to run on the server.
2. **Clear separation.** Rendering, game logic, UI, networking and game data live in separate places.
3. **Data-driven content.** Races, buildings, units, upgrades and spells are defined as data, not hard-coded in logic.
4. **Small, working increments.** Add an abstraction when a second real use appears, not before.

## Packages

| Package          | Runs in          | May depend on                | Must not contain                                 |
| ---------------- | ---------------- | ---------------------------- | ------------------------------------------------ |
| `@roe/shared`    | browser and Node | nothing                      | DOM, Node APIs, React, three.js, `Math.random`   |
| `@roe/game-data` | browser and Node | `@roe/shared` (types)        | logic beyond simple derived values               |
| `@roe/sim`       | browser and Node | `shared`, `game-data`        | rendering, UI, cosmetic-only data (grass, props) |
| `@roe/client`    | browser          | `shared`, `game-data`, `sim` | authoritative game decisions                     |
| `@roe/server`    | Node             | `shared`, `game-data`, `sim` | rendering or UI code                             |

### `@roe/shared`: types and rules

Pure functions and types: IDs, vectors, constants (`SIMULATION_TICK_RATE`, `MAX_PLAYERS`), the seeded RNG (`createRng`), stateless value noise (`fractalNoise2D`), and map generation:

- `createHeightField(map).getHeightAt(x, z)` returns the terrain height at any point, with lakes already carved in (`createBaseHeightField` is the natural terrain before water). The heightmap is never stored or sent over the network; it is recomputed from the map seed. Use it for everything that sits on the ground: the terrain mesh, decorations, units, buildings and the camera focus.
- `flattenHeightField(heights, footprints)` wraps a height field so the ground under each placed footprint is perfectly flat (levelled to the original height at its center) and blends back to the terrain within a few units. A building's own footprint always wins over a neighbour's blend band. Settlement buildings use it now; player construction will reuse it.
- `scatterDecorations(map, { heights, isBlocked })` places trees and rocks. Trees cluster into forests through a noise mask, and the central settlement area (`map.settlement`) stays empty. `heights` lets them sit on flattened terrain, and `isBlocked` keeps them off buildings and paths.
- `sampleCatmullRom(points, spacing)` and `distanceToPolyline(...)` define path shapes the same way on every machine.
- Water: lakes are hand-authored in `map.water` (center, radius, depth, shoreline irregularity). `resolveLakes` derives each water level from the natural terrain, just below the lowest point of its shoreline, so water can never spill. `carveLakes` cuts the basin and banks into the height field. `createWaterMap(...).isWater(x, z)` is the shared water lookup: decorations never spawn in water.
- `createBuildRules(map).isBuildable(x, z)` is the construction rule for Phase 3: inside the playable area and not in or right next to water.
- Map layout, from the center outward: the flat settlement plateau, rolling hills across the playable square (`map.size`), then a non-playable border ring (`map.border`) of forested mountains. The mountains continue past the ring and fade into the fog, so the world never visibly ends. `isInPlayableArea(map, x, z)` tells the two zones apart. Border trees are scenery only.

Determinism is required. With the same input, a rule function must return the same output on every machine. Always use `createRng(seed)` and never `Math.random()`.

### `@roe/game-data`: definitions

Static configuration written as typed object literals with `as const satisfies SomeDefinition`. That keeps literal types while still checking the shape. Races, upgrade tiers, units and spells will go here too. Current contents:

- `PROTOTYPE_MAP`: terrain, forest, border and water (one lake) settings.
- `BUILDINGS`: id, name, `modelPath`, `footprint` (world units), `scale` and `rotationOffset`. Footprints are measured from model bounding boxes. By convention every building's entrance faces local +Z.
- `PROTOTYPE_SETTLEMENT`: the hand-authored starting village around a central square. Fields are tiled `farm_plot` instances built with `field()`. Paths are spline control points whose endpoints come from `entrancePoint()`, so moving a building keeps its path attached; every path ends at an entrance or runs off toward the map edge as a road. The layout also lists squares (worn ground) and prop rules.
- `RESOURCES`: wood, stone, iron, gold, food and mana. Building `cost` uses wood, stone and gold so far.
- Buildings also carry `buildable`, `cost` and `description`. A `field` is one placeable 2×3 unit of `farm_plot` tiles (`modelTiling`).
- `PROPS`: small pack details (rocks, garden trees). The pack has no standalone village clutter; barrels, crates and fences are baked into the building models.
- `MEDIEVAL_PACK`: the KayKit asset pack's folder, its world scale (pack unit × 3) and material overrides (color, roughness) by material name. The overrides are applied when models load, so the GLB files stay untouched.

### `@roe/sim`: game simulation

Game rules that need both primitives (`shared`) and content (`game-data`). `shared` can't import `game-data`, because `game-data` already depends on `shared`, so this layer sits on top of both. Client and server import it and run exactly the same code.

- `createWorld(map, settlement)` builds the static, gameplay-relevant world: the terrain with lakes (`terrain`), the terrain flattened under the starting settlement (`heights`), the water map, the starting buildings, sampled paths, and trees and rocks with stable ids.
- **Game state** (`GameState`) is plain, serializable data: the tick number, building instances (id, type, position, rotation, owner, `status: construction | complete`), construction progress per site, units, each player's resource stock (`stocks`, whole numbers for all six resources) and the next entity id. The starting settlement becomes the first instances (complete), followed by the starting serfs in front of the first Town Hall. `createInitialState(world, { owner, players, resources })` gives the starting settlement to a player (the client uses the local player; the server keeps it neutral until matches have start positions) and a starting stock (`STARTING_RESOURCES` from game-data) to the owner and any further listed players. Construction progress lives in `construction` (by site id), not on the building, so the `buildings` array only changes when buildings are placed or finished and terrain or instancing never rebuild for progress. `createStateHeights(world, state)` is the terrain flattened under every building in that state.
- **Simulation context** (`SimContext`): the derived caches, the flattened `heights`, the nav grid and an A* path finder. It is not state and is never sent: client and server each build it with `createSimContext(world, state)`. `syncContext(ctx, state)` keeps it in step (new buildings are stamped incrementally). It is the only mutable part of the simulation.
- **Tick** (`stepGame(ctx, state, commands)`): advances the game by one fixed step (`SIMULATION_TICK_RATE` = 10 Hz). Queued commands are applied first, in order, then: serf behavior (tasks) → routes crossing new buildings are dropped → path planning (at most 24 searches per tick, oldest units first) → walking → separation → construction work. Units are shallow-copied once per tick and mutated as working copies; the input state is never touched. Same state and commands give the same result on every machine (no `Math.random`, ids decide ties). Speeds are in units per second, converted to ticks in one place, so the tick rate can change later.
- **Units** (`UnitInstance`): id, type, owner, position, a task (`idle`, `move`, `build` with site and work slot) and a movement (goal, waypoints, stuck counter). Serfs (`units/serfBehavior.ts`): finished moves become idle; idle serfs look for work once per second (staggered by id) and take the nearest own construction site with a free work slot within 30 units; builders work while they stand within reach of their site. A serf caught under a newly placed site steps out of it.
- **Construction:** every working serf adds 1 work per tick; a site needs `buildTime × tick rate` work (`buildTime` and `maxBuilders` come from game-data), so builders speed it up linearly. Work slots (`workSlots`) are `maxBuilders` points spread around the footprint, starting at the entrance, which caps the number of builders. Finished sites become `complete` and free their builders.
- **Pathfinding** (`nav/`): a 1-unit walkability grid over the playable area (57,600 cells on the prototype map) blocks steep cells, water, the border, trees and rocks (by radius plus clearance) and building footprints. A* uses 8 neighbours without corner cutting, integer costs and an octile heuristic. Its typed-array buffers are reused via generation stamps, and its heap breaks ties deterministically. Blocked goals snap to the nearest walkable cell; unreachable goals end at the closest explored cell, capped at 30,000 expanded cells. Routes are then smoothed by line of sight (string pulling). Measured on the prototype map: about 1–1.5 ms per path on average (a cross-map route expands about 6,000 cells), and the nav grid builds in about 30 ms. Flow fields or hierarchical A* can be added behind `PathFinder` when armies arrive.
- **Separation:** units aren't obstacles for path planning. Instead, overlapping units push each other apart each tick (spatial hash, soft push, never into blocked cells; working units hold their spot). Group moves spread their goals in a spiral around the target, and a unit stuck near a crowded goal stops; farther away it re-plans (twice at most).
- **Economy** (`economy/stock.ts`): `stockOf`, `missingResources`, `canAfford` and `pay` work on a player's stock. Placing a building checks the placement rules and the cost (`notEnoughResources`, reported together with the placement issues) and pays the full cost when the site is created. A player without a stock (e.g. on the server's neutral settlement) can't place anything. Phase 5 plan: [phase-5-plan.md](phase-5-plan.md).
- **Commands** are what a client sends: `placeBuilding`, `recruitSerf {buildingId}`, `moveUnits {unitIds, x, z}` and `assignBuilders {unitIds, siteId}`. A command never contains the player: the receiver attaches the issuer (the server takes it from the network session), so a client can't act for someone else. `parseCommand(unknown)` turns an untrusted message into a command, copying only known fields (unit lists: 1–256 distinct positive integer ids).
- **`applyCommand(ctx, state, issuer, command)`** validates and executes a command purely: it returns a new state, or the unchanged state plus the failed rules (`CommandCheck`). `validateCommand` runs only the checks. Unit commands affect only the issuer's own units (others in the list are ignored); recruiting needs the issuer's complete Town Hall and stays under the per-player limit (200 serfs). Placing a building creates a construction site.
- **Placement rules** (`checkPlacement`, tunable via `PLACEMENT_RULES`): a known and buildable type; the center on the 1-unit grid; rotation in whole quarter turns; inside the playable area; not in or right next to water; at most 1.5 units of height difference under the footprint; a 1-unit gap to other buildings (rotated-rectangle overlap test); clear of paths; and not on trees or rocks (trees block placement and are never removed). Spatial indexes over trees, rocks and path samples keep the checks fast.
- **Tests:** `pnpm test` runs vitest on small synthetic maps (flat ground, a known lake and path, an injected tilted terrain for the slope rule, a Town Hall with five serfs). They cover placement, commands, the nav grid and A*, serf behavior and construction, determinism (the same commands give a deep-equal state after 400 ticks), and benchmarks that print timings (`[bench]`).

### `@roe/client`: the game client

```text
src/
  main.tsx, App.tsx    bootstrapping and layout (canvas plus HUD overlay)
  render/              everything inside the <Canvas>
    GameCanvas.tsx     renderer, camera and scene root
    camera/            RTS camera (MapControls, key and edge panning, bounds clamp)
    scene/             World, Terrain, Water, Paths, Lighting, Trees, Rocks, Sky
    scene/settlement/  Settlement, ModelInstances (GLB loading, overrides, instancing)
    placement/         PlacementPreview (ghost model, validity), groundPick (ray vs height field)
    simulation/        SimulationDriver (fixed-step tick loop), simClock (interpolation factor)
    units/             UnitFrameDriver (per-frame unit data), Units (baked characters, placeholder fallback)
      baked/           bakeCharacter (bone texture), bakedSkinMaterial (GPU skinning), BakedUnits
    selection/         SelectionMarkers (building frame), SelectionRings (instanced unit rings)
    construction/      ConstructionSites (dirt, scaffold, clipped model, progress bar)
    commands/          CommandMarkers (pooled move/site markers), commandFeedback (input → marker queue)
    picking/           pickBuilding (ray vs oriented building boxes), screenPick (units in screen space)
    shaders/           shared GLSL snippets (value noise)
  world/               decorateWorld: cosmetic layers (props, worn ground, grass) on top of the sim world
  ui/                  HTML/CSS overlay (ResourceBar, ConstructionMenu, SelectionPanel; cursors/ and icons/: original SVGs); never imports three.js
  input/               input hooks (keyboard, placement, selection), pointerTarget, cursorKind, useHoverCursor
  state/               Zustand stores: gameStore (simulation), placementStore, selectionStore and settings (UI only)
```

Rules:

- **`render/` only visualizes.** It reads state and draws it. It does not compute gameplay outcomes.
- **`ui/` is plain React DOM** that sits over the canvas. It talks to the scene only through stores.
- **Per-frame values never go through React state.** Camera movement, animation and similar values are mutated inside `useFrame` or kept in refs, which avoids re-renders. Zustand stores hold values that change at human speed, such as settings, selection and menus.
- **Static props use chunked instancing.** `StaticInstances` uploads instance matrices once. Trees are split into 60×60 world-space chunks, each its own instanced mesh with its own bounding sphere, so chunks outside the camera or shadow frustum are skipped. Chunks share one geometry and material per part.
- **The world comes from `@roe/sim`.** `createWorld` (sim) builds the gameplay world, and the client's `decorateWorld` adds the cosmetic layers: props behind and beside buildings, worn-ground patches and ground cover. Every renderer and the camera sample the same `world.heights`.
- **Buildings are instanced per model part.** `Settlement` groups buildings and props by model file. `ModelInstances` loads the GLB with `useGLTF` (preloaded, no Draco), applies the material overrides, and draws each mesh of the model as one instanced mesh, so six houses cost the same draw calls as one. Paths are one soft-edged (vertex alpha) ribbon mesh; worn ground is baked into the terrain vertex colors.
- **Ground cover is cosmetic and instanced.** `world/groundCover.ts` places grass tufts and flower clusters on a jittered grid: some grass everywhere, lush in noise-masked meadows, thinning near paths, and none on paths, buildings, fields, worn ground or water. Each grass instance is a small patch of 10 short blades (0.25–0.45 units tall), so the ground reads as a carpet. `GroundCover` draws them in 40×40 chunks without shadow casting. In the vertex shader, a shared wind clock drives a cheap sway, and ground cover shrinks into the ground between 100 and 140 units from the camera; chunks entirely beyond that are hidden on the CPU.
- **Shaders are small and procedural.** The terrain keeps its vertex-color zones (grass, dirt, rock, worn ground, sand, lake bed) as the base; an `onBeforeCompile` patch on its standard material adds subtle world-space noise detail that fades with camera distance. Visible grass detail comes from the instanced ground cover. Water is a custom `ShaderMaterial` (color and opacity by depth, a thin shoreline foam line that gently moves in and out, fog; the open surface is deliberately calm). No textures are downloaded.
- **Simulation state vs. rendering.** `gameStore` holds the `@roe/sim` world, the `SimContext`, the current `GameState`, the state one tick earlier (`previous`) and the state heights. `dispatch(command)` validates immediately (for UI feedback) and queues the command with the local player as issuer; `advance()` runs one `stepGame` tick with the queue, exactly like the server. Later `dispatch` will also send the command to the server. The store changes 10 times per second, so subscribers select narrowly: `state.buildings` and `heights` keep their references unless buildings change, which keeps terrain, instancing and React from redoing work every tick. UI-only state (the construction tool, the selection) lives in `placementStore` and `selectionStore` and is never sent anywhere. The placement ghost validates with `validateCommand` (placement rules plus cost, exactly as the server) and re-checks when the cell, rotation, buildings or the local stock change. The `ResourceBar` selects the local player's stock object, which only changes on payments and deliveries, and flashes each +/- delta (previous stock kept in state, compared during render).
- **Tick loop and interpolation.** `SimulationDriver` (mounted first in the canvas) advances the simulation from the render loop with a fixed-timestep accumulator: one `advance()` per 100 ms of frame time, at most 250 ms caught up after a pause (a hidden tab pauses the game). It publishes `simClock.alpha`, how far rendering is between the previous and the current tick. Renderers interpolate positions with it, so units move smoothly at any frame rate, one tick (100 ms) behind the simulation.
- **Units are instanced and never re-render React.** `UnitFrameDriver` (mounted right after `SimulationDriver`) computes every unit's frame once: interpolated position, ground height, smoothed facing (walking direction, or the site while building) and activity, published in `renderedUnits` / `renderedUnitList`. Unit renderers, selection rings and screen picking only read that.
- **Character models with baked animation.** Serfs are KayKit Adventurers characters (`CHARACTER_PACK` in game-data: the Ranger without cape and quiver, scale 0.62 (~1.4 units tall), clips per activity). Three.js can't instance skinned meshes, so `bakeCharacter` prepares them once at load time:
  - It merges the visible body parts into one geometry, pre-transformed by their bind matrices, with skin indices remapped by bone name.
  - It samples every clip at 30 fps into a float "bone texture": one row per frame, four texels (matrix columns) per bone, holding `bone.matrixWorld · boneInverse`.
  - `bakedSkinMaterial` patches a `MeshStandardMaterial` (and a matching depth material for shadows) so the vertex shader skins each instance from that texture. Per instance, `aAnim` holds the clip's first row, frame count, a phase offset and the playback rate; neighbouring frames are blended.
  - All serfs are one instanced mesh: one draw call, plus one for shadows. Lighting, fog and shadow receiving stay three.js's own.
  - The player color replaces texels where blue dominates (the serf's scarf), at the texel's brightness.
  - The walk clip's playback rate comes from its measured stride, so the feet don't slide. The clips are played in place; while a foot is planted (the lowest 8% of its height range), it moves backwards as fast as the body would move over the ground. That speed, measured at 120 fps over both feet, times the clip duration is the stride per cycle, and the rate is `speed · duration / stride`.
  - Unit picking (`screenPick`) and the placeholder serfs take their size from `CHARACTER_PACK.serf` (`height` · `scale`).
  - While the files load (Suspense), and if they fail (an error boundary), `PlaceholderUnits` draws the primitive serfs with procedural animation.
  - Rig compatibility was checked at import: all six Adventurers characters share the 23 Rig_Medium bones and rest pose of the Character Animations pack, so every clip plays on every character.
- **Construction sites.** `World` sends complete buildings to the instanced `Settlement` and sites to `ConstructionSites`. Each site draws a dirt plate, a wooden scaffold (merged boxes, capped at 4.5 units so tall parts like mill sails rise above it), the real model with cloned materials and one clipping plane (`renderer.localClippingEnabled`, double-sided so the cut shows the inside of the walls), and a camera-facing progress bar. In `useFrame` it reads the site's progress from the store, interpolated between ticks, and moves the clip plane and the bar; there is no React re-render per tick. When a site finishes, the `buildings` array changes once and the building moves into the instancing.
- **Mouse scheme.** Left button: click selects a unit or building (Shift toggles units), drag box-selects own units (Shift adds). Right button: a click without movement commands the selected units (on an own construction site `assignBuilders`, anywhere else `moveUnits` to the ground point); a drag rotates the camera. Middle drag, WASD/arrows and, when enabled in the settings, the screen edges (10 px band, paused while a button is held) pan the camera, so a trackpad without a middle button works. Esc clears the selection; while the construction tool is active, its own input owns every press.
- **Pointer target, cursors and command feedback.** `pickPointerTarget` (in `input/`) picks every layer under a screen point with one ray: an own unit (screen space), the first building box, and the ground point with its walkability (nav grid), its reachable destination (`nearestWalkablePoint` from `@roe/sim`, the same goal rule as `findPath`) and the tree or rock there. Click-select, the right-click command (`commandIntent`) and the hover cursor (`cursorFor`) all read it, so the cursor always shows what a click would do. `useHoverCursor` re-picks at most once per frame and only when the pointer, camera matrix, game state, selection or tool changed, and writes the canvas `data-cursor` attribute only when the kind changes. `ui/cursors/cursors.css` maps kinds to original SVG cursors (drawn on a 32-unit grid, exported at 64 px, shown via `image-set(... 2x)`). Right-clicking water or a steep slope moves the units to the nearest walkable spot (the marker shows that spot). Right-clicking another building, a tree or rock, or a point with nothing reachable sends nothing; the sim would accept some of these moves, so this is a client-side choice. Tree and rock targets are already classified; `RESOURCE_CURSOR` maps them to the axe/pickaxe in Phase 5. Accepted commands push an event to `commandFeedback`; `CommandMarkers` drains it in `useFrame` into fixed pools: a 16-slot instanced ground quad with a procedural shader (move: chevrons converging and a closing ring, tilted to the terrain; site: an outline shrinking onto the footprint and pulsing) and four hammer sprites (the cursor SVG rasterized at 256 px) above the site. Nothing re-renders React.
- **Selection.** `useSelectionInput` decides what a press means. Units are picked in screen space (`screenPick`): their interpolated positions are projected with the camera and compared in pixels. That is cheap for hundreds of units and independent of the instanced meshes. Buildings are picked with a ray against each oriented footprint box with a rough height (`pickBuilding`). `Units` publishes the positions it drew each frame in `renderedUnits`, which `SelectionRings` (one instanced mesh, mounted after `Units`) and picking read. The box rectangle is a DOM element moved directly (`dragBox`), not React state. `selectionStore` holds the ids. The HTML `SelectionPanel` shows the selected serfs (working, walking, idle) or the selected building; at the player's own Town Hall it offers "Recruit serf" with the serf count.
- **Placing buildings.** The construction menu (HTML) picks a buildable type. `PlacementPreview` casts the mouse ray against the shared height field, snaps to the 1-unit grid, and colors a ghost green or red using the same `checkPlacement` the server runs (re-checked only when the cell, rotation or state changes). A click without movement places the building, Shift keeps the tool active, R rotates by 90°, and Esc or a right click cancels. Camera drags still work, because only near-motionless presses count as clicks.
- **Incremental updates after a placement.** Only terrain vertices within 7 units of the new footprint are re-sampled; normals and colors are recomputed only for those vertices and their direct neighbours (same area-weighted normals as a full pass, using a cached vertex-to-triangle map), and only the changed buffer ranges are uploaded. Trees, grass and props keep their generated heights outside the changed areas (`GroundLevel`), and only chunks touching those areas are rebuilt, so unchanged instance buffers aren't re-uploaded. Grass and props under the new building are removed.
- **The sun follows the camera.** The directional light and its target track the camera focus point. The shadow frustum scales with zoom in steps of 10 units, and its position is snapped to whole shadow-map texels so shadow edges don't shimmer while panning.

### `@roe/server`: the authoritative server

A Colyseus server. It uses only `@colyseus/core`, `@colyseus/ws-transport` and `@colyseus/schema`, not the `colyseus` meta-package, which would pull in Redis, the monitor and other extras. `MatchRoom` is a placeholder 2–4 player room whose synchronized `MatchState` holds the map id and the player list.

The room runs `stepGame` at `SIMULATION_TICK_RATE` via `setSimulationInterval`. It accepts `command` messages: it parses the payload with `parseCommand`, takes the issuer from `client.sessionId` (never from the message), queues the command for the next tick, and replies with `commandResult` once the tick has applied it. Its starting settlement is neutral for now, so nobody can recruit there yet. Syncing the state to clients comes with the multiplayer phase.

## Multiplayer model (planned)

```text
client input ──► command ──► server validates (shared rules) ──► applies to state
                                                                       │
client renders ◄──────────── state patches (Colyseus schema) ◄─────────┘
```

- Clients send **commands** ("build X at Y", "move units to Z") and never send state.
- The server checks every command against `@roe/shared` rules: resources, placement, ownership and cooldowns.
- The simulation runs at a fixed tick (`SIMULATION_TICK_RATE`).
- The client may predict locally using the same shared rules, then reconcile with the server state.
- Procedural content such as map decorations is generated from seeds, so it never has to be sent over the network.

PostgreSQL will store persistent player data (accounts, profiles, match history). Live match state stays in memory in the room.

## Workspace package resolution

Workspace packages are consumed **directly from their TypeScript sources** during development and type checking. A custom export condition makes this possible:

```jsonc
// packages/shared/package.json
"exports": {
  ".": {
    "@roe/source": "./src/index.ts",   // dev / typecheck
    "types": "./dist/index.d.ts",      // compiled consumers
    "default": "./dist/index.js"
  }
}
```

| Consumer                | How it enables `@roe/source`                         |
| ----------------------- | ---------------------------------------------------- |
| TypeScript (`tsc`, IDE) | `customConditions` in `tsconfig.base.json`           |
| Vite (client)           | `resolve.conditions` in `apps/client/vite.config.ts` |
| tsx (server dev)        | `--conditions=@roe/source` in the `dev` script       |
| Node (server prod)      | not enabled, so it uses the compiled `dist/`         |

Each package's `tsconfig.build.json` clears `customConditions`, so production builds compile against the other packages' `dist/` output. `pnpm build` (`pnpm -r build`) builds packages in dependency order.

What this gives you: hot reload across packages, go-to-definition that lands in source, and no build step before `pnpm dev`.

## Adding a new package

1. Create `packages/<name>/` with `package.json` (name `@roe/<name>`, the `exports` map above, and `build`, `typecheck` and `clean` scripts).
2. Copy `tsconfig.json` and `tsconfig.build.json` from `packages/shared`.
3. Add it as a dependency with `"@roe/<name>": "workspace:*"` and run `pnpm install`.

## Code conventions

- Strict TypeScript, including `noUncheckedIndexedAccess`, with `verbatimModuleSyntax` (always `import type` for types).
- Relative imports in `shared`, `game-data` and `server` use the `.js` extension (NodeNext resolution). The client uses bundler resolution without extensions.
- One React component per file, named after the component.
- Formatting is handled by Prettier only; ESLint does not check style.
