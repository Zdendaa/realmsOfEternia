# Realms of Eternia

Original 3D fantasy RTS for the browser (later Steam): Settlers-style economy plus Warcraft-style factions, heroes and combat; 2–4 player server-authoritative multiplayer. Humans are the first faction.

Read as needed: [docs/game-design.md](docs/game-design.md) (vision, systems, roadmap) · [docs/architecture.md](docs/architecture.md) (how the code works) · [docs/status.md](docs/status.md) (current phase, known limitations).

## Stack

TypeScript 6.0 (strict) · React 19 · Vite 8 · three.js r187 · React Three Fiber 9 · Drei 10 · Zustand 5 · Node + Colyseus 0.18 (core, ws-transport, schema) · vitest · pnpm workspaces. PostgreSQL later. TypeScript stays on 6.0 because typescript-eslint doesn't support 7.

## Run

pnpm isn't installed globally and Corepack can't download it (custom npm registry). Always use `npx pnpm@10`:

- `npx pnpm@10 dev` – client at <http://localhost:5173> (`dev:server` → ws://localhost:2567, `dev:all` → both)
- `npx pnpm@10 check` – typecheck + lint + format check + tests; `npx pnpm@10 build` – production build
- Stale Vite servers silently move to ports 5174+; kill old ones before browser checks.

## Packages (dependencies point one way)

`shared` ← `game-data` ← `sim` ← `client` / `server`

- `packages/shared` – pure math and primitives: types, seeded RNG, noise, height field, flattening, water, footprint geometry. No DOM, Node, React, three.js or `Math.random`.
- `packages/game-data` – declarative content only (`as const satisfies`): maps, buildings, props, resources, settlement layout, asset pack config.
- `packages/sim` – game simulation shared by client and server: `createWorld`, `GameState`, commands, `applyCommand`, placement rules. Unit-tested.
- `apps/client` – rendering (`render/`), HTML UI (`ui/`), input, Zustand stores (`state/`), cosmetic layers (`world/decorateWorld`).
- `apps/server` – Colyseus rooms; validates commands with `@roe/sim`.

## Architecture rules

- Gameplay rules live in `@roe/sim` and must be deterministic (seeded RNG only). Client and server run the same code.
- Commands never carry the player; the receiver attaches the issuer (server: `client.sessionId`). Parse untrusted input with `parseCommand`.
- Game state is plain, immutable data changed only through `applyCommand`. Rendering reads state; it never decides outcomes.
- Keep simulation state (`gameStore`) separate from UI-only state (`placementStore`, settings).
- Cosmetic layers (grass, props, worn ground) stay in the client and never affect gameplay.
- Per-frame values go through refs/`useFrame`, never React state.

## Development rules

- One meaningful milestone at a time. Inspect the code and explain the plan before substantial changes; ask before major architectural or gameplay decisions, decide small details yourself.
- Preserve working functionality; no unrelated config changes, no silent architectural changes, no temporary hacks as permanent architecture.
- Strict TypeScript, no giant components; configuration-driven game data; design gameplay for multiplayer.
- Avoid new dependencies unless agreed.
- Before calling a milestone done: run `check` and `build`; for visual changes, check the real result in the browser (headless Chrome with GPU: `--use-angle=metal`).
- Never invent test results; report exactly what was tested. Keep docs (architecture, status) updated.

## Assets and performance

- Only original or properly licensed assets (no copied game content). Primitives are for prototyping only.
- Current models: KayKit Medieval Builder Pack 1.0 (CC0) in `apps/client/public/assets/models/medieval/`, GLB only. GLBs are never edited; colors/roughness are adjusted via `MEDIEVAL_PACK.materialOverrides`. Every building's entrance faces local +Z.
- macOS blocks reading `~/Downloads`; ask the user to move files into the repo.
- Think RTS scale: instancing (chunked, culled), spatial indexes, no unnecessary re-renders, incremental updates instead of rebuilds, efficient ticks and network sync. Measure before and after optimizing.

## Working with the user

React/TypeScript frontend developer, not a game developer: explain important technical decisions, not basic programming. For each milestone: inspect → plan → explain key decisions → implement → test → browser check if visual → report exactly what changed, how to run/test it, limitations and next steps. With several good options, recommend one and say why. Prefer concrete, actionable answers. Reply in the user's language (Czech or English). Commit after each verified step, push after each commit. Never force-push.
