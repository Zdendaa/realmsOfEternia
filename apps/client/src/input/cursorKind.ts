import { isWalkableBuilding } from '@roe/game-data';
import type { Decoration, DecorationKind, EntityId, Vec2 } from '@roe/shared';
import { areEnemies } from '@roe/sim';
import { buildingInSight } from '../render/fog/knowledge';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import type { PointerTarget } from './pointerTarget';

/** Cursor shapes over the 3D view; styled in `ui/cursors/cursors.css`. */
export type CursorKind =
  | 'default'
  | 'select'
  | 'move'
  | 'build'
  | 'blocked'
  | 'chop'
  | 'mine'
  | 'attack'
  | 'aim'
  | 'revive';

/** Cursor over a harvestable tree or rock while serfs are selected (only they gather). */
const RESOURCE_CURSOR: Record<DecorationKind, CursorKind> = {
  tree: 'chop',
  rock: 'mine',
};

/** What right click would do with the current selection. */
export type CommandIntent =
  | { kind: 'attack'; targetId: EntityId }
  | { kind: 'revive'; graveId: EntityId }
  | { kind: 'build'; siteId: EntityId }
  | { kind: 'repair'; buildingId: EntityId }
  /** (x, z): the clicked point, sent to the sim; `destination`: where the units end up. */
  | { kind: 'move'; x: number; z: number; destination: Vec2 }
  | { kind: 'gather'; node: Decoration }
  | { kind: 'blocked' }
  | { kind: 'none' };

/** What is selected, as far as commands care. */
export interface SelectionKinds {
  /** Any own units are selected. */
  units: boolean;
  /** Some of them fight (soldiers and siege engines). */
  fighters: boolean;
  /** Some of those can hit units (rams only hit buildings). */
  hitsUnits: boolean;
  /** Some of them are serfs: only they gather and build. */
  serfs: boolean;
}

/**
 * The right-click command for the selected units: attack an enemy (when some of them
 * fight), build an own construction site, repair a damaged own building or harvest a
 * tree or rock (when some are serfs), or walk. Without serfs a tree or rock is just an obstacle: like water and
 * steep slopes, the units go to the nearest walkable spot, as the sim resolves it.
 * Buildings units can walk across (fields) are ground too. Blocked: other buildings,
 * trees and rocks serfs can't harvest (the border forest), and points with nothing
 * reachable nearby. Own units under the pointer are ignored, so right-clicking a serf
 * walks to the ground there.
 */
export function commandIntent(target: PointerTarget, selection: SelectionKinds): CommandIntent {
  const { building, ground } = target;
  const { fighters, serfs } = selection;
  if (selection.hitsUnits && target.enemyId !== null) {
    return { kind: 'attack', targetId: target.enemyId };
  }
  if (selection.units && target.graveId !== null) {
    return { kind: 'revive', graveId: target.graveId };
  }
  if (
    fighters &&
    building &&
    areEnemies(LOCAL_PLAYER, building.ownerId) &&
    buildingInSight(building)
  ) {
    return { kind: 'attack', targetId: building.id };
  }
  if (building) {
    if (serfs && building.ownerId === LOCAL_PLAYER) {
      if (building.status === 'construction') return { kind: 'build', siteId: building.id };
      if ((useGameStore.getState().state.buildingDamage[building.id] ?? 0) > 0) {
        return { kind: 'repair', buildingId: building.id };
      }
    }
    if (!isWalkableBuilding(building.type)) return { kind: 'blocked' };
  }
  if (!ground) return { kind: 'none' };
  if (serfs && ground.resource) {
    return ground.harvestable ? { kind: 'gather', node: ground.resource } : { kind: 'blocked' };
  }
  if (!ground.reachable) return { kind: 'blocked' };
  return { kind: 'move', x: ground.x, z: ground.z, destination: ground.reachable };
}

/**
 * Where an attack-move (F, then left click) would go: an enemy unit under the pointer
 * is attacked directly, a reachable point is attack-moved to, anything else is blocked.
 */
export function attackMoveIntent(target: PointerTarget, selection: SelectionKinds): CommandIntent {
  if (selection.hitsUnits && target.enemyId !== null) {
    return { kind: 'attack', targetId: target.enemyId };
  }
  const building = target.building;
  if (building && areEnemies(LOCAL_PLAYER, building.ownerId) && buildingInSight(building)) {
    return { kind: 'attack', targetId: building.id };
  }
  const ground = target.ground;
  if (!ground?.reachable) return { kind: 'blocked' };
  return { kind: 'move', x: ground.x, z: ground.z, destination: ground.reachable };
}

/**
 * The cursor for what's under the pointer. While attack-move waits for its target, the
 * sword (or "blocked"). Own units show "select"; with units selected the cursor shows
 * the right-click command (the sword over enemies when soldiers are selected);
 * otherwise own buildings show "select".
 */
export function cursorFor(
  target: PointerTarget,
  selection: SelectionKinds,
  attackMove = false,
): CursorKind {
  if (attackMove) {
    return attackMoveIntent(target, selection).kind === 'blocked' ? 'blocked' : 'attack';
  }
  if (target.unitId !== null) return 'select';
  if (selection.units) {
    const intent = commandIntent(target, selection);
    if (intent.kind === 'gather') return RESOURCE_CURSOR[intent.node.kind];
    if (intent.kind === 'repair') return 'build'; // the hammer
    return intent.kind === 'none' ? 'default' : intent.kind;
  }
  return target.building?.ownerId === LOCAL_PLAYER ? 'select' : 'default';
}
