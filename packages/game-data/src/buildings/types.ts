import type { Footprint } from '@roe/shared';
import type { ResourceCost } from '../resources/definitions.js';

/** A model repeated on a grid inside one building (e.g. a field of crop tiles). */
export interface ModelTiling {
  cols: number;
  rows: number;
  /** Distance between tile centers along local X and local Z, in world units. */
  stepX: number;
  stepZ: number;
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
  /** Construction cost. Displayed only until the economy exists. */
  cost: ResourceCost;
}
