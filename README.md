# Realms of Eternia

A browser-based 3D fantasy real-time strategy game. It combines:

- Settlers-style economy and city building
- fantasy races, heroes, magic and combat
- free-form walls, towers and castles
- real-time multiplayer for 2–4 players

> **Status:** Phase 2 (the visual world) is complete. The prototype map has terrain, forests, a lake and a starting village, but no gameplay yet. See [docs/status.md](docs/status.md) for details and known limitations.

---

## Requirements

| Tool    | Version                                                          |
| ------- | ---------------------------------------------------------------- |
| Node.js | 22.13+ (24 recommended, see `.nvmrc`)                            |
| pnpm    | 10.x                                                             |
| Browser | Any current browser with WebGL 2 (Chrome, Edge, Firefox, Safari) |

Install pnpm with one of these:

```bash
corepack enable          # uses the version pinned in package.json
# or
npm install -g pnpm@10
# or, with no global install, prefix every command with: npx pnpm@10
```

## Getting started

```bash
pnpm install
pnpm dev            # client at http://localhost:5173
```

To run the multiplayer server too:

```bash
pnpm dev:server     # Colyseus server at ws://localhost:2567
# or both at once
pnpm dev:all
```

### Camera controls

| Input            | Action |
| ---------------- | ------ |
| W A S D / Arrows | Pan    |
| Left mouse drag  | Pan    |
| Right mouse drag | Rotate |
| Mouse wheel      | Zoom   |

## Scripts

Run these from the repository root.

| Command           | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `pnpm dev`        | Start the client dev server (Vite, hot reload)         |
| `pnpm dev:server` | Start the game server in watch mode (tsx)              |
| `pnpm dev:all`    | Start client and server in parallel                    |
| `pnpm build`      | Production build of every package, in dependency order |
| `pnpm preview`    | Serve the production client build locally              |
| `pnpm typecheck`  | Strict TypeScript check of every package               |
| `pnpm lint`       | Run ESLint over the whole repo (`lint:fix` auto-fixes) |
| `pnpm format`     | Format with Prettier (`format:check` only verifies)    |
| `pnpm check`      | Run typecheck, lint and format check (use this in CI)  |
| `pnpm clean`      | Remove build output                                    |

To run a script in one package: `pnpm --filter @roe/client <script>`.

After `pnpm build`, start the production server with `pnpm --filter @roe/server start`.

## Repository layout

```
realms-of-eternia/
├── apps/
│   ├── client/                 @roe/client: browser game (React, Vite, R3F)
│   │   └── src/
│   │       ├── render/         3D only: canvas, scene, camera
│   │       │   ├── camera/     RTS camera controls
│   │       │   └── scene/      world, terrain, lighting, props
│   │       ├── ui/             2D HTML overlay (HUD, menus)
│   │       ├── input/          keyboard and mouse input hooks
│   │       └── state/          Zustand stores (client-side state)
│   └── server/                 @roe/server: authoritative Colyseus server
│       └── src/rooms/          match rooms and networked state schemas
├── packages/
│   ├── shared/                 @roe/shared: types and deterministic game rules
│   └── game-data/              @roe/game-data: maps and, later, races, units, buildings
├── docs/                       technical documentation
├── eslint.config.js            one flat ESLint config for the repo
├── tsconfig.base.json          strict compiler options every package inherits
└── pnpm-workspace.yaml
```

## Architecture overview

Packages depend on each other in one direction only:

```
@roe/shared  ←  @roe/game-data  ←  @roe/client
                                ←  @roe/server
```

- **`@roe/shared`** contains pure, deterministic TypeScript: types, constants, the seeded RNG and rule functions. It has no DOM, Node, React or three.js imports, so the client and the server run exactly the same code.
- **`@roe/game-data`** contains declarative definitions of maps and, later, races, buildings, units and spells. It holds data, not logic.
- **`@roe/client`** renders the game state and collects player input. It never decides gameplay outcomes on its own.
- **`@roe/server`** owns the authoritative match state. It will validate player commands against the rules in `@roe/shared`.

The client also separates rendering (`render/`), UI (`ui/`), input (`input/`) and state (`state/`). Networking will get its own `net/` folder when it is added.

For the full rationale, including the multiplayer model and how workspace packages are resolved, see [docs/architecture.md](docs/architecture.md). For the current progress and known limitations, see [docs/status.md](docs/status.md).

## Tech stack

| Area         | Technology                                                          |
| ------------ | ------------------------------------------------------------------- |
| Language     | TypeScript 6.0 (strict)                                             |
| Client       | React 19, Vite 8                                                    |
| 3D           | three.js, React Three Fiber 9, Drei 10                              |
| Client state | Zustand 5                                                           |
| Server       | Node.js, Colyseus 0.18 (`@colyseus/core`, `ws-transport`, `schema`) |
| Persistence  | PostgreSQL (planned, not yet integrated)                            |
| Tooling      | pnpm workspaces, ESLint 10 + typescript-eslint, Prettier            |

TypeScript is pinned to 6.0 because typescript-eslint does not support TypeScript 7 yet.
