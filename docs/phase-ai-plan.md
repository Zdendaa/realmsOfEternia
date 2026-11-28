# Phase AI plan: computer opponents

**Approved 2026-11-28** with every recommendation, including the four open questions (teams in state with shared ally vision, the new 320×320 map, no resource cheats, waves and `clearMonsters` moved onto the mission system in AI.7). This is Phase 8 of the roadmap; building upgrades and technologies moved to Phase 9. Cavalry (6b.7) is deferred until a free horse model is available.

The goal is a computer player that builds an economy and a base, trains soldiers, uses its heroes and attacks in waves, with difficulty levels. Several AI players can play in one match, each with its own team, color, difficulty and personality, and alliances are configurable. The AI runs inside the deterministic simulation (`@roe/sim`), so the client (single player) and the server (multiplayer) run exactly the same AI code and get the same result. The last milestone adds hooks for missions: a scripted start state, objectives, triggers and per-AI behavior overrides.

## What exists today, and what is missing

- **One start position.** The map has one hand-authored settlement in the center. Only start slot 0 has heroes (`startingHeroes[].player`). An opponent needs its own start position and settlement.
- **No teams.** `areEnemies(a, b)` means "both have an owner and the owners differ". There is no alliance, and victory is per player.
- **Fair information is already available.** `viewOf` (6c.3) builds a fog-filtered `PlayerView`. An AI can read exactly what a human in its seat would see.
- **The command pipeline is already in place.** `parseCommand` / `validateCommand` / `applyCommand` with an issuer. An AI can play through the same commands as a human.
- **Colors** are assigned on the client by order of appearance (`ownerColor`), with 4 colors. They aren't tied to a seat.

## Milestones

| #    | Scope                                                                                                                                                                                                                                                                                                                           | Status    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| AI.1 | **Match setup for N players:** `MatchSetup` (seats: human/AI, team, color, difficulty, personality), start slots on a new 2–4 player skirmish map, a settlement per slot, teams in the sim (`areEnemies` from a team table), shared team vision, team victory, seat colors. Dev setup through URL/dev panel. **Browser review** | ✅ Done   |
| AI.2 | **AI framework:** `sim/ai/`, AI memory in `GameState`, staggered think schedule, the AI's commands going through `validateCommand`/`applyCommand`, knowledge from its `PlayerView`, a building-spot finder, a determinism test, a dev AI inspector. First behavior: recruit serfs, gather                                       | In review |
| AI.3 | **Economy and base:** build orders from personality data, serf allocation across wood/stone/food, housing ahead of population, the farm → mill → bakery chain, mines, rebuilding and repairing. Headless tests: economy targets at 5 and 10 minutes                                                                             | ⬜        |
| AI.4 | **Military:** training toward a target composition, base defense (pull back, gather near the threat), attack waves (gather → march → fight → retreat or regroup), scouting, clearing camps for the mines, siege against walls, towers for defensive personalities                                                               | ⬜        |
| AI.5 | **Heroes:** heroes join the army or defense, rule-based ability use (area spells on clusters, buffs before engaging), retreat when low, reviving fallen heroes                                                                                                                                                                  | ⬜        |
| AI.6 | **Difficulty, personalities, balance:** Easy/Normal/Hard, three personalities, headless AI-vs-AI tournaments, performance with 3 AIs, a skirmish setup screen (opponents, teams, colors, difficulty). **Browser review**                                                                                                        | ⬜        |
| AI.7 | **Mission hooks:** `MissionDefinition` (start state per seat, objectives, triggers, AI overrides), mission state in the sim, on-screen messages. The existing waves and `clearMonsters` are moved onto it unchanged, plus one small sample mission. **Browser review**                                                          | ⬜        |

AI.1 is a prerequisite and has no AI in it yet. It is kept separate because it changes core rules (hostility, victory, vision) that everything else builds on, and it is also what Phase 10 (multiplayer) needs.

## Key decisions (recommendation for each)

### 1. Where the AI runs: inside `stepGame`, issuing ordinary commands ✅ recommended

The AI is a phase at the start of `stepGame`. It reads the state at the start of the tick and returns `IssuedCommand[]` with `issuer = aiPlayerId`. These commands are validated and applied like a human's, after the human commands, ordered by seat.

- _Why:_ the same rules for humans and AI (it can't place an invalid building or spend money it doesn't have), determinism for free, and the same behavior on the client and the server. It also gives command logs and replays for free.
- _Rejected:_ an AI that edits state directly (cheating by construction, two rule paths), or an AI only on the server (single player runs on the client, so it would need a second implementation).

### 2. AI state: plain data in `GameState.ai`, keyed by player ✅ recommended

Squads, the build plan, the attack state, known enemy positions and the next think tick are stored as plain JSON, changed only by the AI phase. There are no hidden objects, closures or caches that change decisions. Caches that are only speed-ups (for example a candidate building-spot list) may live in `SimContext`, like the nav grid. It must not matter whether they are cold or warm. `viewOf` leaves `ai` out of every player's view (the server never sends it).

- _Why:_ a saved or replayed match continues the same way, and the server can restart from state.

### 3. Randomness: a seeded RNG per AI, derived from match seed + seat + tick ✅ recommended

The AI uses no `Math.random` and no iteration over unordered collections. Ties are broken by entity id. Personalities get variety (build-order variants, attack timing jitter) from this RNG, so two Normal AIs don't play identically, but the same seed always replays the same.

### 4. Think rate: staggered, about once per second per AI ✅ recommended

Each AI thinks every N ticks (Easy 30, Normal 10, Hard 5 at 10 Hz), with seats offset so that two AIs never think on the same tick. Heavy tasks (finding a building spot, choosing an attack target) are spread over several thinks. Budget: on average under 0.5 ms per tick with 3 AIs, measured in AI.2 and AI.6.

### 5. Information: fair by default ✅ recommended

The AI decides only from its own `PlayerView` (fog, last-seen buildings) plus its memory. To find enemies it has to scout. Difficulty changes speed and quality, not knowledge. A possible "Brutal" level that cheats with a resource bonus (never a map hack) is left for later and would be labeled as cheating in the setup screen.

- _Why:_ it feels fair, and fog of war and towers keep their meaning against the AI. It also checks the anti-cheat view from the other side.

### 6. AI structure: managers with a strategic layer, driven by data ✅ recommended

- **Strategy** (every few seconds): picks the posture from the situation (_build up / defend / attack / recover_) and sets targets for the managers.
- **Managers** (each think): _economy_ (serfs, gatherers, the build queue), _base_ (where to build), _military_ (what to train), _army_ (squads: defense, attack wave, scouts), _heroes_. Each manager emits a few commands, capped per think by difficulty (an "APM" limit).
- **Personality** in game-data (`AI_PERSONALITIES`, `as const satisfies`): build order, target army composition, aggression (wave size and timing), defense (towers and walls), expansion to mines.
- _Rejected:_ behavior trees or full utility AI. They take more work to build, are harder to read and debug, and an RTS opponent of this size doesn't need them. Utility scores are used only locally (for example to choose an attack target).

### 7. Base placement: search around the Town Hall with the real placement rules ✅ recommended

A deterministic ring or spiral search around the Town Hall. Each building kind has spacing rules (keep paths free, farms on open ground, production near resources, towers on the edge toward enemies), and every spot is checked with the existing placement validation. Mines go on known deposits. Missions can override this with fixed spots (AI.7).

- _Rejected:_ hand-authored layouts per map (they don't work on generated or new maps).

### 8. Attack waves ✅ recommended

The army gathers at a rally point until its strength (the sum of unit values from game-data) reaches the wave target. The target grows with game time and depends on difficulty and personality. Then the army attack-moves toward the chosen target: the nearest or weakest known enemy building, with a team ally's target preferred in FFA/2v2. It retreats when its own strength falls below a set share of the enemy's strength in sight, then regroups. Defense always wins over attack when the base is hit.

### 9. Teams and alliances: a team per seat, stored in `GameState` ✅ recommended

`GameState.teams: Record<PlayerId, TeamId>`. `areEnemies` becomes "different teams" and reads a lookup precomputed in `SimContext`, so the hot path stays fast. Monsters are their own team, hostile to everyone, and neutral (`null`) stays neutral. It lives in state, not only in the setup, so a mission trigger can change alliances later. Allies share vision. Victory: the last team that still has a Town Hall wins, and the map objective still counts.

- _Rejected:_ a full pairwise diplomacy matrix (no one-sided alliances are needed now; missions can still put a player on another team).

### 10. Skirmish map: a new 2–4 player map, the prototype stays ✅ recommended

A new generated map, about 320×320, with 4 start plateaus in the corners facing the center. 2-player matches use opposite corners. Each slot gets the existing starting settlement, rotated (fair, a fast start, and the AI doesn't need a separate opening). Deposits and camps go between the slots, and the center is contested. The prototype map stays as the solo and test map. `startSlots` become part of `MapDefinition`, and `startingHeroes` move into each slot.

### 11. Difficulty levels ✅ recommended

|                  | Easy                          | Normal                    | Hard                                                |
| ---------------- | ----------------------------- | ------------------------- | --------------------------------------------------- |
| Think interval   | 3 s                           | 1 s                       | 0.5 s                                               |
| Commands / think | 2                             | 5                         | 10                                                  |
| Economy          | loose build order, idle serfs | full build order          | tight build order, no idle serfs                    |
| First wave       | ~14 min, small                | ~10 min                   | ~7 min, then steady pressure                        |
| Combat           | attack-move only              | retreats, defends         | focus fire, pulls back wounded, counter-composition |
| Heroes           | stay home, no abilities       | abilities by simple rules | abilities timed to fights, revives at once          |

All values are game-data, so they can be tuned without code.

### 12. Personalities: three to start ✅ recommended

_Balanced_ (the default), _Aggressive_ (early, smaller waves, few towers), _Defensive_ (towers and walls, late large waves with siege). They are data only, and new ones need no code.

### 13. Testing ✅ recommended

- **Unit tests** per manager on small, made-up states.
- **Determinism:** the same match with 3 AIs, run headless for 20 game minutes twice, gives identical state hashes. The AI-on vs AI-off command logs replay to the same state.
- **Headless scenario tests** (sim, fast-forwarded): Normal AI economy targets at 5 and 10 minutes, the first wave launched by its time, a Hard AI beats an Easy AI in at least N of M seeds, and every AI-vs-AI match ends by 45 minutes.
- **Browser review** for AI.1, AI.6 and AI.7. The AI inspector shows each AI's posture, build queue, squads and last decisions, and there is a dev toggle to watch from an AI's seat.

### 14. Multiplayer server ✅ recommended

`MatchRoom` takes a `MatchSetup` too. AI seats have ids like `ai-1` and no client, and the server runs them in `stepGame`. In this phase the server path is covered by tests, without a lobby. Lobbies and matchmaking stay in Phase 10.

### 15. Mission hooks (AI.7): declarative data, no scripts ✅ recommended

`MissionDefinition` in game-data extends `MatchSetup`:

- **Start state per seat:** buildings, units, heroes, resources, explored areas (or no starting settlement at all).
- **Objectives** per team: `defeatAll`, `clearMonsters`, `destroyBuilding`, `killUnit`, `survive` (time), `reachArea`, `protect`, either primary or optional. The match is won when every primary objective is done and lost when a `protect` target falls or the Town Hall rule applies.
- **Triggers:** _when_ (`time`, `areaEntered`, `unitKilled`, `buildingDestroyed`, `objectiveDone`, `flag`) → _do_ (`spawnUnits`, `message`, `setTeam`, `setAiOverride`, `reveal`, `setFlag`, `win`/`lose`), with an optional `once`.
- **AI overrides per seat:** personality and difficulty, managers turned off (for example "doesn't attack until flag X"), a fixed attack target or route, an attack schedule, the area it may build in.
- **Mission state** in `GameState.mission`: triggers fired, flags, objective progress. Messages are short-lived events, like `casts`.
- The existing `waves` and `objective: 'clearMonsters'` are rebuilt as triggers and objectives. The prototype map is converted, and its current tests must pass unchanged.
- _Why data, not scripts:_ deterministic, safe to run on the server, easy to validate, and editable later by a mission editor. Rejected: JS callbacks per mission.

## Out of scope

The Brutal (cheating) difficulty, AI diplomacy (asking for help, changing alliances on its own), AI use of upgrades and technologies (comes with Phase 9, when it needs a manager), naval or cavalry play, lobbies and matchmaking (Phase 10), a mission editor and a campaign.

## Questions at approval (all answered yes, as recommended)

1. Teams in state with shared ally vision (decision 9). OK?
2. A new ~320×320 four-corner skirmish map, with the prototype kept for solo play (decision 10). OK, or should the AI first play on the prototype map with a second settlement added?
3. Fair AI with no resource cheats at any of the three levels (decisions 5 and 11). OK?
4. Moving the existing waves and `clearMonsters` onto the mission system in AI.7 (decision 15), instead of keeping two systems side by side. OK?

## As built

### AI.1: match setup for N players

- **Setup** (`MatchSetup` in sim `match/setup.ts`): a seed and seats (player, start slot, team, color, human or AI with difficulty and personality). `createMatch` builds the world with a settlement on every occupied slot and the first state; `matchSetupIssue` refuses setups the map can't play.
- **Start slots** are part of the map (`startSlots`: position, quarter turns, heroes); each has its own flat plateau. The prototype map has one, in the middle, so solo play is unchanged.
- **Teams** are in `GameState.teams`. Allies don't fight, share vision (and what they know), pass through each other's gates and are healed and boosted by each other's abilities. Stocks, orders, storage, bounties, revival and training stay per player.
- **Victory** is by side: a side loses when it had a Town Hall and has none left (its members play on while any ally's stands) and wins when it is the last side not defeated. The prototype map's `clearMonsters` objective works as before.
- **Four Corners** (`SKIRMISH_MAP`, 320×320): each corner has an iron and a gold deposit with small camps along the map edges; the middle has a second gold and iron deposit under a large camp. Four lakes, no waves.
- **Dev setup:** `?map=skirmish&teams=1,2,1,2&difficulty=hard,normal&personality=defensive&seed=7`, or the Match list in the dev panel. Only dev builds read the URL; the setup screen comes in AI.6.
- **Not yet:** `MatchRoom` still plays the prototype map without seats. Seating network clients belongs with the lobby (Phase 10); the shared `createMatch` it will call is covered by tests.

### AI.2: AI framework

- **As planned:** memory in `GameState.ai` (difficulty, personality, seed, seat order, the last 8 decisions), commands through `applyCommand` after the humans', seeded randomness, think intervals 3 s / 1 s / 0.5 s and 2 / 5 / 10 commands per decision.
- **Think schedule:** a pure function of tick and seat order, so no next think tick is stored. All intervals are multiples of 5 ticks, so no two AIs ever think on the same tick.
- **Knowledge (changed from decision 5):** only what is in sight now, plus home-ground trees and rocks (45 units around the Town Hall). The plan said the AI would read its `PlayerView`, but the view's last-seen buildings and explored ground come from a cache that a restarted match doesn't have. From AI.4 on, remembered enemy positions go into `AiState`.
- **First behavior:** recruit serfs up to the personality's number (14 / 12 / 14), send idle ones to wood and stone by its weights, to one of the 4 nearest reachable nodes at random.
- **Four Corners fix:** its 42-unit plateaus left the starts with only 0–1 rocks and 6–20 trees within 45 units. Every start now has the same two hand-placed groves and a quarry (`groves`, new in `MapDefinition`).
- **Inspector** (dev builds): each AI's stock, serfs and latest decisions; **Watch** draws the map through its fog.
- **Measured** (Node, three Hard AIs, 10 game minutes): a decision takes 0.07 ms at the median and 0.2 ms at the 99th percentile; the slowest in that run were 5–8 ms (the first one, which builds the AI's vision, and ones after a used-up tree changed the walkable areas). In a separate run, thinking averaged 0.067 ms per tick, within the 0.5 ms budget; a whole tick took 0.92 ms against 0.67 ms with the AIs off, which includes their three visions, their extra units and the measuring call itself. That run also had one 33.6 ms call that didn't show up again; its cause isn't confirmed.
- **Tests:** the same match twice gives the same state; a restart from a JSON copy of the state goes on identically; the command log replayed with the AIs off gives the same state.
