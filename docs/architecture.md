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
- **Game state** (`GameState`) is plain, serializable data: building instances (id, type, position, rotation, owner, status) and the next entity id. The starting settlement becomes the first instances. `createStateHeights(world, state)` is the terrain flattened under every building in that state.
- **Commands** are what a client sends, for example `{ type: 'placeBuilding', building, x, z, quarterTurns }`. A command never contains the player: the receiver attaches the issuer (the server takes it from the network session), so a client can't act for someone else. `parseCommand(unknown)` turns an untrusted message into a command, copying only known fields.
- **`applyCommand(world, state, issuer, command)`** validates and executes a command purely: it returns a new state, or the unchanged state plus the failed rules. `validateCommand` runs only the checks.
- **Placement rules** (`checkPlacement`, tunable via `PLACEMENT_RULES`): a known and buildable type; the center on the 1-unit grid; rotation in whole quarter turns; inside the playable area; not in or right next to water; at most 1.5 units of height difference under the footprint; a 1-unit gap to other buildings (rotated-rectangle overlap test); clear of paths; and not on trees or rocks (trees block placement and are never removed). Spatial indexes over trees, rocks and path samples keep the checks fast.
- **Tests:** `pnpm test` runs vitest on small synthetic maps (flat ground, a known lake and path, an injected tilted terrain for the slope rule).

### `@roe/client`: the game client

```text
src/
  main.tsx, App.tsx    bootstrapping and layout (canvas plus HUD overlay)
  render/              everything inside the <Canvas>
    GameCanvas.tsx     renderer, camera and scene root
    camera/            RTS camera (MapControls, key panning, bounds clamp)
    scene/             World, Terrain, Water, Paths, Lighting, Trees, Rocks, Sky
    scene/settlement/  Settlement, ModelInstances (GLB loading, overrides, instancing)
    placement/         PlacementPreview (ghost model, validity), groundPick (ray vs height field)
    shaders/           shared GLSL snippets (value noise)
  world/               decorateWorld: cosmetic layers (props, worn ground, grass) on top of the sim world
  ui/                  HTML/CSS overlay; never imports three.js
  input/               input hooks (keyboard, placement clicks vs camera drags)
  state/               Zustand stores: gameStore (simulation), placementStore and settings (UI only)
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
- **Simulation state vs. rendering.** `gameStore` holds the `@roe/sim` world, the `GameState` and the matching state heights. Its `dispatch(command)` runs `applyCommand` with the local player as issuer; later it will also send the command to the server. Rendering only reads this state: `World` turns building instances into placed models, and terrain, trees, grass, paths and water follow `heights`. UI-only state (the selected building, rotation, preview validity) lives in `placementStore` and is never sent anywhere.
- **Placing buildings.** The construction menu (HTML) picks a buildable type. `PlacementPreview` casts the mouse ray against the shared height field, snaps to the 1-unit grid, and colors a ghost green or red using the same `checkPlacement` the server runs (re-checked only when the cell, rotation or state changes). A click without movement places the building, Shift keeps the tool active, R rotates by 90°, and Esc or a right click cancels. Camera drags still work, because only near-motionless presses count as clicks.
- **Incremental updates after a placement.** Only terrain vertices within 7 units of the new footprint are re-sampled; normals and colors are recomputed only for those vertices and their direct neighbours (same area-weighted normals as a full pass, using a cached vertex-to-triangle map), and only the changed buffer ranges are uploaded. Trees, grass and props keep their generated heights outside the changed areas (`GroundLevel`), and only chunks touching those areas are rebuilt, so unchanged instance buffers aren't re-uploaded. Grass and props under the new building are removed.
- **The sun follows the camera.** The directional light and its target track the camera focus point. The shadow frustum scales with zoom in steps of 10 units, and its position is snapped to whole shadow-map texels so shadow edges don't shimmer while panning.

### `@roe/server`: the authoritative server

A Colyseus server. It uses only `@colyseus/core`, `@colyseus/ws-transport` and `@colyseus/schema`, not the `colyseus` meta-package, which would pull in Redis, the monitor and other extras. `MatchRoom` is a placeholder 2–4 player room whose synchronized `MatchState` holds the map id and the player list.

The room accepts `command` messages: it parses the payload with `parseCommand`, takes the issuer from `client.sessionId` (never from the message), runs `applyCommand` on its own copy of the game state, and replies with `commandResult`. Syncing that state to clients comes with the multiplayer phase.

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
