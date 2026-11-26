# Phase 6b plan: cavalry, siege weapons, heroes

**Approved 2026-11-26** with every decision as recommended (decision 4 as written: heroes come from the map, not from recruiting). Changed at review: cavalry moved to the last milestone, so nothing waits on the horse asset.

Cavalry, the siege weapons that answer walls, gates and towers (rams and catapults), and heroes in the style of The Settlers 5: unique active abilities with cooldowns, experience and levels that unlock further abilities, and fallen heroes that their own units revive. All numbers below are starting values and live in game-data; all rules live in `@roe/sim`, so client and server run the same code.

## Milestones

| #    | Scope                                                                                                                           | Status  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 6b.1 | Siege in the sim: ram and catapult stats, a `siege` armor class, wall targeting, the catapult's minimum range and splash, tests | ✅ Done |
| 6b.2 | Siege Workshop, siege models (catapult from the Hexagon pack, temporary ram) and their animations. **Browser review**           | ⬜      |
| 6b.3 | Heroes in the sim: hero units, `startingHeroes` on the map, experience, levels 1–5, stats per level, tests                      | ⬜      |
| 6b.4 | Abilities: data-driven effects, the `useAbility` command, the Commander's and the Archmage's abilities, tests                   | ⬜      |
| 6b.5 | Fallen heroes: grave, revival by nearby own units, revive cursor and order. **Browser review**                                  | ⬜      |
| 6b.6 | Hero panel (abilities, cooldowns, experience, hotkeys), balance tests, performance, docs                                        | ⬜      |
| 6b.7 | Cavalry: knight on horse, Stable, mounted rider drawing. Needs the horse asset. **Browser review**                              | ⬜      |

## Units

- **Ram:** slow and sturdy; attacks only buildings (walls, gates and towers included), with a large bonus against them (about 3× a spearman's damage to buildings). High armor against arrows and tower shots; weak against infantry, and it can't fight back.
- **Catapult:** range 15, beyond every tower (11–13), so it can break towers safely; minimum range 5. A slow shot that lands where the target was, with splash, so moving units can dodge it. Low damage against units.
- Both are larger units (radius about 1) with their own armor class, `siege` (already reserved), and pick walls as targets on their own, which ordinary soldiers don't.
- **Cavalry ("Knight on horse"):** fast (speed 4.5, infantry 2.2), high health, strong against archers and siege engines. Spearmen already deal 2× damage to cavalry.

### As built (6b.1)

|                 | Ram                                  | Catapult                                                                                  |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Health / armor  | 500 / 6                              | 200 / 2                                                                                   |
| Speed / radius  | 1.4 / 1                              | 1.3 / 1                                                                                   |
| Attack          | 34 every 2.5 s, ×4 against buildings | 16 every 6 s, ×10 against buildings; range 15, minimum 5, splash radius 1.5, rock speed 9 |
| Cost / training | 10 wood, 3 iron / 30 s               | 12 wood, 4 iron, 3 gold / 40 s                                                            |

- Simulated: a ram breaks a stone wall segment (1,400 health) in 26.9 s; a catapult destroys a stone tower (1,200) in 45 s without being hit.
- Arrows and wooden tower shots do 2 damage to a ram. Swords, spears and skeleton blades hit siege engines double.
- A catapult's rock hits only enemies. Its splash also reaches the wall segments on both sides of the one it hits, so it wears down three at once.
- Large units and pathfinding: a ram walks through a gap one segment (2 units) wide. Paths are still planned for point-sized units, so between buildings a ram can pass a 1-unit slot, overlapping both. The clearance wasn't widened.

## Heroes

- **Commander** (Knight model, two-handed sword): _Rally_ (nearby own units deal more damage and walk faster, level 1), _Shockwave_ (area hit with a short stun, level 3), _Last Stand_ (nearby own units take much less damage for a short time, level 5).
- **Archmage** (Mage model, staff; no other unit uses it): _Fireball_ (area damage, level 1), _Frost Nova_ (slows enemies in an area, level 3), _Mass Heal_ (level 5).
- **Pathfinder** (ranger with a crossbow): _Eagle Eye_ (reveals an area through the fog for 15 s, level 1), _Volley_ (rain of arrows, level 3), _Sapper Charge_ (heavy damage to one building or wall, level 5). Defined in game-data but not given by the prototype map, so it is ready for later maps.
- Heroes stand out by size (1.2×), a golden ring and their own gear.

## Key decisions (recommendation first)

1. **Siege crew:** the engine is an ordinary unit, with no crew to protect. _Alternative:_ serfs push it (as in The Settlers); more realistic, much more complex.
2. **Catapult aiming:** at units and buildings; the shot flies to where the target was, so it can miss. _Alternative:_ an "attack ground" command, which can come later.
3. **Hero types:** three for Humans (Commander, Archmage, Pathfinder), at most one of each per player. The rule is checked when a hero is created, whatever creates it.
4. **Heroes come from the map, not from recruiting** (as in The Settlers 5). `MapDefinition` gets a `startingHeroes` field, next to `camps` and `waves`: a list of `{ player, hero, x, z }`, where `player` is the start slot (0 is the owner of the starting settlement, today the only slot) and `hero` a game-data hero id, checked when the match starts like the camps' unit ids. `createInitialState` spawns them with the starting serfs. Each map or mission can give different heroes, or none.
   - **Prototype map:** the player starts with the **Commander** and the **Archmage**, in front of the Town Hall next to the starting serfs.
   - **Open for recruiting later (not built now):** heroes are created only through one sim function (`spawnHero(state, hero, owner, at)`), which applies the one-per-type rule. A later `recruitHero` command for skirmish and multiplayer would validate the cost and call the same function; nothing in the hero, experience, ability or revival code depends on how a hero arrived. No recruit command, button or cost data is added in 6b.
5. **Mana or cooldowns:** cooldowns only, as in The Settlers 5. Mana can come later with magic and a tech tree.
6. **Experience:** every unit kind is worth a set amount of experience (game-data). The hero gets all of it for its own kills and half for kills by its own side within 10 units, so support heroes level too. Levels 1–5 come from experience thresholds; health and damage grow per level, in whole numbers, so every machine computes the same result.
7. **Ability system:** abilities are data, built from reusable effects (area damage, heal, damage or speed boost, slow, stun, reveal). One new command, `useAbility { unitId, ability, target? }`, targeting the hero itself, a point or a unit; the hero walks into range first, then casts. It is validated like every command: own hero, ability unlocked at its level, off cooldown, target in sight.
8. **Hero death:** the hero falls and stays as a grave on that spot. Enemies can't attack the grave, and it reveals a small area around it.
   - Revival needs any own unit within 4 units of the grave and no enemy within 8. Progress takes 30 s and pauses (doesn't reset) while that isn't met.
   - The hero returns with 50% health and keeps its level and experience.
   - **Cost:** free; time and the risk of standing there are the cost. _Option:_ a small fee (for example 3 gold) paid when the revival completes.
   - With units selected, right-clicking a grave shows a revive cursor and sends them there; any own unit nearby counts, even without that order.
9. **Defeat:** heroes and graves don't keep a player alive; the current defeat rule stays.
10. **Ability hotkeys:** Q, E and R (W, A, S and D move the camera).

## Assets

- **Horse (needs the user):** none of our packs has one. Recommended: a CC0 animated horse (for example from Quaternius' animal packs: walk, gallop, idle), moved into `assets-incoming/`; the licence is checked before use. The rider is the Knight on the horse's back, with the pack's sitting clip.
- **Catapult:** base, turret and arm from the Hexagon pack, already downloaded; the arm swings in code.
- **Ram:** built from primitives and Hexagon props, marked temporary until a model is found.
- **Stable:** no model in our packs; a temporary stand-in, marked temporary.
- **Hero models:** Knight and Mage from KayKit Adventurers (already in the repo), with pack accessories (two-handed sword, staff).

## Risks

- **Large siege units and pathfinding:** paths are planned for point-sized units, so a ram could squeeze through gaps narrower than itself. Checked in 6b.1; the clearance is widened only if it shows.
- **Cavalry depends on the horse asset.** That is why it is the last milestone (6b.7): siege and heroes don't wait for it.
