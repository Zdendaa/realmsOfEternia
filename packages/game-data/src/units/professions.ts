/**
 * Hat styles the renderer builds in code and places on the character's head
 * (see the client's `professionProps.ts`).
 */
export type HatStyle = 'woolCap' | 'clothCap' | 'strawHat' | 'millerCap' | 'toque' | 'minerHelmet';

export interface ProfessionDefinition {
  id: string;
  name: string;
  /** Tunic color (sRGB hex): replaces the character's profession area (`CharacterModel.tint`). */
  tunic: string;
  hat: HatStyle;
  /**
   * Units of goods the worker carries per trip. Farmers gather several plots' crop before
   * walking to storage; millers, bakers and miners fetch and process several units per
   * trip; woodcutters and stonecutters carry one at a time.
   */
  carryCapacity: number;
}

/**
 * What a worker looks like in each production building: a hat (the silhouette that
 * reads at RTS zoom) and a tunic color. Neckerchief and cuffs keep the player color; the
 * tool in hand follows the kind of work (see the client). Besides the carry capacity, the
 * look is cosmetic only.
 */
export const PROFESSIONS = {
  woodcutter: {
    id: 'woodcutter',
    name: 'Woodcutter',
    tunic: '#55683a',
    hat: 'woolCap',
    carryCapacity: 1,
  },
  stonecutter: {
    id: 'stonecutter',
    name: 'Stonecutter',
    tunic: '#6f7378',
    hat: 'clothCap',
    carryCapacity: 1,
  },
  farmer: { id: 'farmer', name: 'Farmer', tunic: '#a8894f', hat: 'strawHat', carryCapacity: 3 },
  miller: { id: 'miller', name: 'Miller', tunic: '#a9a294', hat: 'millerCap', carryCapacity: 3 },
  baker: { id: 'baker', name: 'Baker', tunic: '#e0d6c2', hat: 'toque', carryCapacity: 4 },
  miner: { id: 'miner', name: 'Miner', tunic: '#4e3b2c', hat: 'minerHelmet', carryCapacity: 3 },
} as const satisfies Record<string, ProfessionDefinition>;

export type ProfessionId = keyof typeof PROFESSIONS;
