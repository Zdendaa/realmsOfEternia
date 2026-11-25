# Phase 6 plan: military and combat

_Approved 2026-11-25. Follows [phase-5b-plan.md](phase-5b-plan.md). Work through the milestones in order; each one is verified (check, build, browser check when visual), documented in `status.md` / `architecture.md`, committed and pushed separately. Tick the status column here when a milestone is done._

## Scope

A base army for the Humans (swordsman, spearman, archer) trained in a barracks and an archery range, deterministic combat in `@roe/sim` (health, armor, counters, melee, arrows, death), attack / attack-move / stop commands with auto-engage, buildings that can be damaged and destroyed, and the first enemy: neutral skeleton camps, then one scripted wave. Cavalry, siege engines and heroes move to **Phase 6b**: there are no horse models in our packs, siege belongs with walls (Phase 7), and heroes need abilities and mana.

## Decisions

1. **Arrows are homing "delayed hit" records** in `GameState.projectiles`, not physical projectiles and not instant hits. On release the sim stores `{ attackerId, targetId, from, impactTick, damage }`; the impact tick comes from the distance and the arrow speed. On that tick the damage applies if the target still lives, otherwise the arrow lands harmlessly. The client only draws the arc between release and impact. Towers and catapults (Phase 7) reuse the record with a ground target and splash.
2. **Counters are data.** Every unit and building has an `armorClass` (`infantry`, `ranged`, `building`, `monster`; `cavalry` and `siege` reserved). An attack has damage, cooldown, range, `melee | ranged` and `bonus: Partial<Record<ArmorClass, number>>`. Damage = `max(1, round(damage × bonus[class] − armor))`. Health is an integer.
3. **Building health lives in its own record** (`GameState.buildingHealth`, damaged buildings only), like `construction`, so the `buildings` array still changes only when a building is placed, finished or destroyed (the instanced settlement doesn't rebuild per hit).
4. **Death stays in sim state:** a dead unit keeps its place for about 3 s with `activity: 'dying'` (no collisions, not targetable), then is removed. The client plays the death clip and sinks the corpse from state alone, which also works with server sync.
5. **Monsters are a reserved player** (`monsters`). One rule decides hostility (`areEnemies`): units of different non-null owners are enemies, monsters are hostile to everyone, neutral (`null`) buildings are never attacked.
6. **Auto-engage is cheap:** idle, attack-moving and guarding units scan for enemies within `sightRange` with the spatial grid, staggered by unit id (every 3 ticks each). Priority: whoever attacks me, then the nearest unit, then the nearest building. A leash returns guards (and units that auto-engaged while idle) to their spot when a chase goes too far. Measured with `test/bench.ts`.
7. **Costs are gold, iron, food (and wood) directly**, no weapons chain until later (Phase 8). Each soldier takes 1 housing.
8. **Moves are not attacks:** right-click on the ground moves (units don't stop to fight), right-click on an enemy attacks, attack-move fights along the way.
9. **Hotkeys:** WASD stays the camera; **F** = attack-move, **X** = stop.
10. **A dev-only spawn** (`debugSpawn` command) is accepted only when the `SimContext` has a dev flag; the client sets it in `import.meta.env.DEV`, the server never does.

## Units (starting numbers, tunable in game-data)

|                | Swordsman                       | Spearman                           | Archer                                            |
| -------------- | ------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Model          | Knight + sword + colored shield | Barbarian + code-built spear       | Rogue_Hooded + bow + quiver, player-colored cloth |
| Trained in     | Barracks                        | Barracks                           | Archery range                                     |
| Health / armor | 120 / 3                         | 90 / 1                             | 60 / 0                                            |
| Attack         | 12 every 1.2 s, melee           | 9 every 1.4 s, reach 1.2           | 8 every 1.6 s, range 9                            |
| Bonus          | ×1.5 vs infantry                | ×3 vs building (×2 vs cavalry, 6b) | ×0.5 vs building                                  |
| Cost / time    | food 3, iron 2, gold 1 / 20 s   | food 2, iron 1, wood 2 / 15 s      | food 2, wood 3, gold 1 / 18 s                     |

The Ranger stays the serf: archers use the hooded Rogue so they aren't mistaken for serfs at RTS zoom. The triangle closes with cavalry (6b); until then spearmen are the building breakers.

## Asset evaluation (2026-11-25)

- **KayKit Character Pack: Skeletons 1.1 FREE (CC0)**, `assets-incoming/KayKit_Skeletons_1.1_FREE.zip`: models, textures, a license and `.url` shortcuts only, no executables or scripts. Characters Skeleton_Minion, Warrior, Rogue, Mage (GLB, one shared texture); accessories axe, blade, crossbow, staff, quiver, arrows, small and large shields (gltf + bin). **Same Rig_Medium:** all four have the same 23 bones with identical rest translations as the Adventurers, so our clips (and the `Skeletons_*` clips in the Special library) play on them.
- **Hexagon pack:** barracks and archery range (yellow variants, roofs recolored like every building), `building_destroyed` for ruins.
- **Adventurers accessories:** `sword_1handed`, `shield_badge_color`, `bow_withString`, `arrow_bow`, `quiver`. No spear: built in code like the sickle.
- **Animations** (already in the build): `Melee_1H_Attack_Chop`, `Melee_2H_Attack_Stab`, `Ranged_Bow_Draw` / `Release`, `Hit_A`, `Death_A`, `Skeletons_*`.

## Milestones

| #   | Scope                                                                                                           | Status |
| --- | --------------------------------------------------------------------------------------------------------------- | ------ |
| 6.1 | Combat core in the sim: health, armor, counters, melee, arrows, death, auto-engage, attack / attack-move / stop | ✅     |
| 6.2 | Soldier visuals: models, weapons, player color, combat animations, arrows, corpses, dev spawn                   | ✅     |
| 6.3 | Barracks and archery range: training queue, costs, housing, training panel                                      | ✅     |
| 6.4 | Commands and readability: attack cursor, F / X, health bars, unit stats panel, selection grouping               | ✅     |
| 6.5 | Building damage and destruction: building health, attacking sites, ruins                                        | ✅     |
| 6.6 | Skeleton camps: monsters player, camps on the map, guard and leash, bounty                                      | ✅     |
| 6.7 | Scripted wave: a skeleton group attacks the village                                                             | ✅     |

### 6.1 Combat core

- game-data: `units/combat.ts` (armor classes, attack definitions, damage), combat stats for the three soldiers and the villagers (serfs and workers can be killed, they don't fight back), building health.
- sim: `combat/` (damage, targeting, attacks, projectiles, death), military unit tasks (`attack`, `attackMove`), `attack` / `attackMove` / `stop` commands, `areEnemies`, the dev-only `debugSpawn`. Tests: counters, armor, melee and ranged kills, a missed arrow when the target dies, auto-engage, leash, determinism.
- Done 2026-11-25: as planned. Villagers got an armor class of their own (`villager`, health 40) so infantry bonuses don't hit them. Strikes have a `windup` (swing 0.5–0.7 s) so damage can land with the animation; a strike in progress misses a target that stepped 0.5 beyond reach. Chases walk straight at the target when the line is clear and use the path planner otherwise. 22 tests (incl. a 100 vs 100 benchmark: 0.27 ms/tick mean, p99 1.44 ms). The client only got the new kinds and activities typed (soldiers aren't drawn until 6.2).

### 6.2 Soldier visuals

- game-data: soldier character models in `CHARACTER_PACK` (Knight, Barbarian, Rogue_Hooded), combat animations, weapon accessories.
- client: soldiers in the baked instancing (one mesh set per character), weapons and shields on the hand slots, player color on shields and cloth, attack / shoot / death animations, flying arrows, corpses that sink, a dev spawn panel.
- Done 2026-11-25: player color goes on cloth, not the shield (Knight: cape and tabard [0, 1]; Barbarian: waist wrap and bracers [6, 0] with trim [2, 1]; hooded Rogue: hood and cape [1, 1]; cells found from UVs, vertex heights and the textures). The shield is `shield_badge_color` as shipped. Attack clips: `Melee_1H_Attack_Chop`, `Melee_2H_Attack_Stab`, `Ranged_Bow_Draw` + `Ranged_Bow_Release` joined; `ready`: `Melee_Blocking`, `Melee_2H_Idle`, `Ranged_Bow_Aiming_Idle`; death `Death_A` for everyone (villagers too). The bow's string-draw morph is dropped. Checked in the browser: close-ups from front and back for both teams, a 12 vs 12 battle (engaging, swings, arrows, corpses), attack timing against the strike tick, the production build loading all 55 model files.

### 6.3 Barracks and archery range

- game-data: `barracks` and `archeryRange` with `trains: UnitKind[]`.
- sim: `GameState.training` (queue up to 5, progress in ticks), `trainUnit` / `cancelTraining` (cost paid when queued, refunded on cancel, a free housing slot needed to finish).
- client: training panel (buttons with cost and time, disabled reasons, queue with progress and cancel).
- Done 2026-11-25: the Hexagon barracks (6 × 7) and archery range (7 × 7) are the yellow variants packed to GLB, roofs in the player color, entrances at +Z (checked in the browser). Training is `training/training.ts` (`{ queue, readyAt }` per building); trained units need free housing to leave ("Waiting for housing"); no rally point. 9 tests (payment and timing, queue order, progress, validation, construction sites, cancel and refund, waiting for housing, parsing, trained soldiers fighting). Checked in the browser: menu (two rows), both models, the panel (buttons, queue, progress), units leaving the door.

### 6.4 Commands and readability

- client: sword cursor over enemies, right-click attack, F (attack-move) and X (stop), command bar, instanced health bars (damaged, selected, hovered, or all while Alt is held), unit stats panel (health, damage, armor, range, speed, strong / weak against), a mixed selection grouped by type, soldier scale tuning.
- Done 2026-11-25: as planned, except health bars show for hurt and selected units (not hovered). Attack-move with F, then a left click (an enemy under the click is attacked directly); Shift keeps the mode. The soldier scale (1.15× villagers) was kept: it reads at the default zoom. Checked in the browser with real mouse and key events: sword cursor over an enemy, right-click attack, X, F + click, the panels, health bars, pruning of dead units from the selection.

### 6.5 Building damage and destruction

- sim: attacking buildings and construction sites, `buildingHealth`, destruction frees the footprint, the lost building's worker goes with it.
- client: building health bars, ruins (Hexagon destroyed building) with smoke that fade out.
- Done 2026-11-25: damage is stored as damage taken (`buildingDamage`) instead of health, so construction sites can grow their health with progress. Destroyed buildings become `ruins` in the sim state (not only client-side): the terrain stays flattened under them, so the sim\x27s heights and the drawn terrain keep matching. Ruins stay for the match; their smoke stops after 45 s. Found while testing: attackers kept killing the replacement workers a besieged building sent out, so no worker comes out while enemies are within 15 units. Building health was raised after the first browser check (houses fell in 2 s to five spearmen): 30 per square unit, at least 300, Town Hall 3,000. 11 tests. Checked in the browser: enemy spearmen destroying a house (rubble, smoke, population drop), a right-click attack on an enemy barracks with its health bar and fall.

### 6.6 Skeleton camps

- game-data: skeleton characters, `monsters` player, camps in `MapDefinition` (guarding the gold deposit), skeleton stats, bounty.
- sim: guard and leash behavior, bounty paid to the killer's owner.
- Done 2026-11-25: three skeleton kinds (minion, warrior with axe and shield, crossbowman = Skeleton_Rogue); camps on both deposits of the prototype map (gold 7 guards, iron 4). Guards are ordinary idle fighters with a permanent `home` as their leash anchor. Bounty in gold to the owner of the killing blow (`Hits` tracks the last hitter). 6 tests (spawning and homes, staying put, defending and bounty, leash and return, bounty to the right player, determinism). Checked in the browser: both camps spawned, close-up of the gold camp, an attack-move of 10 soldiers clearing it for 9 gold. The build grew to 17 MB (skeleton models and accessories).

### 6.7 Scripted wave

- game-data: map-defined waves (tick, units, target).
- sim: a wave spawns at the map edge and attack-moves to the Town Hall.
- Done 2026-11-25: one wave on the prototype map, 8 minutes in, nine skeletons from the north road (9, -80) to the nearest player Town Hall. `GameState.wavesSent` and `lastWaveAt` (for the client banner); a dev-only `debugWave` command and a "Send next wave now" button. The undefended village loses its northern buildings first: the wave comes from the north and the serfs at the south door are out of its sight. 5 tests (timing and units, an undefended village, a defended one, the dev command, determinism). Checked in the browser by fast-forwarding the simulation: countdown, banner, the horde on the north road, its attack on the lumbermill; the dev button; the production build loading all 70 model files. **Phase 6 is complete.**

## Not in scope

Cavalry, siege engines and heroes (Phase 6b), formations, unit upgrades and research (Phase 8), towers and walls (Phase 7), real AI opponents (Phase 9), weapon production chains, rally points (maybe in 6.3 if cheap), fog of war.
