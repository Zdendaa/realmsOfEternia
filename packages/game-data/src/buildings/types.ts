import type { DecorationKind, Footprint } from '@roe/shared';
import type { ResourceCost, ResourceId } from '../resources/definitions.js';
import type { ProfessionId } from '../units/professions.js';

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

export interface BuildingDefinition {
  id: string;
  name: string;
  description: string;
  /** Model file, relative to the client's public root. */
  modelPath: string;
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
  /** Set for production buildings (see `ProductionDefinition`). */
  production?: ProductionDefinition;
}
