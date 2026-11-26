# Phase 6b plan: cavalry, siege weapons, heroes

**Approved 2026-11-26** with every decision as recommended (decision 4 as written: heroes come from the map, not from recruiting). Changed at review: cavalry moved to the last milestone, so nothing waits on the horse asset.

Cavalry, the siege weapons that answer walls, gates and towers (rams and catapults), and heroes in the style of The Settlers 5: unique active abilities with cooldowns, experience and levels that unlock further abilities, and fallen heroes that their own units revive. All numbers below are starting values and live in game-data; all rules live in `@roe/sim`, so client and server run the same code.

## Milestones

| #    | Scope                                                                                                                           | Status  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 6b.1 | Siege in the sim: ram and catapult stats, a `siege` armor class, wall targeting, the catapult's minimum range and splash, tests | ✅ Done |
| 6b.2 | Siege Workshop, siege models (catapult from the Hexagon pack, temporary ram) and their animations. **Browser review**           | ✅ Done |
| 6b.3 | Heroes in the sim: hero units, `startingHeroes` on the map, experience, levels 1–5, stats per level, tests                      | ✅ Done |
| 6b.4 | Abilities: data-driven effects, the `useAbility` command, the Commander's and the Archmage's abilities, tests                   | ✅ Done |
| 6b.5 | Fallen heroes: grave, revival by nearby own units, revive cursor and order. **Browser review**                                  | ✅ Done |
| 6b.6 | Hero panel (abilities, cooldowns, experience, hotkeys), balance tests, performance, docs                                        | ✅ Done |
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
| Speed / radius  | 1.4 / 0.75                           | 1.3 / 0.75                                                                                |
| Attack          | 34 every 2.5 s, ×4 against buildings | 16 every 6 s, ×10 against buildings; range 15, minimum 5, splash radius 1.5, rock speed 9 |
| Cost / training | 10 wood, 3 iron / 30 s               | 12 wood, 4 iron, 3 gold / 40 s                                                            |

- Simulated: a ram breaks a stone wall segment (1,400 health) in 27.1 s; a catapult destroys a stone tower (1,200) in 45 s without being hit.
- Arrows and wooden tower shots do 2 damage to a ram. Swords, spears and skeleton blades hit siege engines double.
- A catapult's rock hits only enemies. Its splash also reaches the wall segments on both sides of the one it hits, so it wears down three at once.
- Size (changed at review 2026-11-26): the engines are drawn at 0.7 of the first version, about a soldier's height and 2 × 1.35 on the ground, and their radius went from 1 to 0.75. Both numbers are `SIEGE_SIZE` in game-data `assets/siegeModels.ts`; the workshop's parked turret and rocks follow it.
- Large units and pathfinding: a ram walks through a gap one segment (2 units) wide. Paths are still planned for point-sized units, so between buildings a ram can pass a 1-unit slot, overlapping both. The clearance wasn't widened.

### As built (6b.2)

- **Siege Workshop:** assembled from pack pieces (scaffolding, the catapult turret, rock stack, weapon rack, timber, wheelbarrow, flag); building parts can now draw a single node of a model.
- **Models:** the catapult's turret and arm come from the pack's catapult tower (its other two nodes), on a code-built wheeled frame; the rock is the pack's projectile. The ram is code-built and temporary. Engines are instanced, with rolling wheels, the arm and the log timed to the simulation's strike, and a tipping wreck.
- **Dev tool:** `debugFort` raises a finished walled base (dev builds only), so sieges can be tried without a second player.

## Heroes

- **Commander** (Knight model, two-handed sword): _Rally_ (nearby own units deal more damage and walk faster, level 1), _Shockwave_ (area hit with a short stun, level 3), _Last Stand_ (nearby own units take much less damage for a short time, level 5).
- **Archmage** (Mage model, staff; no other unit uses it): _Fireball_ (area damage, level 1), _Frost Nova_ (slows enemies in an area, level 3), _Mass Heal_ (level 5).
- **Pathfinder** (ranger with a crossbow): _Eagle Eye_ (reveals an area through the fog for 15 s, level 1), _Volley_ (rain of arrows, level 3), _Sapper Charge_ (heavy damage to one building or wall, level 5). Defined in game-data but not given by the prototype map, so it is ready for later maps.
- Heroes stand out by size (1.2×), a golden ring and their own gear.

### As built (6b.3)

|                    | Commander                    | Archmage                             | Pathfinder                      |
| ------------------ | ---------------------------- | ------------------------------------ | ------------------------------- |
| Health / per level | 300 / +45                    | 170 / +25                            | 200 / +30                       |
| Damage / per level | 18 / +3 (melee, every 1.3 s) | 14 / +3 (bolt, range 9, every 1.8 s) | 16 / +3 (range 10, every 1.7 s) |
| Armor / speed      | 4 / 2.4                      | 1 / 2.2                              | 2 / 2.5                         |

- Levels at 0 / 100 / 250 / 450 / 700 experience. Worth: villager 3, skeleton minion 10, crossbowman 12, spearman and archer 18, swordsman 20, skeleton warrior 22, ram 30, catapult 35, hero 60. Buildings give none.
- A level adds to full health and to current health by the same amount; it doesn't heal otherwise.
- Heroes take **no place in housing**.
- A hero's own kill: the last blow was its melee hit or its shot. Tower kills and burns count as the side's (the half share).
- Until 6b.5, a fallen hero is removed like any unit.
- Heroes are already drawn (so the map's heroes aren't invisible): own models and gear at 1.2×, a golden ring, level and level stats in the unit panel. Dev tools: spawn a hero, "+150 experience" for selected heroes.

### As built (6b.4)

| Ability       | Level | Cooldown / cast | Aim (range, radius)             | Effect                                          |
| ------------- | ----- | --------------- | ------------------------------- | ----------------------------------------------- |
| Rally         | 1     | 45 s / 0.5 s    | self (10)                       | own units: damage ×1.5 and speed ×1.35 for 15 s |
| Shockwave     | 3     | 30 s / 0.6 s    | self (5)                        | 60 damage and a 3 s stun to enemies             |
| Last Stand    | 5     | 90 s / 0.5 s    | self (10)                       | own units take ×0.25 damage for 12 s            |
| Fireball      | 1     | 15 s / 0.6 s    | point (10, 3.5)                 | 80 damage                                       |
| Frost Nova    | 3     | 25 s / 0.6 s    | point (10, 5)                   | 25 damage, speed ×0.35 for 8 s                  |
| Mass Heal     | 5     | 60 s / 0.8 s    | self (10)                       | heals own units by 150                          |
| Eagle Eye     | 1     | 45 s / 0.5 s    | any point, also unseen (60, 18) | shows the area for 25 s                         |
| Volley        | 3     | 25 s / 0.8 s    | point (13, 4.5)                 | 55 damage                                       |
| Sapper Charge | 5     | 60 s / 2 s      | enemy building or wall (7)      | 1000 damage to it                               |

**Raised after the playtest (2026-11-26),** measured in simulated fights (`heroes/abilityBalance.test.ts`, groups of 6 or 8):

| Ability       | Before                               | After                   | Simulated outcome, before → after                                                                                    |
| ------------- | ------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Rally         | r 8; damage ×1.25, speed ×1.25; 10 s | r 10; ×1.5, ×1.35; 15 s | 6 swordsmen vs 6 skeleton warriors, 15 s: skeletons left 1 → 0, own health lost 260 → 218 (without Rally: 2 and 295) |
| Shockwave     | r 4; 35; stun 2 s                    | r 5; 60; stun 3 s       | skeleton minions: none die → all die; warriors lose 32% → 55%                                                        |
| Last Stand    | r 8; damage taken ×0.4; 8 s          | r 10; ×0.25; 12 s       | 6 swordsmen vs 10 warriors, 10 s: health lost 182 → 128 (365 without it); 1 swordsman dies → none                    |
| Fireball      | r 2.5; 45; cast 0.8 s                | r 3.5; 80; cast 0.6 s   | minions and archers: none die → all die; warriors lose 27% → 73%, swordsmen 25% → 67%                                |
| Frost Nova    | r 4; 10; speed ×0.45; 6 s            | r 5; 25; ×0.35; 8 s     | 12-unit march: 5.8 s without; frosted 9 s → 10.9 s                                                                   |
| Mass Heal     | r 8; 80                              | r 10; 150               | swordsmen at 10 health get back 67% → 92% of full health                                                             |
| Eagle Eye     | range 40; r 14; 15 s                 | range 60; r 18; 25 s    | revealed area ×1.65, for 10 s longer                                                                                 |
| Volley        | range 12; r 3.5; 30                  | range 13; r 4.5; 55     | minions: none die → all die; warriors lose 27% → 50%                                                                 |
| Sapper Charge | range 2; 600                         | range 7; 1000           | stone wall 43% → 71%, stone tower 50% → 83%, barracks 48% → 79%; house and wooden tower fall either way              |

Cooldowns are unchanged.

**Aiming (changed after the playtest):** aimed abilities are aimed with the mouse (button or Q / E / R, in the order they unlock). A ring of the ability's radius follows the pointer and a faint ring shows the range; it turns red, with the reason, when the target is illegal or out of range, and then a click does nothing. Left click casts, right click or Esc cancels. Self-cast abilities (Rally, Shockwave, Last Stand, Mass Heal) go off at once. Shockwave is centred on the Commander, so it is self-cast. The simulation still walks a hero into range (a target can move during the cast), but the client only sends targets already in range; because of that Sapper Charge's range went from 2 to 7.

- The Pathfinder's three are built too (the plan named only the Commander's and Archmage's for tests; the effects are shared).
- Ability damage **ignores armor** and never hurts the caster's side. Area damage hits units only; only Sapper Charge hits a building.
- `useAbility { unitId, ability, target? }`: the hero walks into range, casts, then the effects apply and the cooldown starts. A new order or a stun breaks the casting off without spending it. A hero that can't get into range gives up.
- Boosts of one kind don't stack (the newest wins); a weaker, shorter slow doesn't replace a stronger one.
- A spell's kill counts as the hero's own for experience and bounty.
- A placeholder ring shows where an ability takes effect. The ability buttons are in the selected hero's panel; the rest of the hero panel comes in 6b.6.

### As built (6b.5)

- Decision 8 as written (numbers in `HERO_RULES`): the grave reveals 6 units around it; revival needs an own unit within 4 and no enemy **unit** within 8 (enemy towers and buildings don't count); 30 s, pausing but never lost; back at half health with level, experience and cooldowns; free.
- Graves are their own list in the state, so nothing can target them. A fallen hero still counts against the one-per-type rule, and doesn't keep a player in the game.
- The `revive` order: fighters attack-move to the grave (they clear enemies, then stand guard); serfs walk there and stay until the hero is back. Right click with units selected on an own grave (revive cursor).
- The bar over a grave: gold while reviving, grey while it waits for an own unit, red while an enemy is near.
- Building over a grave is allowed; the hero then rises on the nearest walkable spot.

### As built (6b.6)

- **Hero list** (right, under the settings): every own hero with level, health and experience; a fallen one shows how its revival stands, in the grave bar's colors. Click selects (a fallen one: shows its grave), double click moves the camera.
- **Selected hero:** experience bar, three ability buttons with Q / E / R, a fill that runs with the cooldown; stats in two columns (the description is a tooltip), so the panel fits 1280 × 720 under the list. With a group selected, the first hero's abilities show under its name.
- **Balance tests** (`heroBalance.test.ts`): a level 1 Commander beats 2 swordsmen or 2 skeleton warriors, not 3; a level 1 Archmage beats 2 skeleton minions, not 3 minions or 2 spearmen; level 5 clearly more. The prototype map is tested too (below).
- **Performance:** 120 v 120 with six heroes casting: tick mean 0.9 ms, p99 8.6 ms, max 18 ms (a tick has 100 ms). In headless Chrome with 262 units, median frame 16.7 ms (vsync) with and without aiming (p95 about 21 ms); one aim check costs about 0.07 ms.

### A harder map (after the 6b.6 review)

The two starting heroes could clear everything alone. Now they need soldiers. All numbers are in game-data.

|                                     | Before    | After      |
| ----------------------------------- | --------- | ---------- |
| Iron camp (warrior/minion/crossbow) | 1 / 3 / 0 | 6 / 5 / 4  |
| Gold camp                           | 2 / 3 / 2 | 10 / 8 / 6 |
| Wave                                | 2 / 5 / 2 | 7 / 6 / 6  |
| Damage (warrior, minion, crossbow)  | 10, 6, 7  | 16, 10, 13 |
| Sight (warrior, minion, crossbow)   | 8, 8, 10  | 11, 11, 12 |

- **Sight was the real gap:** the Archmage and archers shoot from about 10, so a guard that saw 8 was shot without ever reacting, and ranged units could clear a camp of any size.
- **Buildings:** a `building` bonus on the three skeleton attacks keeps their damage per hit against buildings as before (8, 4, 2), so walls and towers are balanced as they were against the same skeletons.
- **Measured** with a test bot (`test/skirmish.ts`: attack-move plus abilities), wins in 49 starts; heroes alone: iron 5, gold 4, wave 8. With soldiers: iron with 5 archers 46; gold with 8 archers or 4 swordsmen and 4 archers 49; wave with 3 swordsmen and 4 archers 49, with 8 archers 44.

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
