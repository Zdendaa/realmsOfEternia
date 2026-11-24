# Phase 5b plan: economy depth

_Approved 2026-11-24. Follows [phase-5-plan.md](phase-5-plan.md) (5.1–5.6). Work through the milestones in order; each one is verified (check, build, browser check), documented in `status.md` / `architecture.md`, committed and pushed separately. Tick the status column here when a milestone is done._

## Scope

Population and recruit costs, a food chain (field → mill → bakery), gold and iron mines, and professions that look different. As in Phase 5, all gameplay lives in `@roe/sim`, is deterministic (integers, tick timers, id tie-breaks), runs in the same `stepGame` tick on client and server, and is unit-tested.

## Decisions

1. **Food chain: grain → flour → food.** Grain and flour are new resources in the global stock (category "goods"), shown as a small group in the resource bar after the six main resources. Goods move only through storage (Phase 5 decision 1); there are no per-building inventories.
2. **The field is the farm.** Each completed field gets a farmer. Cycle: sow the 6 plots one by one → grow (timer, the wheat rises in stages) → harvest plot by plot, 1 grain per plot, carried to storage. Field state is integers (`phase`, `plotsDone`, `timer`). **Fields become walkable** so the farmer can stand on the plots.
3. **Process buildings** (mill, bakery, mines) share one worker loop: when the input is in stock the worker **takes it from the stock as they set off** (a reservation, like construction costs paid at placement), fetches it from storage, works at the building, and carries the output to storage. Mill: 1 grain → 1 flour. Bakery: 1 flour → 2 food.
4. **Population is abstract:** capacity comes from completed buildings (Town Hall 10, house 4); used = serfs + workers. Both are derived from the state, never stored. A finished production building whose worker has no free housing stays empty ("Waiting for housing") until capacity frees up; waiting workers spawn in building-id order.
5. **Recruiting a serf costs 2 food and needs a free population slot** (new issue `noHousing`).
6. **Workers don't eat.** Only mines consume food (1 food per ore). The food chain never needs food itself, so there is no deadlock. General hunger and upkeep come with military (Phase 7/8), as "hungry = slower, never stops".
7. **Gold and iron mines** must be placed on a deposit (hand-authored map points, placement rule `needsDeposit`). **Deposits are infinite in 5b**; the data has an `amount` field so they can become finite later. Iron has no use until the blacksmith (Phase 8).
8. **Production config becomes a discriminated union:** `harvest` (lumbermill, quarry), `farm` (field), `process` (inputs, outputs, seconds, optional deposit).
9. **Professions look different through per-instance layers on one Rogue body:** hats built in code on the `head` bone (farmer straw hat, miller cap, baker toque, miner helmet), tools on `handslot.r` while working (axe, pickaxe, sickle; serfs get a hammer while building), a tunic tint per profession and new carried loads (grain sheaf, flour sack, bread basket, ore). Each prop type is one instanced draw call.
10. **Temporary models are flagged** in game-data (`temporary: true`, see below) and listed in `status.md`.

## Asset evaluation (2026-11-24)

Downloads live in `assets-incoming/` (gitignored). They were checked: model, texture, license and `.url` shortcut files only, no executables or scripts, no paths outside the archive. Only files a milestone uses are copied into `apps/client/public/assets/`, converted to GLB, with the license next to them.

**KayKit Medieval Hexagon Pack 1.0 FREE (CC0).** _All_ buildings are in the free tier, each in blue/red/green/yellow (roofs and trims): archery range, barracks, blacksmith, castle, church, home A/B, lumbermill, market, mine, tavern, towers (A, B, base, catapult), watermill, well, windmill. Neutral: grain field, scaffolding, construction stages A–C, destroyed building, dirt, bridges, fences, walls. Props: barrel, buckets, crates, flags, ladder, pallet, `resource_lumber`, `resource_stone`, sack, tent, weapon rack, wheelbarrow. Nature: hills, mountains, rocks, trees including cut stumps.

- **Buildings stand alone:** no hex base (lowest point at y = 0; some have their own small plinth or stairs).
- **Scale:** about **3.5×** (Builder Pack: 3×) gives matching door and character proportions; set per building.
- **Materials:** one shared texture atlas (`hexagons_medieval.png`) instead of named colors, so `materialOverrides` doesn't apply. Roofs can be recolored per player with texel recoloring (like the serf scarf).
- **Files** are `.gltf` + `.bin` + `.png`; they are packed into `.glb` when copied in.
- **Fits for 5b:** the **mine** (a rock mound with a timbered entrance and rails) for gold and iron mines; the **blacksmith** (a shed with a stone dome oven and chimney) reads as a bakehouse and is the preferred temporary bakery (decided in 5b.4; Phase 8 will want it as the real blacksmith). Later: blacksmith, windmill, tavern, church, homes A/B (Phase 7 upgrade levels), towers and walls (Phase 6), tree stumps.

**KayKit Adventurers 2.0 FREE accessories (CC0):** `axe_1handed`, `axe_2handed`, `mug_full`, `mug_empty`, plus weapons, shields, bows, staff, wand, spellbooks and quivers (Phase 8). No hammer, pickaxe or sickle, so those are built in code; the one-handed axe can be the woodcutter's tool (5b.2).

## Model mapping

| Need             | Model                                                                 | Note                                              |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Farm             | Builder `farm_plot` (field)                                           | `farm_wheat` is a separate mesh → growth stages   |
| Mill             | Builder `mill`                                                        | `mill_blades` separate mesh → spins while working |
| Bakery           | Hexagon `blacksmith` (preferred) or Builder `house` + code-built oven | **Temporary** either way                          |
| Gold / iron mine | Hexagon `mine`                                                        | Builder `mine` stays the quarry                   |
| Houses           | Builder `house`                                                       | Capacity 4                                        |
| Storehouse       | none                                                                  | Still postponed (5.5)                             |

## Starting numbers (game-data, tunable)

- Population: Town Hall 10, house 4. Start: 5 serfs + 4 workers (lumbermill, mill, two fields) = 9 of 34.
- Serf: 2 food.
- Field: sow 2 s per plot, grow 60 s, harvest 2 s per plot → about 4 grain per minute per field.
- Mill: 4 s per flour. Bakery: 6 s per 2 food. Mine: 8 s per ore, 1 food each.

_Decided 2026-11-24: the Hexagon blacksmith is the temporary bakery (5b.4)._

## Milestones

| #    | Scope                                                        | Status |
| ---- | ------------------------------------------------------------ | ------ |
| 5b.1 | Population and recruit cost                                  | ✅     |
| 5b.2 | Profession looks (hats, tools, tint, loads)                  | ✅     |
| 5b.3 | Farm: production union, farmer, grow cycle, grain            |        |
| 5b.4 | Mill and bakery: process loop, spinning blades, temp. bakery |        |
| 5b.5 | Gold and iron mines on deposits                              |        |
| 5b.6 | Visual migration to the Medieval Hexagon Pack                |        |
| 5.5  | Storehouse (from Hexagon props, after 5b.6)                  |        |

### 5b.1 Population and recruit cost

- game-data: `housing` per building (Town Hall 10, house 4), `RECRUIT_COST` (food 2).
- sim: `economy/population.ts` (`populationOf(state, player)` → used / capacity); recruit check adds `noHousing` and the cost; production buildings without a worker spawn one when capacity is free (building-id order, also for the starting settlement). Tests: the cap blocks recruiting, the cost is paid, a worker waits for housing and spawns once a house is finished, determinism.
- client: population indicator in the resource bar (red when full), recruit button with cost and the reason it's disabled, "Waiting for housing" in the production building panel.

### 5b.2 Profession looks

- game-data: professions in `CHARACTER_PACK` (hat, tool, tint, load); building production names its profession.
- client: `render/units/baked/professionProps.ts` (hats and tools on bones, instanced like the carry bundles), tunic tint and worker player color in `bakedSkinMaterial.ts`, serf hammer while building, new carried loads. The Adventurers axe is copied in (GLB). Applied to woodcutter and stonecutter first.
- Done 2026-11-24: the Rogue turned out to have no hood (bare head, long hair), so every profession got a hat, including the woodcutter (wool cap) and stonecutter (cloth cap). Team and tunic colors use exact atlas cells. The grain sheaf load comes with grain in 5b.3.

### 5b.3 Farm

- game-data: `production` union, `RESOURCES` category (grain, flour as goods), field farm config, walkable footprints.
- sim: `units/production/{harvest,farm}.ts`, per-building production state in `GameState`, nav treats walkable footprints as open. Tests: a full cycle yields 6 grain, determinism.
- client: wheat growth stages per plot, goods group in the resource bar, farmer animations (`Dig` / `Work_*`).

### 5b.4 Mill and bakery

- sim: `units/production/process.ts` with input reservation. Tests: the chain runs end to end, no input means waiting, one unit is never used twice.
- game-data: `bakery` (flagged temporary), building-scoped material overrides where needed.
- client: separate spinning blade mesh for the mill, bakery model (Hexagon blacksmith copied in as GLB, roof recolored), chimney smoke.

### 5b.5 Gold and iron mines

- game-data: deposits in the map, `goldMine` / `ironMine` (Hexagon mine copied in as GLB).
- sim: `needsDeposit` placement rule, process with a deposit and a food input. Tests.
- client: deposit markers (tinted rocks, ground tint), ghost hint ("Must be built on a gold deposit"), ore loads.

### 5b.6 Visual migration to the Medieval Hexagon Pack (added 2026-11-24, after 5b.5)

- **First:** evaluate style consistency with a side-by-side screenshot (current settlement vs. the same layout with Hexagon models) before switching anything.
- All buildings switch to Hexagon models, scaled per building (about 3.5×), with **player-colored roofs** through texel recoloring of the shared atlas (like the serf scarf).
- Construction sites use the Hexagon construction stages A–C and the scaffolding instead of our own scaffold.
- Felled trees leave Hexagon tree stumps.
- A **storehouse** assembled from Hexagon props (crates, sacks, barrels, pallet), which unblocks 5.5.
- Hexagon towers and walls are reserved for Phase 6 (fortifications), not used here.

## Not in scope

Worker hunger and upkeep, finite deposits, per-building inventories and direct building-to-building delivery, a sawmill or blacksmith, assigned homes, training times.
