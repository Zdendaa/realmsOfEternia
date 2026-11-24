import type { ResourceId } from '@roe/game-data';
import flour from './flour.svg';
import food from './food.svg';
import gold from './gold.svg';
import grain from './grain.svg';
import iron from './iron.svg';
import mana from './mana.svg';
import population from './population.svg';
import stone from './stone.svg';
import wood from './wood.svg';

/** Icon URL per resource (original SVGs, drawn on a 24-unit grid at 48 px). */
export const RESOURCE_ICONS: Record<ResourceId, string> = {
  wood,
  stone,
  iron,
  gold,
  food,
  mana,
  grain,
  flour,
};

/** Population (serfs and workers against housing), same style as the resource icons. */
export const POPULATION_ICON = population;
