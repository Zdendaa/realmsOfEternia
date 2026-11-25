import { attackOf, combatOf, type ResourceId, type UnitKind } from '@roe/game-data';
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
  | WorkTask
  /** Chase and fight one enemy unit until it dies (ordered by the player). */
  | { kind: 'attack'; targetId: EntityId }
  /** Walk to a point, fighting every enemy met on the way. */
  | { kind: 'attackMove'; x: number; z: number };

/** Where a builder fetching material is. */
export type DeliverPhase = 'toStorage' | 'toSite';

/**
 * Where a worker is in its loop at its production building.
 * Harvesting (lumbermill, quarry): `toNode` → `working` (at the node) → `toBuilding` →
 * `processing` → `toStorage`; `waiting`: nothing to harvest within reach right now.
 * Farming (field): `toPlot` → `sowing` plot by plot; `waiting` while the crop grows;
 * `toPlot` → `harvesting` → `toStorage` for every plot.
 * Processing (mill, bakery): `waiting` for input in stock → `fetching` it from storage
 * (already taken from the stock) → `toBuilding` → `processing` → `toStorage`.
 */
export type WorkPhase =
  | 'waiting'
  | 'toNode'
  | 'working'
  | 'toBuilding'
  | 'processing'
  | 'toStorage'
  | 'toPlot'
  | 'sowing'
  | 'harvesting'
  | 'fetching';

/** Where a gatherer is in its loop. */
export type GatherPhase = 'toNode' | 'working' | 'toStorage';

/** A worker's job at its production building. */
export interface WorkTask {
  kind: 'work';
  buildingId: EntityId;
  phase: WorkPhase;
  /**
   * What the worker works on: the tree or rock (decoration id) when harvesting, the plot
   * index on a field, the number of input units fetched when processing; -1 when none
   * is chosen.
   */
  target: number;
  /** Ticks of work toward the current step (harvesting, processing, sowing a plot...). */
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
export type UnitActivity = 'idle' | 'walking' | 'working' | 'attacking' | 'dying';

/**
 * A fighting unit's combat state. Timers are tick numbers (not countdowns), so they
 * only change when something happens.
 */
export interface UnitCombat {
  /** The enemy being fought or chased, or null. */
  targetId: EntityId | null;
  /**
   * The enemy wall segment in the way: the unit breaks it before it goes on with what it
   * was doing. Null when nothing has to be broken.
   */
  breachId: EntityId | null;
  /**
   * The tower that shot the unit while it had nothing better to do: it goes for it, past
   * its sight and leash, until the tower falls or a new order comes. Null otherwise.
   */
  provokedBy: EntityId | null;
  /** First tick on which the unit may start its next attack. */
  readyAt: number;
  /** Tick on which the attack in progress hits (melee) or releases its arrow; null when not attacking. */
  strikeAt: number | null;
  /**
   * Where a unit that engaged on its own (while idle) returns after the fight, and what
   * its leash is measured from; null otherwise.
   */
  anchor: Vec2 | null;
  /**
   * Where a guard (a camp's monster) belongs: every fight it starts on its own is leashed
   * to this spot, and it walks back here afterwards. Null for everyone else.
   */
  home: Vec2 | null;
}

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
  /** Slowed by magic: walks at `factor` of its speed until the tick `until`. */
  slowed: { until: number; factor: number } | null;
  /** On fire until the tick `until`: `damage` once a second, credited to `by`. */
  burning: { until: number; damage: number; by: PlayerId | null } | null;
  /** Hit points left (integer); the unit dies at 0. */
  health: number;
  /** Combat state of units that fight; null for villagers. */
  combat: UnitCombat | null;
  /** Tick the unit died on (it lies on the ground until removed), or null while alive. */
  diedAt: number | null;
}

export const IDLE: UnitTask = { kind: 'idle' };

/** A fresh, idle unit of `type` at full health. */
export function createUnit(
  id: EntityId,
  type: UnitKind,
  ownerId: PlayerId | null,
  at: Vec2,
  task: UnitTask = IDLE,
): UnitInstance {
  const fights = attackOf(type) !== undefined;
  return {
    id,
    type,
    ownerId,
    x: at.x,
    z: at.z,
    task,
    movement: null,
    activity: 'idle',
    carrying: null,
    slowed: null,
    burning: null,
    health: combatOf(type).health,
    combat: fights
      ? {
          targetId: null,
          breachId: null,
          provokedBy: null,
          readyAt: 0,
          strikeAt: null,
          anchor: null,
          home: null,
        }
      : null,
    diedAt: null,
  };
}

/** True while the unit is alive (dead units lie on the ground until removed). */
export const isAlive = (unit: Pick<UnitInstance, 'diedAt'>) => unit.diedAt === null;
