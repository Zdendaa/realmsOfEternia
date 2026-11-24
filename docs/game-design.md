# Realms of Eternia – game design

This document describes what the game should become. For how the code is built, see [architecture.md](architecture.md); for what exists today and its known limitations, see [status.md](status.md).

## 1. Vision

Realms of Eternia is an original 3D fantasy real-time strategy game that combines:

- **Settlers-style economy:** settlement building, resource gathering, production chains, villagers, defensive walls and towers.
- **Warcraft-style fantasy strategy:** factions, heroes, unique units, magic, monsters and battles.

Economic development and military strategy should be balanced. The game is fully 3D with an isometric RTS camera.

**Release targets:**

- A browser-playable game.
- A desktop game on Steam.
- Multiplayer for 2–4 players initially.

**Original IP:** we take inspiration from gameplay concepts only. We never copy copyrighted assets, characters, names, models, sounds, maps or artwork from Warcraft, The Settlers or any other game.

## 2. Game concept

The player starts with a small settlement and a few villagers, then:

1. Gathers resources and constructs buildings.
2. Develops production chains and expands the settlement.
3. Researches technologies and trains military units.
4. Explores the map and fights neutral monsters and enemy players.
5. Builds defensive fortifications and protects the capital.
6. Eventually conquers enemy territory.

The game mixes city-building, economic management, exploration and real-time combat. The world should feel alive: villagers visibly walk around, work, carry resources and interact with buildings.

## 3. Factions

Factions are added one at a time. **Humans are the first playable faction.**

| Faction    | Identity                            | Example units                                          |
| ---------- | ----------------------------------- | ------------------------------------------------------ |
| **Humans** | Balanced economy and military       | Knights, archers, crossbowmen, paladins, siege weapons |
| Orcs       | Aggressive military, powerful melee | Berserkers, trolls, orc warriors, beast riders         |
| Elves      | Magic, mobility, forest advantages  | Archers, druids, rangers, magical creatures            |
| Undead     | Necromancy and resurrection         | Skeletons, zombies, necromancers, death knights        |

Dragons are powerful late-game units or special unlocks, never ordinary early-game units.

Each faction eventually gets its own architecture, buildings, units, technologies, gameplay mechanics and visual identity.

## 4. Gameplay systems

### 4.1 Camera and world

- Full 3D environment with an isometric RTS perspective.
- Camera panning, zoom, rotation and map boundaries.
- Terrain with grass, forests, hills, rocks and water.
- Dynamic lighting and shadows; a day/night cycle may come later.

### 4.2 Buildings and settlement

Players construct buildings freely on suitable terrain.

**Initial building list:** Town Hall / castle, houses, lumberjack hut, sawmill, quarry, iron mine, gold mine, farm, mill, bakery, blacksmith, barracks, archery range, stables, market, storage, defensive towers.

Every building has construction costs, construction time, health, functionality and upgrade levels.

**Building upgrades.** Every important building has at least three upgrade levels. An upgrade changes functionality, production efficiency, capacity, the available units or services, and **the building's appearance**: buildings must visibly evolve.

Example, barracks:

1. Basic infantry.
2. Heavy infantry and higher training capacity.
3. Elite units and faster training.

### 4.3 Economy and resources

**Resources:** wood, stone, iron, gold, food, mana.

The economy uses real production chains, for example:

- A lumberjack cuts trees → wood goes to storage → a sawmill processes it → processed materials allow advanced construction.
- Farms produce food; food supports population and military.
- Mines extract stone, iron and gold.
- The blacksmith turns iron into weapons and armor.

Villagers physically carry resources between buildings and storage. The economy is data-driven and deterministic where practical, so it can run on the server in multiplayer.

### 4.4 Villagers

Villagers have positions and movement, find jobs, walk between locations, gather and transport resources, work in production buildings and are always visible in the world.

**Two villager types** (inspired by The Settlers 5):

- **Serfs** are player-controlled and recruited at the Town Hall. They build construction sites, chop trees, quarry stone, and repair buildings and walls.
- **Workers** spawn automatically when a production building is completed. They work only in their own building, need housing, and can't be controlled directly. Needs such as food and sleep are a possible later feature (see the roadmap).

**Construction sites:** buildings are placed as construction sites first. Serfs build them using resources delivered to the site.

Later this needs population management, worker assignment, pathfinding, job priorities, work animations and idle behavior.

**Scalability:** avoid hundreds of expensive, independent per-villager simulations on the client; design systems that scale.

### 4.5 Walls and fortifications

One of the most important features: players design their own castles and fortresses instead of choosing predefined templates.

- Free wall placement, including drawing walls by dragging the mouse.
- Automatic corners and connections.
- Different wall types, gates, towers, wall walkways and drawbridges.
- Castle courtyards that combine walls, towers, gates and central castle buildings.

**Destructible fortifications:** each wall segment has health; walls can be damaged, destroyed and repaired; gates can be breached; siege weapons (catapults, trebuchets, siege towers, rams) attack fortifications.

### 4.6 Defensive towers

Towers automatically detect and attack enemies in range.

- **Types:** archer, crossbow, magic, artillery, dragon/fire tower.
- **Configurable per type:** range, attack speed, damage, health, projectile type, target priority, upgrade levels.
- **Upgrades** improve functionality and visibly change the tower.
- **Special ammunition:** fire arrows, armor-piercing arrows, magical projectiles.

### 4.7 Military and combat

Units have health, damage, attack speed, armor, movement speed, attack range, cost, training time and faction-specific abilities.

Combat supports melee, ranged attacks, magic, siege warfare, formations, target selection, unit commands and defensive behavior.

### 4.8 Heroes and magic

Heroes have unique abilities, experience and levels, equipment, special spells and cooldowns. Magic is part of the strategy and can use mana as a resource.

### 4.9 Technology tree

Research costs resources and time, and unlocks new buildings, new and stronger units, better production, better fortifications, new weapons and magical abilities.

Categories: **economy, military, defense, magic.**

### 4.10 AI and multiplayer

- AI opponents and neutral monsters.
- Territory expansion.
- 2–4 player multiplayer: free-for-all, 2v2, possibly co-op missions.
- Custom maps, matchmaking, rankings and statistics.

**Victory conditions:** destroy enemy capitals, control key map locations, or complete special objectives.

**Multiplayer is server-authoritative.** Clients never decide resources, damage, construction validity or any other important game state.

## 5. User interface

Eventually the UI includes:

- A top resource bar and population indicator.
- A selected unit/building panel and a unit command bar.
- Construction and research panels.
- A minimap.
- Settings, a multiplayer lobby and a main menu.

The UI should look like a premium fantasy RTS and stay visually consistent.

## 6. Roadmap

Work proceeds one milestone at a time.

| Phase | Milestone                          | Status       |
| ----- | ---------------------------------- | ------------ |
| 1     | Project foundation                 | ✅ Completed |
| 2     | First real settlement              | ✅ Completed |
| 3     | Building placement                 | ✅ Completed |
| 4     | Villagers                          | ✅ Completed |
| 5     | Economy                            | ⏳ Current   |
| 6     | Military and combat                | Planned      |
| 7     | Fortifications                     | Planned      |
| 8     | Building upgrades and technologies | Planned      |
| 9     | AI                                 | Planned      |
| 10    | Multiplayer                        | Planned      |
| 11    | Polish and release                 | Planned      |

### Phase 1 – Project foundation ✅

Monorepo, React + Vite, Three.js / React Three Fiber, RTS camera, terrain, decorations, basic HUD, Colyseus server foundation, lint and build validation.

### Phase 2 – First real settlement ✅

A visually convincing world around the first human settlement: heightmap terrain with hills, forests and a lake, a forested mountain border, sky and fog, shadows that follow the camera, a Town Hall landmark with houses, fields, a mill, a lumbermill, a market and a well (KayKit CC0 models), dirt paths and roads, grass and flowers, and stylized water.

### Phase 3 – Building placement ✅

A construction menu with display-only costs; a placement preview snapped to a grid, colored by validity and rotatable; validation shared by client and server (terrain, slope, water, buildings, paths, trees); placed buildings stored as game state and created through commands that the server can validate.

### Phase 4 – Villagers ✅

First villagers, basic movement, walking between buildings, simple work behavior and basic pathfinding. Introduces serfs and workers (see 4.4).

### Phase 5 – Economy ⏳

Resource storage, gathering, transportation, production chains, worker assignment and economy UI. Buildings become construction sites built by serfs with delivered resources (see 4.4).

### Phase 6 – Military and combat

Infantry, archers and cavalry, unit selection and commands, combat, siege weapons, heroes. Comes right after the economy (including its depth part, Phase 5b): armies give the economy a purpose, and everything after it needs enemies.

### Phase 7 – Fortifications

Wall placement and drawing, gates, towers, castle construction, tower targeting and shooting, destructible walls. After military, because towers need enemies to shoot at and walls need attackers to hold back.

### Phase 8 – Building upgrades and technologies

Three upgrade levels with visual architectural changes, the research system, unlockable units and buildings.

### Phase 9 – AI

Neutral enemies, AI opponents with resource management, army building, attacks and defense.

### Phase 10 – Multiplayer

Server-authoritative simulation for 2–4 players, matchmaking, synchronization, combat validation and multiplayer testing.

### Phase 11 – Polish and release

Sound, music, animations, main menu, settings, performance optimization, save/load, tutorial, custom maps, Steam integration.

### Possible later features

- **Worker needs (food, sleep) like The Settlers 5:** workers eat and rest at times, and an unfed or tired worker works slower. Not scheduled; Phase 5b deliberately keeps workers without needs (only mines consume food).

## 7. Steam and commercial goals

The browser game should later become a desktop application released on Steam.

- **Likely approach:** Electron as the desktop wrapper, core game logic independent of the browser/desktop runtime, a separate multiplayer backend, Steamworks integration later.
- **Possible business models:** premium paid game, cosmetic DLC, expansion packs, optional supporter content.
- **No pay-to-win mechanics.**

No time goes into Steam integration now; the architecture just has to stay compatible with it.
