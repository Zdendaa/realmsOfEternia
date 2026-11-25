import type { Decoration, DecorationKind, EntityId, Vec2 } from '@roe/shared';
import { LOCAL_PLAYER } from '../state/gameStore';
import type { PointerTarget } from './pointerTarget';

/** Cursor shapes over the 3D view; styled in `ui/cursors/cursors.css`. */
export type CursorKind =
  'default' | 'select' | 'move' | 'build' | 'blocked' | 'chop' | 'mine' | 'attack';

/** Cursor over a harvestable tree or rock while serfs are selected. */
const RESOURCE_CURSOR: Record<DecorationKind, CursorKind> = {
  tree: 'chop',
  rock: 'mine',
};

/** What right click would do with the current selection. */
export type CommandIntent =
  | { kind: 'attack'; targetId: EntityId }
  | { kind: 'build'; siteId: EntityId }
  /** (x, z): the clicked point, sent to the sim; `destination`: where the units end up. */
  | { kind: 'move'; x: number; z: number; destination: Vec2 }
  | { kind: 'gather'; node: Decoration }
  | { kind: 'blocked' }
  | { kind: 'none' };

/** What is selected, as far as commands care. */
export interface SelectionKinds {
  /** Any own units are selected. */
  units: boolean;
  /** Some of them fight (soldiers). */
  fighters: boolean;
}

/**
 * The right-click command for the selected units: attack an enemy unit (when some of
 * them fight), build an own construction site, harvest a tree or rock, or walk. Water and steep slopes are fine: the units go to the nearest
 * walkable spot, as the sim resolves it. Blocked: other buildings, trees and rocks that
 * can't be harvested (the border forest), and points with nothing reachable nearby. Own
 * units under the pointer are ignored, so right-clicking a serf walks to the ground there.
 */
export function commandIntent(target: PointerTarget, fighters = false): CommandIntent {
  const { building, ground } = target;
  if (fighters && target.enemyId !== null) return { kind: 'attack', targetId: target.enemyId };
  if (building) {
    return building.status === 'construction' && building.ownerId === LOCAL_PLAYER
      ? { kind: 'build', siteId: building.id }
      : { kind: 'blocked' };
  }
  if (!ground) return { kind: 'none' };
  if (ground.resource) {
    return ground.harvestable ? { kind: 'gather', node: ground.resource } : { kind: 'blocked' };
  }
  if (!ground.reachable) return { kind: 'blocked' };
  return { kind: 'move', x: ground.x, z: ground.z, destination: ground.reachable };
}

/**
 * Where an attack-move (F, then left click) would go: an enemy unit under the pointer
 * is attacked directly, a reachable point is attack-moved to, anything else is blocked.
 */
export function attackMoveIntent(target: PointerTarget): CommandIntent {
  if (target.enemyId !== null) return { kind: 'attack', targetId: target.enemyId };
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
  if (attackMove) return attackMoveIntent(target).kind === 'blocked' ? 'blocked' : 'attack';
  if (target.unitId !== null) return 'select';
  if (selection.units) {
    const intent = commandIntent(target, selection.fighters);
    if (intent.kind === 'gather') return RESOURCE_CURSOR[intent.node.kind];
    return intent.kind === 'none' ? 'default' : intent.kind;
  }
  return target.building?.ownerId === LOCAL_PLAYER ? 'select' : 'default';
}
