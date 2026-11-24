import type { Decoration, DecorationKind, EntityId, Vec2 } from '@roe/shared';
import { LOCAL_PLAYER } from '../state/gameStore';
import type { PointerTarget } from './pointerTarget';

/** Cursor shapes over the 3D view; styled in `ui/cursors/cursors.css`. */
export type CursorKind = 'default' | 'select' | 'move' | 'build' | 'blocked' | 'chop' | 'mine';

/** Cursor over a harvestable tree or rock while serfs are selected. */
const RESOURCE_CURSOR: Record<DecorationKind, CursorKind> = {
  tree: 'chop',
  rock: 'mine',
};

/** What right click would do with the current selection. */
export type CommandIntent =
  | { kind: 'build'; siteId: EntityId }
  /** (x, z): the clicked point, sent to the sim; `destination`: where the units end up. */
  | { kind: 'move'; x: number; z: number; destination: Vec2 }
  | { kind: 'gather'; node: Decoration }
  | { kind: 'blocked' }
  | { kind: 'none' };

/**
 * The right-click command for selected serfs: build an own construction site, harvest
 * a tree or rock, or walk. Water and steep slopes are fine: the units go to the nearest
 * walkable spot, as the sim resolves it. Blocked: other buildings, trees and rocks that
 * can't be harvested (the border forest), and points with nothing reachable nearby. Own
 * units under the pointer are ignored, so right-clicking a serf walks to the ground there.
 */
export function commandIntent(target: PointerTarget): CommandIntent {
  const { building, ground } = target;
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
 * The cursor for what's under the pointer. Own units show "select"; with serfs
 * selected the cursor shows the right-click command; otherwise own buildings show
 * "select".
 */
export function cursorFor(target: PointerTarget, serfsSelected: boolean): CursorKind {
  if (target.unitId !== null) return 'select';
  if (serfsSelected) {
    const intent = commandIntent(target);
    if (intent.kind === 'gather') return RESOURCE_CURSOR[intent.node.kind];
    return intent.kind === 'none' ? 'default' : intent.kind;
  }
  return target.building?.ownerId === LOCAL_PLAYER ? 'select' : 'default';
}
