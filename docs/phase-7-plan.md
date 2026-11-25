# Phase 7 plan: fortifications

Approved 2026-11-25, with two additions (decision 9 and 10). Walls drawn with the mouse, gates, breaching, and towers upgraded from weak wooden to strong stone, crossbow, magic and fire towers.

## Milestones

| #   | Scope                                                                                                                                       | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 7.1 | Walls in the sim: wall types in game-data, `placeWall`, segments, nav blocking, health, construction, cut-off check, tests                  | ✅     |
| 7.2 | Drawing walls: mouse drag, live preview (green / red, total cost, cut-off warning), posts, instancing, damage and ruins. **Browser review** | ✅     |
| 7.3 | Gates: a wall segment becomes a gate; the owner's units pass, others don't                                                                  |        |
| 7.4 | Breaching: enemies with no route attack the wall in the way; a wave breaks into a walled village                                            |        |
| 7.5 | Wooden tower: shoots by itself, arrows from the top, range ring when selected. **Browser review**                                           |        |
| 7.6 | Tower upgrades: wood → stone → crossbow, magic or fire; upgrade command, panel button, changed look                                         |        |
| 7.7 | Balance and check: the wave against walls and towers, performance with 300+ segments, docs                                                  |        |

### 7.1 notes (done 2026-11-25)

- As planned. Details decided while building: walls don't flatten the terrain; a line with some blocked segments builds the valid ones (the red ones are skipped); segments already standing are skipped and not charged; fallen segments don't count as "buildings lost". 21 new sim tests, including serfs finishing whole rings with corners and diagonals.
- Walls aren't in the construction menu until 7.2.

### 7.2 notes (done 2026-11-25, accepted)

- Changed at the review: an unaffordable line isn't refused; as many segments as the stock pays for are built, from the start of the drag (`budgetWall`), and the preview shows the rest in amber.

- As planned. Posts stand at ends, corners, junctions and material changes. Stone posts are `building_tower_base` (yellow variant, recolored); palisade posts are a primitive log (temporary). Walls are scaled per axis in game-data: stone 2.2 high and 1 deep, palisade 1.9 and 0.45. The construction menu's buttons got narrower so 15 fit in two rows.
- Checked in headless Chrome, dev build: real mouse drags (preview, blocked segments and reason, continuing from a wall end, right-click cancel, cut-off warning while dragging and after release), both tiers half built and built, selection, damage, rubble and a breach by dev-spawned enemies. Test shortcuts: the stock was filled, and one ring was marked complete for the damage check. Production build: one drag drew a segment and paid for it.

## Decisions

1. **Wall angles:** the drag snaps to 8 directions (every 45°) on the 1-unit grid and becomes 2-unit segments, so wall placement uses eighth turns. No free angles.
2. **A segment is an ordinary building,** so damage, ruins, fog ghosts, attacks, construction and instancing work unchanged, and a wall falls piece by piece.
3. **Two wall tiers:** wooden palisade (cheap, weak, quick) and stone wall (strong, slow). Upgrading a palisade in place waits for Phase 8.
4. **Gates:** the nav grid marks gate cells with their owner; the owner's units pass, everyone else treats them as walls until they are destroyed. No manual open / close yet.
5. **Breaching:** when no route to the target exists, enemies plan a route that may cross enemy walls at a high cost, attack the first segment in the way and go on once it falls. Deterministic, in the sim.
6. **Towers shoot by themselves:** no garrisons, no wall walkways. They target the nearest enemy unit, preferring one that is attacking.
7. **Tower upgrades** are a narrow system for towers only (Phase 8 generalizes it). An upgrade costs resources and time, and the tower doesn't shoot meanwhile. No research; `requires` stays unused.

   ```text
   Wooden archer tower ──► Stone tower ──┬─► Crossbow: slow, high single-target damage, ignores armor
                                         ├─► Magic: hits for sure, short slow on the target
                                         └─► Fire: area damage plus a brief burn
   ```

8. **Models** (KayKit Medieval Hexagon Pack, CC0, GLBs unedited): stone walls `wall_straight` and `wall_straight_gate`, posts `tower_base` scaled down; palisade the wood fence scaled up in config; wooden tower `tower_base` tinted wooden, stone tower `tower_A`, the three specials `tower_B` told apart by roof color, a top prop and the projectile (marked `temporary`). The looks are checked in the browser in 7.2 and 7.5.
9. **Cut-off warning:** placing a wall warns (it doesn't block) when it would cut off the player's own units or a building site from the rest of the map without a gate to pass through.
10. **All tower and wall numbers live in game-data only** (costs, health, armor, build time, range, damage, cooldown, projectile, effects, upgrade costs and times).

## Not in scope

Siege engines (planned after this phase), repair (Phase 8), wall walkways and garrisons, drawbridges and moats, palisade → stone upgrade, AI that plans sieges (Phase 9).
