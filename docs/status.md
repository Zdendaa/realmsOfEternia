# Project status

_Last updated: 2026-11-23._

**Current state:** Phase 2 (the visual world) is complete. The game renders a living prototype map with a starting village, but there is no gameplay yet: no units, construction, economy or multiplayer matches.

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
| 3     | Building placement and construction by the player                                 | ⏳ Next |

## What works today

- **World:** a 240×240 playable map generated deterministically from a seed. It has rolling hills, a flat 40×40 settlement plateau, noise-clustered forests, scattered rocks, one lake, and about 41,000 instanced grass patches (a short meadow carpet) with about 950 flower clusters. A ring of forested mountains surrounds the map and fades into the fog.
- **Settlement:** a Town Hall, a market, a well, six houses, a mill with two 2×3 fields and a lumbermill, connected by dirt paths. Two roads leave toward the map edge.
- **Rendering:**
  - sky dome, fog, ACES tone mapping
  - a sun at about 48° whose shadows follow the camera
  - chunked instancing for trees (5,700) and ground cover, and per-model instancing for buildings
  - procedural terrain detail and stylized water, with no texture downloads
- **Camera:** WASD and arrow keys or left drag to pan, right drag to rotate, mouse wheel to zoom. The focus point stays inside the playable area and on the ground.
- **Shared rules ready for Phase 3:** `createHeightField`, `flattenHeightField`, `entrancePoint`, `createBuildRules().isBuildable` and `createWaterMap().isWater`.
- **Server:** a Colyseus server with a placeholder 2–4 player match room. The client doesn't connect to it yet.
- **Performance:** a steady 60 FPS on an Apple M1 Pro in Chrome. Uncapped, frames take about 2.4 ms at the default view and 2.8 ms fully zoomed out.

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
- **Production build size:** the build includes the whole pack (about 4.6 MB), including 196 tile models that are never used.

### Architecture

- **Cosmetic layers are client-only by design:** props, worn ground and grass live in the client (`decorateWorld`); everything gameplay-relevant comes from `@roe/sim`.
- **Settlement data is hand-authored** for one map. There are no generators or editors yet.
- **Footprints are bounding boxes,** slightly larger than the buildings. Selection and collision will need finer shapes.
- **No automated tests yet.** Rules were verified with ad-hoc scripts and browser checks.
