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
  | { kind: 'gather'; nodeId: number; phase: GatherPhase; progress: number }
  /**
   * A builder of site `siteId` (work slot `slot`, which it keeps) fetching one unit of
   * `resource` from storage. Each phase starts walking right away; a route that ends
   * short of its target makes the builder give up (idle). Back at the site it delivers
   * and builds again.
   */
  | {
      kind: 'deliver';
      siteId: EntityId;
      slot: number;
      manual: boolean;
      resource: ResourceId;
      phase: DeliverPhase;
    }
  | WorkTask;

/** Where a builder fetching material is. */
export type DeliverPhase = 'toStorage' | 'toSite';

/**
 * A worker's loop at its production building: harvest a node nearby, bring the unit to
 * the building, process it there, carry it to storage, repeat. `waiting`: nothing to
 * harvest within reach right now.
 */
export type WorkPhase =
  'waiting' | 'toNode' | 'working' | 'toBuilding' | 'processing' | 'toStorage';

/** Where a gatherer is in its loop. */
export type GatherPhase = 'toNode' | 'working' | 'toStorage';

/** A worker's job at its production building (`nodeId` is -1 when none is chosen). */
export interface WorkTask {
  kind: 'work';
  buildingId: EntityId;
  phase: WorkPhase;
  nodeId: number;
  /** Ticks of work toward the current step (harvesting or processing). */
  progress: number;
}

/** Goods a unit is carrying. */
export interface Cargo {
  resource: ResourceId;
  amount: number;
  /**
   * Construction material reserved for this site (already paid when it was placed).
   * Brought back to storage it returns to the site's reserve instead of the stock.
   */
  siteId?: EntityId;
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
