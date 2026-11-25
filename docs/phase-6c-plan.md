# Phase 6c plan: fog of war and win/lose

_Approved 2026-11-25. Follows [phase-6-plan.md](phase-6-plan.md); comes before Phase 7 (fortifications). Work through the milestones in order; each one is verified (check, build, browser check when visual), documented in `status.md` / `architecture.md`, committed and pushed separately. Tick the status column here when a milestone is done._

## Scope

Fog of war as in The Settlers and Warcraft: every spot of the map is **unexplored** (black), **explored** (grey fog: terrain and buildings as last seen, no units) or **visible** (in the current sight of the player's own units and buildings). Sight ranges per unit and building type in game-data. Visibility is designed so the multiplayer server can withhold hidden enemy state from clients (anti-cheat). Plus a first win/lose condition.

## Decisions

1. **Vision is a sim cache, not `GameState`.** A `Vision` per player next to the `SimContext`: a count grid (how many of the player's sight circles cover each cell), an explored bit per cell, and the last-seen state of other players' buildings. Updated from the state every tick, deterministic, never sent whole. The server keeps one per player; the client computes its own player's with the same code.
2. **Grid of 2 × 2 unit cells** (120 × 120 = 14,400 cells on the prototype map). Incremental stamping: a unit re-stamps its circle only when it changes cell (old −1, new +1); buildings stamp when placed and unstamp when they fall. Circular sight, no occlusion by hills or forests (later).
3. **Sight in game-data** (`sight`), separate from the engage range (`combat.sightRange` ≤ `sight`): serf and worker 7, swordsman and spearman 10, archer 12; buildings 8 by default, Town Hall 14. Monsters have no vision (they keep their engage ranges).
4. **Rendering: one full-screen fog pass.** After the scene, each pixel's world position is rebuilt from the depth buffer and darkened by a 120 × 120 fog texture (black / grey / clear). It covers terrain, trees, buildings, ruins and water in one place, with three.js built-ins only (render target with a depth texture, full-screen quad). The texture is uploaded only when the grid changes; two textures blend with the sim clock, so the fog moves smoothly. Units of other players outside visible cells aren't drawn at all, nor are their health bars, arrows (unless the shooter or the target is visible), picking and cursors. Other players' buildings in explored fog are drawn as last seen (ghosts stay until the spot is seen again). Own units and buildings are always drawn. Camps and waves stay hidden until seen.
5. **Minimap-ready:** the fog texture and the last-seen buildings are what a minimap needs; the minimap itself comes later.
6. **Attacks need sight:** an `attack` on a unit or building the issuer can't see is rejected (`notVisible`). Last-seen buildings in the fog can't be targeted.
7. **Multiplayer filtering:** `viewOf(state, vision, player)` returns what one player may know: everything of their own; other players' units only on visible cells; their buildings as current when visible, as last seen when explored; projectiles whose shooter or target is visible; ruins on explored cells; never enemy stocks or training queues. Tested, including "no enemy unit outside vision appears in a view". Sending views (per-client messages, with delta encoding) comes with Phase 10 multiplayer sync.
8. **Win/lose in the sim:** `GameState.outcome` per player (`playing`, `won`, `lost`), set once on the tick it is decided. Defeat: the player had a Town Hall and has none. Victory: the map's objective (prototype map: `clearMonsters`, i.e. every wave sent and every monster dead). Defeat is checked first. Afterwards the simulation keeps running for watching, and the player's commands are rejected (`gameOver`). The client shows a Victory / Defeat overlay with a few numbers (time, soldiers trained, enemies killed, buildings lost), "Continue watching" and "New game" (reloads the page for now).

## Milestones

| #    | Scope                                                                                    | Status |
| ---- | ---------------------------------------------------------------------------------------- | ------ |
| 6c.1 | Vision in the sim: grid, incremental stamping, explored, last-seen buildings, `sight`    | ✅     |
| 6c.2 | Fog rendering: fog pass, smooth transitions, hiding units / bars / arrows, ghosts        | ✅     |
| 6c.3 | Rules and filtering: attacks need sight, `viewOf` with anti-cheat tests, server visions  | ✅     |
| 6c.4 | Win/lose: `outcome`, map objective, commands blocked after the end, overlay with numbers |        |

### 6c.1 Vision in the sim

- game-data: `sight` on units and buildings.
- sim: `vision/vision.ts` (grid, incremental stamping, explored, last-seen buildings). Tests: reveal and hide, explored stays, ghosts, a building destroyed out of sight stays a ghost, determinism; benchmark.
- Done 2026-11-25: as planned. Visions live in `SimContext.visions` (players listed in `createSimContext(..., { visions })`) and `stepGame` refreshes them after each tick. A building counts as seen when its center or a footprint corner is in a visible cell. 7 tests; 200 moving units cost 0.04 ms per tick.

### 6c.2 Fog rendering

- client: `render/fog/` (fog texture from the local player's vision, full-screen pass), hiding other players' units, bars, arrows and picking, last-seen ghosts.
- Done 2026-11-25: as planned. The fog pass takes over rendering (`useFrame` priority 1): scene into a 4× multisampled half-float target with a depth texture, then a full-screen quad that rebuilds the world position, applies the fog, then tone mapping and the sRGB conversion. The drawn fog eases toward the vision (~0.3 s). Other players\x27 units out of sight are left out of `renderedUnits` (so no drawing, rings, bars or picking); buildings drawn and picked are the "known" ones (own + last seen), while the terrain keeps the real ones; ruins show once explored. A dev-only "Reveal map" switch. Checked in the browser: the fog around the village, a scout revealing the gold camp (the skeletons appear, explored path stays grey), the camp hidden again after the scout left, a ghost barracks staying after it was removed out of sight, the production build.

### 6c.3 Rules and filtering

- sim: `attack` needs a visible target (`notVisible`), `vision/view.ts` (`viewOf`) with anti-cheat tests. Server: one `Vision` per player.
- Done 2026-11-25: as planned. `checkAttack` asks the issuer\x27s vision when the context keeps one (a building counts when any footprint point is visible). `viewOf(world, state, vision)` also strips other players\x27 units of their route and destination (`movement`, move and attack-move goals, guard homes): a client must not learn where enemies are heading. The server keeps a vision per joined player (`ensureVision` / `dropVision`); views are not sent yet (Phase 10). The client\x27s attack cursor follows the same rule (no sword over ghosts). 6 tests, incl. the anti-cheat check on every tick of a moving battle for both players. Checked in the browser: the sword over an enemy barracks in sight, "blocked" over its ghost.

### 6c.4 Win/lose

- game-data: map `objective`. sim: `rules/outcome.ts`, `GameState.outcome`, `gameOver` issue. client: `ui/OutcomeOverlay.tsx`.

## Not in scope

A minimap, line of sight blocked by terrain or forests, sending views to clients (Phase 10), alliances and shared vision, save/load of explored areas.
