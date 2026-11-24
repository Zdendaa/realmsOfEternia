# Phase 5 plan: economy

_Approved 2026-11-24. Work through the milestones in order; each one is verified (check, build, browser check), documented in `status.md` / `architecture.md`, committed and pushed separately. Tick the status column here when a milestone is done._

## Scope

Resource storage, paid construction with physical material delivery, gathering by serfs, workers in production buildings, a carrying visual and a top resource bar. Everything gameplay-related lives in `@roe/sim`, is deterministic (integers, tick timers, id tie-breaks), runs in the same `stepGame` tick on client and server, and is unit-tested.

## Decisions

1. **Stockpile: one global stock per player, physical drop-off.** `GameState` holds one stock per player for all six resources (wood, stone, iron, gold, food, mana). Goods count only once a carrier drops them at a storage building. For now the **Town Hall is the only storage**; construction materials are picked up there. Per-storage inventories are not planned.
2. **Costs are deducted at placement.** Placing a site removes its full cost from the stock and commits it to the site. A site that can't be afforded is invalid (`notEnoughResources`, red ghost, "Not enough wood").
3. **Delivery: one unit per trip, progress gated by delivered materials.** Each unit of material is one carry trip from storage to the site. Build progress can't exceed the delivered share (`workDone ≤ workRequired × delivered / total`). Serfs assigned to a site (manually or automatically) choose each time: fetch a missing unit if none is already on its way, otherwise build if work is available, otherwise wait. **Carry capacity is a game-data value** (default 1), tunable.
4. **Finite trees and rocks.** Sparse `GameState.resourceNodes: Record<decorationId, remaining>` (absent = untouched, 0 = depleted). Amounts scale with decoration size (proposed: tree 3–5 wood, rock 6–12 stone). Depleted nodes are cleared from the nav grid (incrementally, by the sim context) and ignored by placement; the client rebuilds only the affected tree chunk. Rocks shrink as they are mined; trees vanish when depleted. Only nodes inside the playable area are harvestable.
5. **Workers** (second villager type) spawn at the entrance when a production building completes: one per building, not player-controllable. Loop: own building → resource (within a work radius of the building) → back to own building (short processing step) → nearest storage → repeat. First buildings: **lumbermill (wood)** and **quarry (stone, KayKit `mine` model)**. Housing and food come in later phases.
6. **Carrying visual.** At load time `bakeCharacter` builds a combined `carry` clip: legs and hips from `Walking_B`, spine and arms from `Holding_A`; it is baked like the other clips (stride-matched, no runtime cost). Carried bundles are **our own low-poly meshes built in code** (logs, stones, sacks), drawn as instanced meshes rigidly attached to a rig bone (`chest` or `handslot.*`) in the vertex shader, reusing the baked bone texture (one draw call per resource type).
7. **Worker look:** the KayKit Adventurers **Rogue without cape** (same Rig_Medium skeleton, separate instanced mesh).
8. **Resource bar:** top center, six resources with original SVG icons in the cursor style; re-renders only when a stock changes; short +/- flash on drop-off and payment. The construction menu shows unaffordable costs in red.
9. **Storehouse postponed** to the end of the phase or a later phase (no model in the Builder Pack).

## Starting numbers (game-data, tunable)

- Starting stock: wood 30, stone 20, gold 5, food 20, iron 0, mana 0.
- Chop 3 s per wood, mine 4 s per stone, carry capacity 1.
- Expected: about 8–10 wood per minute with 5 serfs and a forest about 30 units from the Town Hall.

## Milestones

| #   | Scope                                                       | Status |
| --- | ----------------------------------------------------------- | ------ |
| 5.1 | Stockpile and paid costs                                    | ✅     |
| 5.2 | Finite trees and rocks, serf gathering, axe/pickaxe cursors |        |
| 5.3 | Carrying visual                                             |        |
| 5.4 | Material delivery to construction sites                     |        |
| 5.6 | Workers: lumbermill and quarry                              |        |
| 5.5 | Storehouse (postponed; last or a later phase)               |        |

### 5.1 Stockpile and paid costs

- game-data: starting resources (`economy/startingResources.ts` or with the settlement), resource definitions get display data if needed.
- sim: `GameState.stocks: Record<PlayerId, ResourceAmounts>` (integers, all six resources) created in `createInitialState` for the owner; `placeBuilding` deducts the cost; validation issue `notEnoughResources`; helpers `canAfford`, `subtract`. Tests: placement fails without resources, succeeds and deducts with them, determinism unchanged.
- client: `ui/ResourceBar.tsx` + `ui/icons/*.svg` (original), construction menu shows unaffordable costs in red, placement hint message.

### 5.2 Finite trees and rocks, serf gathering

- game-data: node amounts by kind and scale, gather timings, carry capacity.
- sim: `resourceNodes` state; `gather {unitIds, nodeId}` command (parsed by `parseCommand`); serf task `gather` with phases (to node → working → to storage → drop-off → next node nearby, deterministic nearest search via the obstacle index); `UnitInstance.carrying: { resource, amount } | null`; nav grid clears depleted cells (`syncContext` detects the `resourceNodes` change); placement ignores depleted nodes. Tests: gathering fills the stock, nodes deplete and unblock nav, determinism.
- client: right-click a tree/rock with serfs selected → `gather` (axe/pickaxe cursors via `RESOURCE_CURSOR`), command marker, `Trees`/`Rocks` drop depleted nodes (chunk rebuild) and shrink rocks, chop/dig clips while working.

### 5.3 Carrying visual

- `bakeCharacter`: combined `carry` clip (legs/hips from `Walking_B`, upper body from `Holding_A`), stride-matched playback.
- `carryBundles.ts`: low-poly log/stone/sack geometries built in code, instanced, rigidly skinned to one bone in a `bakedSkinMaterial` variant.
- Rendering picks `carry` while walking with a load; activity data from the sim (`carrying`).

### 5.4 Material delivery to sites

- sim: per-site `delivered` amounts; in-transit units derived from carriers; progress gated by the delivered share; builders fetch / build / wait; carriers pick up at the Town Hall (stock already deducted at placement). Tests: a site can't finish without deliveries, deliveries complete it, multiple sites don't starve each other.
- client: site panel shows delivered / needed materials; optional material piles on the site's dirt plate.

### 5.6 Workers: lumbermill and quarry

- game-data: `UNITS.worker`; building `production` config (resource, node kind, work radius, timings); new `quarry` building with the `mine` model; character pack entry for the worker (Rogue without cape).
- sim: worker spawn on completion (linked to the building, `workplaceId`), `units/workerBehavior.ts` loop, workers can't be commanded (commands ignore them). Tests.
- client: second baked character instanced mesh, selection panel info for production buildings (worker state, output).

### 5.5 Storehouse (postponed)

A storage building as an extra drop-off point. Needs a model (none in the Builder Pack); revisit at the end of Phase 5 or later.

## Not in scope

Per-storage inventories, production chains beyond gathering (sawmill, blacksmith), housing and food consumption, site cancellation/refunds, recruit costs.
