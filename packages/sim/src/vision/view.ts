import type { EntityId, PlayerId } from '@roe/shared';
import type { Projectile } from '../combat/projectiles.js';
import type { BuildingInstance, GameState, Ruin } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';
import { IDLE } from '../state/units.js';
import type { SimWorld } from '../world/createWorld.js';
import { buildingSeen, isExplored, isVisible, type Vision } from './vision.js';

/**
 * What one player may know of the game (fog of war applied): what the multiplayer
 * server will send that player instead of the whole state, so a modified client can
 * never show hidden enemies. Built by `viewOf`.
 */
export interface PlayerView {
  readonly player: PlayerId;
  readonly tick: number;
  /** The player's units, and other players' (and monsters') units in sight. */
  readonly units: readonly UnitInstance[];
  /** The player's buildings, and everyone else's as last seen (current while in sight). */
  readonly buildings: readonly BuildingInstance[];
  /** Construction progress, training queues and fields of the player's own buildings only. */
  readonly construction: GameState['construction'];
  readonly training: GameState['training'];
  readonly fields: GameState['fields'];
  readonly upgrades: GameState['upgrades'];
  /** Damage of the player's buildings and of other buildings in sight. */
  readonly buildingDamage: GameState['buildingDamage'];
  /** The player's own stock only. */
  readonly stocks: GameState['stocks'];
  /** Arrows whose shooter or target is in sight. */
  readonly projectiles: readonly Projectile[];
  /** Ruins on explored ground. */
  readonly ruins: readonly Ruin[];
  /** Harvested trees and rocks on explored ground. */
  readonly resourceNodes: GameState['resourceNodes'];
  /** The player's own casts, and others' whose area is in sight. */
  readonly casts: GameState['casts'];
  /** Scenario progress (public: the waves are announced). */
  readonly wavesSent: number;
  readonly lastWaveAt: number | null;
}

/**
 * Another player's unit as the viewer may see it: where it is and what it visibly does,
 * without its route, destination or aim (they would tell what the enemy is about to
 * do).
 */
function seenFromOutside(unit: UnitInstance): UnitInstance {
  let task = unit.task.kind === 'move' || unit.task.kind === 'attackMove' ? IDLE : unit.task;
  // That a hero is casting shows; what it aims at doesn't.
  if (task.kind === 'cast') task = { ...task, target: null };
  const combat = unit.combat && {
    ...unit.combat,
    breachId: null,
    provokedBy: null,
    anchor: null,
    home: null,
  };
  const hero = unit.hero && { ...unit.hero, experience: 0, cooldowns: {} };
  return { ...unit, task, movement: null, combat, hero };
}

const pick = <T>(record: Readonly<Record<EntityId, T>>, keep: (id: EntityId) => boolean) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => keep(Number(id))));

/**
 * The view of `state` for `vision.player` (`vision` must be up to date with `state`).
 * Own things are complete; everyone else's are limited to what the player sees now
 * (units, arrows, damage) or has seen (buildings as last seen, ruins, harvested nodes).
 */
export function viewOf(world: SimWorld, state: GameState, vision: Vision): PlayerView {
  const player = vision.player;
  const units = state.units
    .filter((u) => u.ownerId === player || isVisible(vision, u.x, u.z))
    .map((u) => (u.ownerId === player ? u : seenFromOutside(u)));
  const own = state.buildings.filter((b) => b.ownerId === player);
  const ownIds = new Set(own.map((b) => b.id));
  const others = [...vision.lastSeen.values()].sort((a, b) => a.id - b.id);
  const visibleBuildings = new Set(
    state.buildings.filter((b) => !ownIds.has(b.id) && buildingSeen(vision, b)).map((b) => b.id),
  );
  const visibleUnits = new Set(units.map((u) => u.id));
  const stock = state.stocks[player];
  return {
    player,
    tick: state.tick,
    units,
    buildings: [...own, ...others],
    construction: pick(state.construction, (id) => ownIds.has(id)),
    training: pick(state.training, (id) => ownIds.has(id)),
    fields: pick(state.fields, (id) => ownIds.has(id)),
    upgrades: pick(state.upgrades, (id) => ownIds.has(id)),
    buildingDamage: pick(state.buildingDamage, (id) => ownIds.has(id) || visibleBuildings.has(id)),
    stocks: stock ? { [player]: stock } : {},
    projectiles: state.projectiles.filter(
      (p) =>
        p.ownerId === player ||
        isVisible(vision, p.fromX, p.fromZ) ||
        visibleUnits.has(p.targetId) ||
        visibleBuildings.has(p.targetId),
    ),
    ruins: state.ruins.filter((r) => isExplored(vision, r.x, r.z)),
    resourceNodes: pick(state.resourceNodes, (id) => {
      const node = world.decorations[id];
      return node !== undefined && isExplored(vision, node.x, node.z);
    }),
    casts: state.casts.filter((c) => c.ownerId === player || isVisible(vision, c.x, c.z)),
    wavesSent: state.wavesSent,
    lastWaveAt: state.lastWaveAt,
  };
}
