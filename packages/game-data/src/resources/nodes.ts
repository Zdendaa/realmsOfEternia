import type { DecorationKind } from '@roe/shared';
import type { ResourceId } from './definitions.js';

/** A tree or rock as a source of resources. */
export interface ResourceNodeDefinition {
  resource: ResourceId;
  /** Amount at scale 1; the decoration's scale multiplies it (rounded, then clamped). */
  amountPerScale: number;
  minAmount: number;
  maxAmount: number;
  /** Seconds of work for one unit of the resource. */
  workSeconds: number;
}

/** Trees give wood, rocks give stone. Only nodes inside the playable area can be harvested. */
export const RESOURCE_NODES = {
  tree: { resource: 'wood', amountPerScale: 4, minAmount: 3, maxAmount: 5, workSeconds: 3 },
  rock: { resource: 'stone', amountPerScale: 7, minAmount: 6, maxAmount: 12, workSeconds: 4 },
} as const satisfies Record<DecorationKind, ResourceNodeDefinition>;

export const GATHER_RULES = {
  /** Units of a resource a villager carries per trip. */
  carryCapacity: 1,
  /** After a node runs out, gatherers look for the next one of its kind this close to it. */
  nextNodeRadius: 14,
} as const;
