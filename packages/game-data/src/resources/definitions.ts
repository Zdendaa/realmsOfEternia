export interface ResourceDefinition {
  id: string;
  name: string;
}

/** All resources from the design doc, in display order. Only wood, stone and gold are used by costs so far. */
export const RESOURCES = {
  wood: { id: 'wood', name: 'Wood' },
  stone: { id: 'stone', name: 'Stone' },
  iron: { id: 'iron', name: 'Iron' },
  gold: { id: 'gold', name: 'Gold' },
  food: { id: 'food', name: 'Food' },
  mana: { id: 'mana', name: 'Mana' },
} as const satisfies Record<string, ResourceDefinition>;

export type ResourceId = keyof typeof RESOURCES;

/** Every resource id, in display order. */
export const RESOURCE_IDS = Object.keys(RESOURCES) as readonly ResourceId[];

/** An amount for every resource (a player's stock). Whole numbers. */
export type ResourceAmounts = Record<ResourceId, number>;

/** Amount per resource; resources that aren't needed are omitted. */
export type ResourceCost = Partial<Record<ResourceId, number>>;
