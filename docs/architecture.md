# Architecture

This document explains how the codebase is structured and why. Read it before you add a new package or a new kind of game system.

## Goals

1. **Multiplayer from day one.** Every gameplay rule must be able to run on the server.
2. **Clear separation.** Rendering, game logic, UI, networking and game data live in separate places.
3. **Data-driven content.** Races, buildings, units, upgrades and spells are defined as data, not hard-coded in logic.
4. **Small, working increments.** Add an abstraction when a second real use appears, not before.

## Packages

| Package          | Runs in          | May depend on         | Must not contain                               |
| ---------------- | ---------------- | --------------------- | ---------------------------------------------- |
| `@roe/shared`    | browser and Node | nothing               | DOM, Node APIs, React, three.js, `Math.random` |
| `@roe/game-data` | browser and Node | `@roe/shared` (types) | logic beyond simple derived values             |
| `@roe/client`    | browser          | `shared`, `game-data` | authoritative game decisions                   |
| `@roe/server`    | Node             | `shared`, `game-data` | rendering or UI code                           |

### `@roe/shared`: types and rules

Pure functions and types: IDs, vectors, constants (`SIMULATION_TICK_RATE`, `MAX_PLAYERS`), the seeded RNG (`createRng`), stateless value noise (`fractalNoise2D`), and map generation:

- `createHeightField(map).getHeightAt(x, z)` returns the terrain height at any point. The heightmap is never stored or sent over the network; it is recomputed from the map seed. Use it for everything that sits on the ground: the terrain mesh, decorations, units, buildings and the camera focus.
- `flattenHeightField(heights, footprints)` wraps a height field so the ground under each placed footprint is perfectly flat (levelled to the original height at its center) and blends back to the terrain within a few units. A building's own footprint always wins over a neighbour's blend band. Settlement buildings use it now; player construction will reuse it.
- `scatterDecorations(map, { heights, isBlocked })` places trees and rocks. Trees cluster into forests through a noise mask, and the central settlement area (`map.settlement`) stays empty. `heights` lets them sit on flattened terrain, and `isBlocked` keeps them off buildings and paths.
- `sampleCatmullRom(points, spacing)` and `distanceToPolyline(...)` define path shapes the same way on every machine.
- Map layout, from the center outward: the flat settlement plateau, rolling hills across the playable square (`map.size`), then a non-playable border ring (`map.border`) of forested mountains. The mountains continue past the ring and fade into the fog, so the world never visibly ends. `isInPlayableArea(map, x, z)` tells the two zones apart. Border trees are scenery only.

Determinism is required. With the same input, a rule function must return the same output on every machine. Always use `createRng(seed)` and never `Math.random()`.

### `@roe/game-data`: definitions

Static configuration written as typed object literals with `as const satisfies SomeDefinition`. That keeps literal types while still checking the shape. Races, upgrade tiers, units and spells will go here too. Current contents:

- `PROTOTYPE_MAP`: terrain, forest and border settings.
- `BUILDINGS`: id, name, `modelPath`, `footprint` (world units), `scale` and `rotationOffset`. Footprints are measured from model bounding boxes. By convention every building's entrance faces local +Z.
- `PROTOTYPE_SETTLEMENT`: the hand-authored starting settlement, with building placements and dirt paths given as spline control points that end at building entrances.
- `MEDIEVAL_PACK`: the KayKit asset pack's folder, its world scale (pack unit × 3) and material color overrides by material name. The overrides are applied when models load, so the GLB files stay untouched.

### `@roe/client`: the game client

```text
src/
  main.tsx, App.tsx    bootstrapping and layout (canvas plus HUD overlay)
  render/              everything inside the <Canvas>
    GameCanvas.tsx     renderer, camera and scene root
    camera/            RTS camera (MapControls, key panning, bounds clamp)
    scene/             World, Terrain, Lighting, Trees, Rocks
  ui/                  HTML/CSS overlay; never imports three.js
  input/               input hooks (keyboard now; selection and commands later)
  state/               Zustand stores
```

Rules:

- **`render/` only visualizes.** It reads state and draws it. It does not compute gameplay outcomes.
- **`ui/` is plain React DOM** that sits over the canvas. It talks to the scene only through stores.
- **Per-frame values never go through React state.** Camera movement, animation and similar values are mutated inside `useFrame` or kept in refs, which avoids re-renders. Zustand stores hold values that change at human speed, such as settings, selection and menus.
- **Static props use chunked instancing.** `StaticInstances` uploads instance matrices once. Trees are split into 60×60 world-space chunks, each its own instanced mesh with its own bounding sphere, so chunks outside the camera or shadow frustum are skipped. Chunks share one geometry and material per part.
- **`world/createWorld.ts` composes the static world** from map data in a fixed order: buildings flatten the terrain, paths are sampled, then decorations are placed on the flattened ground away from buildings and paths. Every renderer and the camera use the resulting `world.heights`. When the server needs the same world, this composition should move into a shared layer.
- **Buildings are instanced per model part.** `Settlement` groups placements by type. `BuildingInstances` loads the GLB with `useGLTF` (preloaded, no Draco), applies the material overrides, and draws each mesh of the model as one instanced mesh, so six houses cost the same draw calls as one.
- **The sun follows the camera.** The directional light and its target track the camera focus point. The shadow frustum scales with zoom in steps of 10 units, and its position is snapped to whole shadow-map texels so shadow edges don't shimmer while panning.

### `@roe/server`: the authoritative server

A Colyseus server. It uses only `@colyseus/core`, `@colyseus/ws-transport` and `@colyseus/schema`, not the `colyseus` meta-package, which would pull in Redis, the monitor and other extras. `MatchRoom` is a placeholder 2–4 player room whose synchronized `MatchState` holds the map id and the player list.

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
