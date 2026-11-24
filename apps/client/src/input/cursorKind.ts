import type { DecorationKind, EntityId } from '@roe/shared';
import { LOCAL_PLAYER } from '../state/gameStore';
import type { PointerTarget } from './pointerTarget';

/** Cursor shapes over the 3D view; styled in `ui/cursors/cursors.css`. */
export type CursorKind = 'default' | 'select' | 'move' | 'build' | 'blocked' | 'chop' | 'mine';

/**
 * Cursor over a tree or rock while serfs are selected. Phase 5 switches these to
 * 'chop' and 'mine' when serfs can gather; until then they block movement like any
 * obstacle.
 */
const RESOURCE_CURSOR: Record<DecorationKind, CursorKind> = {
  tree: 'blocked',
  rock: 'blocked',
};

/** What right click would do with the current selection. */
export type CommandIntent =
  | { kind: 'build'; siteId: EntityId }
  | { kind: 'move'; x: number; y: number; z: number }
  | { kind: 'blocked' }
  | { kind: 'none' };

/**
 * The right-click command for selected serfs: build an own construction site, walk to
 * walkable ground; buildings, water, slopes, trees and rocks are blocked. Own units
 * under the pointer are ignored, so right-clicking a serf walks to the ground there.
 */
export function commandIntent(target: PointerTarget): CommandIntent {
  const { building, ground } = target;
  if (building) {
    return building.status === 'construction' && building.ownerId === LOCAL_PLAYER
      ? { kind: 'build', siteId: building.id }
      : { kind: 'blocked' };
  }
  if (!ground) return { kind: 'none' };
  return ground.walkable
    ? { kind: 'move', x: ground.x, y: ground.y, z: ground.z }
    : { kind: 'blocked' };
}

/**
 * The cursor for what's under the pointer. Own units show "select"; with serfs
 * selected the cursor shows the right-click command; otherwise own buildings show
 * "select".
 */
export function cursorFor(target: PointerTarget, serfsSelected: boolean): CursorKind {
  if (target.unitId !== null) return 'select';
  if (serfsSelected) {
    const intent = commandIntent(target);
    if (intent.kind === 'blocked' && target.ground?.resource && !target.building) {
      return RESOURCE_CURSOR[target.ground.resource.kind];
    }
    return intent.kind === 'none' ? 'default' : intent.kind;
  }
  return target.building?.ownerId === LOCAL_PLAYER ? 'select' : 'default';
}
