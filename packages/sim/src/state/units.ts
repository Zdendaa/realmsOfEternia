import type { ResourceId, UnitKind } from '@roe/game-data';
import type { EntityId, PlayerId, Vec2 } from '@roe/shared';

/** What a unit has been told (or decided) to do. */
export type UnitTask =
  | { kind: 'idle' }
  /** Walk to a point, then become idle. */
  | { kind: 'move'; x: number; z: number }
  /** Build a construction site from work slot `slot`. `manual`: assigned by the player. */
  | { kind: 'build'; siteId: EntityId; slot: number; manual: boolean }
  /**
   * Harvest a tree or rock (decoration id `nodeId`) and carry the goods to storage, again
   * and again, moving on to nearby nodes of the same kind when one runs out.
   * `progress`: ticks of work toward the next unit (while working), or walks to the
   * storage door so far (while carrying goods there).
   */
  | { kind: 'gather'; nodeId: number; phase: GatherPhase; progress: number };

/** Where a gatherer is in its loop. */
export type GatherPhase = 'toNode' | 'working' | 'toStorage';

/** Goods a unit is carrying. */
export interface Cargo {
  resource: ResourceId;
  amount: number;
}

/** How the unit is moving toward its current goal. Null when standing still. */
export interface UnitMovement {
  goal: Vec2;
  /** Planned route ending at (or near) the goal. Null while waiting for the path planner. */
  waypoints: readonly Vec2[] | null;
  /** Index of the waypoint the unit is walking to. */
  next: number;
  /** Ticks without getting closer to the goal. */
  stuckTicks: number;
  /** Closest distance to the goal so far (for stuck detection). */
  bestDistance: number;
  /** How often the route was re-planned because the unit got stuck. */
  replans: number;
}

/** What the unit is visibly doing; rendering picks the animation from this. */
export type UnitActivity = 'idle' | 'walking' | 'working';

export interface UnitInstance {
  id: EntityId;
  type: UnitKind;
  ownerId: PlayerId | null;
  x: number;
  z: number;
  task: UnitTask;
  movement: UnitMovement | null;
  activity: UnitActivity;
  /** What the unit carries, or null. Kept through other orders until delivered. */
  carrying: Cargo | null;
}

export const IDLE: UnitTask = { kind: 'idle' };
