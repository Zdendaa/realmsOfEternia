import type { ResourceId } from '@roe/game-data';
import food from './food.svg';
import gold from './gold.svg';
import iron from './iron.svg';
import mana from './mana.svg';
import stone from './stone.svg';
import wood from './wood.svg';

/** Icon URL per resource (original SVGs, drawn on a 24-unit grid at 48 px). */
export const RESOURCE_ICONS: Record<ResourceId, string> = { wood, stone, iron, gold, food, mana };
