/**
 * `main`: the six resources from the design doc, always shown in the resource bar.
 * `goods`: intermediate products of production chains (grain, flour), shown as a smaller
 * group after them.
 */
export type ResourceCategory = 'main' | 'goods';

export interface ResourceDefinition {
  id: string;
  name: string;
  category: ResourceCategory;
}

/** All resources, in display order (main resources first, then goods). */
export const RESOURCES = {
  wood: { id: 'wood', name: 'Wood', category: 'main' },
  stone: { id: 'stone', name: 'Stone', category: 'main' },
  iron: { id: 'iron', name: 'Iron', category: 'main' },
  gold: { id: 'gold', name: 'Gold', category: 'main' },
  food: { id: 'food', name: 'Food', category: 'main' },
  mana: { id: 'mana', name: 'Mana', category: 'main' },
  grain: { id: 'grain', name: 'Grain', category: 'goods' },
  flour: { id: 'flour', name: 'Flour', category: 'goods' },
} as const satisfies Record<string, ResourceDefinition>;

export type ResourceId = keyof typeof RESOURCES;

/** Every resource id, in display order. */
export const RESOURCE_IDS = Object.keys(RESOURCES) as readonly ResourceId[];

/** The resource ids of one category, in display order. */
export const resourcesIn = (category: ResourceCategory): readonly ResourceId[] =>
  RESOURCE_IDS.filter((id) => RESOURCES[id].category === category);

/** An amount for every resource (a player's stock). Whole numbers. */
export type ResourceAmounts = Record<ResourceId, number>;

/** Amount per resource; resources that aren't needed are omitted. */
export type ResourceCost = Partial<Record<ResourceId, number>>;
