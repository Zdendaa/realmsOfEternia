import type { DecorationKind, DepositKind, Footprint } from '@roe/shared';
import type { ResourceCost, ResourceId } from '../resources/definitions.js';
import type { AttackDefinition } from '../units/combat.js';
import type { UnitKind } from '../units/definitions.js';
import type { ProfessionId } from '../units/professions.js';

/**
 * One model of a building assembled from several (a storehouse yard from props), placed
 * in the building's local space: offset in world units (entrance toward +Z), Y rotation in
 * radians, uniform scale.
 */
export interface ModelPartPlacement {
  modelPath: string;
  x: number;
  z: number;
  /** Height above the ground (stacked on another part). */
  y?: number;
  rotation?: number;
  scale: number;
  /** Draws only the model's node of this name (with its children); absent: all of it. */
  node?: string;
}

/** A model repeated on a grid inside one building (e.g. a field of crop tiles). */
export interface ModelTiling {
  cols: number;
  rows: number;
  /** Distance between tile centers along local X and local Z, in world units. */
  stepX: number;
  stepZ: number;
}

/**
 * Harvesting (lumbermill, quarry): the worker harvests `node`s (trees or rocks) within
 * `workRadius` of the building, processes each unit at the building for
 * `processSeconds` and carries it to the nearest storage.
 */
export interface HarvestProduction {
  kind: 'harvest';
  /** The worker's profession (its look). */
  profession: ProfessionId;
  node: DecorationKind;
  workRadius: number;
  processSeconds: number;
}

/**
 * Farming (field): the farmer sows every plot of the field (its `modelTiling` tiles) one
 * by one, the crop grows for `growSeconds`, then the farmer harvests plot by plot and
 * carries 1 `crop` per plot to the nearest storage.
 */
export interface FarmProduction {
  kind: 'farm';
  profession: ProfessionId;
  crop: ResourceId;
  sowSeconds: number;
  growSeconds: number;
  harvestSeconds: number;
}

/** An amount of one resource (a process step's input or output). */
export interface ResourceAmount {
  resource: ResourceId;
  amount: number;
}

/**
 * Processing (mill, bakery): the worker fetches `input` from storage (taken from the stock
 * as they set off, so no two workers count on the same unit), works on it at the building
 * for `seconds`, and carries `output` to storage. Per trip the worker handles as many
 * steps as its profession's `carryCapacity` allows on both ways.
 */
export interface ProcessProduction {
  kind: 'process';
  profession: ProfessionId;
  input: ResourceAmount;
  output: ResourceAmount;
  /** Seconds of work per step (one input → one output). */
  seconds: number;
  /** Mines: must be built on a deposit of this kind (placement rule). */
  deposit?: DepositKind;
}

/**
 * What a production building does once complete. Every production building gets one
 * worker (housing permitting).
 */
export type ProductionDefinition = HarvestProduction | FarmProduction | ProcessProduction;

/** A model part that turns while the building's worker is at work (mill sails). */
export interface SpinningPart {
  /** Name of the model mesh; its node's origin is the hub. */
  mesh: string;
  /** Axis of its own node it turns around. */
  axis: 'x' | 'y' | 'z';
  /** Full turns per second at working speed. */
  turnsPerSecond: number;
}

/**
 * How a wall's model is fitted to its segments (client). The model is first turned and
 * moved so that it runs along local X and is centered, then stretched per axis: to the
 * segment's length, and to `height` and `depth` in world units.
 */
export interface WallModel {
  /** Model extents in pack units after turning: along the wall, up, across. */
  size: { length: number; height: number; depth: number };
  /** Rotation around Y that makes the model run along X (radians). */
  turn: number;
  /** Where the model's middle sits in its own space (pack units), moved to the origin. */
  center: { x: number; z: number };
  /** Drawn height and thickness in world units. */
  height: number;
  depth: number;
  /**
   * Gate doors: model nodes drawn on their own, each swinging around its own origin (its
   * hinge) by `openAngle` (radians, around Y) when the gate stands open.
   */
  doors?: readonly { node: string; openAngle: number }[];
  /** The post at wall ends, corners and junctions. */
  post:
    | { kind: 'model'; modelPath: string; scale: number; stretchY: number }
    /** A primitive stand-in: a tapered wooden log. */
    | { kind: 'log'; radius: number; height: number; color: string };
}

/** A tower shoots by itself at enemy units in range (no garrison). */
export interface TowerDefinition {
  /** Damage, seconds between shots, range from the tower's center, arrow speed. */
  attack: AttackDefinition & {
    /** The target's armor doesn't reduce the damage. */
    ignoresArmor?: boolean;
  };
  /** Height above the ground the shot leaves from (world units). */
  launchHeight: number;
  /**
   * The shot bursts: every enemy unit within `radius` of the point of impact takes the
   * attack's damage.
   */
  splash?: { radius: number };
  /** The unit hit walks at `factor` of its speed for `seconds`. */
  slow?: { factor: number; seconds: number };
  /** Everyone caught in the splash burns: damage once a second for `seconds`. */
  burn?: { damagePerSecond: number; seconds: number };
  /** How the shot looks (client): an arrow (scaled) or a glowing orb. */
  shot: { look: 'arrow'; size: number } | { look: 'orb'; size: number; color: string };
  /** A prop on top that tells tower types apart (client; a temporary stand-in). */
  topper?: {
    kind: 'crossbow' | 'orb' | 'brazier';
    /** Height of its base above the ground (world units). */
    height: number;
  };
}

export interface BuildingDefinition {
  id: string;
  name: string;
  description: string;
  /** Model file, relative to the client's public root. */
  modelPath: string;
  /**
   * Alternative models (including `modelPath`), picked per building by its id
   * (`modelPathOf`): purely cosmetic variety, e.g. two house styles. Every variant fits
   * the footprint.
   */
  modelVariants?: readonly string[];
  /**
   * How its construction site looks: `stages` (default) shows the Hexagon pack's building
   * stages and scaffolding; `reveal` raises the finished model from the ground (fields,
   * whose crop tiles don't suit a building shell).
   */
  construction?: 'stages' | 'reveal';
  /**
   * When set, the building is drawn as these models (instead of `modelPath`, which then
   * names the main one). Every part fits the footprint.
   */
  parts?: readonly ModelPartPlacement[];
  /** Draws a trampled dirt yard around its base and in front of its entrance (cosmetic). */
  yard?: boolean;
  /** When set, the model is drawn as a grid of tiles centered on the building. */
  modelTiling?: ModelTiling;
  /**
   * Name of the model mesh that shows the crop (fields). The renderer draws it per plot
   * with growth stages instead of as part of the static model.
   */
  cropMesh?: string;
  /** A part that turns while the worker works (drawn by the renderer, not instanced). */
  spinningPart?: SpinningPart;
  /** Chimney top in model units: smoke rises from here while the worker works. */
  smokeFrom?: { x: number; y: number; z: number };
  /**
   * The model is a stand-in until a fitting one exists (listed in status.md under
   * temporary models).
   */
  temporary?: boolean;
  /**
   * Ground area the building occupies, in world units (w along local X, d along local Z).
   * Measured from the model's bounding box × `scale`, rounded up to 0.5.
   */
  footprint: Footprint;
  /** Uniform scale from model units to world units. */
  scale: number;
  /**
   * Y rotation (radians) applied before the placement rotation, so the entrance faces local +Z.
   * All current KayKit models already face +Z (measured from material centroids: doors,
   * yards and work areas sit on +Z), so this is 0 for now.
   */
  rotationOffset: number;
  /**
   * Research that unlocks it (a research id). Reserved for the technology tree (Phase 9);
   * nothing reads it yet.
   */
  requires?: string;
  /** Whether players may place it from the construction menu. */
  buildable: boolean;
  /** Construction cost, paid from the player's stock when the site is placed. */
  cost: ResourceCost;
  /** Seconds one serf needs to build it. More builders work linearly faster. */
  buildTime: number;
  /** How many serfs can work on its construction site at once. */
  maxBuilders: number;
  /**
   * Population capacity the building adds once complete (Town Hall, houses). Every serf
   * and worker takes one place.
   */
  housing?: number;
  /**
   * Units may walk across it (fields): its footprint doesn't block the nav grid. It still
   * blocks placing other buildings.
   */
  walkable?: boolean;
  /**
   * A wall segment: placed only by drawing a line (`placeWall`, see `WALL_RULES`), never
   * on its own. Its footprint width is the length of a straight segment (diagonal ones are
   * √2 longer), it may touch other walls and cross paths, and it doesn't flatten terrain.
   */
  wall?: boolean;
  /**
   * A gate: made from a segment of the wall type named here (`makeGate`). Once complete,
   * its owner's units walk through it; for everyone else it is a wall.
   */
  gateOf?: string;
  /** Set on walls: how the model is fitted to a segment. */
  wallModel?: WallModel;
  /** Set on towers. */
  tower?: TowerDefinition;
  /**
   * Buildings this one can be upgraded into (towers). An upgrade costs the new type's
   * `cost` and takes its `buildTime`; the footprint must be the same.
   */
  upgradesTo?: readonly string[];
  /** Multiplied over the model's colors (client); the team color stays as it is. */
  tint?: string;
  /** Set for production buildings (see `ProductionDefinition`). */
  production?: ProductionDefinition;
  /**
   * Units this building trains once complete (barracks, archery range), queued and paid
   * one at a time (see `UnitDefinition.trainTime`).
   */
  trains?: readonly UnitKind[];
  /**
   * Hit points when complete. Absent: derived from the footprint (`buildingHealthOf`).
   * Construction sites have a share of it that grows with their progress.
   */
  health?: number;
  /** How far it sees in the fog of war (world units); absent: `BUILDING_SIGHT.default` (see sight.ts). */
  sight?: number;
}
