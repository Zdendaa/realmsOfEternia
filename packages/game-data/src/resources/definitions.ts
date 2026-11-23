export interface ResourceDefinition {
  id: string;
  name: string;
}

/** All resources from the design doc. Only wood, stone and gold are used by costs so far. */
export const RESOURCES = {
  wood: { id: 'wood', name: 'Wood' },
  stone: { id: 'stone', name: 'Stone' },
  iron: { id: 'iron', name: 'Iron' },
  gold: { id: 'gold', name: 'Gold' },
  food: { id: 'food', name: 'Food' },
  mana: { id: 'mana', name: 'Mana' },
} as const satisfies Record<string, ResourceDefinition>;

export type ResourceId = keyof typeof RESOURCES;

/** Amount per resource; resources that aren't needed are omitted. */
export type ResourceCost = Partial<Record<ResourceId, number>>;
