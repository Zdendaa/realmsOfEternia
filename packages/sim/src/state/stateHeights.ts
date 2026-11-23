import { flattenHeightField, type HeightField } from '@roe/shared';
import type { SimWorld } from '../world/createWorld.js';
import { toPlacedFootprint, type GameState } from './gameState.js';

/**
 * Terrain as it is in a given state: natural terrain flattened under every building.
 * For the initial state this equals `world.heights`. Recreate it whenever buildings change.
 */
export function createStateHeights(world: SimWorld, state: GameState): HeightField {
  return flattenHeightField(world.terrain, state.buildings.map(toPlacedFootprint));
}
