import type { UnitKind } from '@roe/game-data';
import type { EntityId, PlayerId, Vec2 } from '@roe/shared';

/** What a unit has been told (or decided) to do. */
export type UnitTask =
  | { kind: 'idle' }
  /** Walk to a point, then become idle. */
  | { kind: 'move'; x: number; z: number }
  /** Build a construction site from work slot `slot`. `manual`: assigned by the player. */
  | { kind: 'build'; siteId: EntityId; slot: number; manual: boolean };

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
}

export const IDLE: UnitTask = { kind: 'idle' };
