import { flattenHeightField, type HeightField } from '@roe/shared';
import type { SimWorld } from '../world/createWorld.js';
import { toPlacedFootprint, type GameState } from './gameState.js';

/**
 * Terrain as it is in a given state: natural terrain flattened under every building and
 * every ruin (the ground stays flat where a building stood). For the initial state this
 * equals `world.heights`. Recreate it whenever buildings change.
 */
export function createStateHeights(
  world: SimWorld,
  state: Pick<GameState, 'buildings' | 'ruins'>,
): HeightField {
  return flattenHeightField(world.terrain, [
    ...state.ruins.map(toPlacedFootprint),
    ...state.buildings.map(toPlacedFootprint),
  ]);
}
