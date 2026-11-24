import { entrancePoint, type Vec2 } from '@roe/shared';
import type { BuildingInstance } from './gameState.js';
import { toPlacedFootprint } from './gameState.js';

/** Distance in front of the entrance where new units appear. */
const SPAWN_GAP = 1.5;
const SPAWN_SPACING = 0.9;
const SPAWN_ROW = 5;

/**
 * Where the `index`-th unit spawned at a building appears: a small grid in front of its
 * entrance, so a group of new units doesn't start on one point.
 */
export function spawnPoint(building: BuildingInstance, index: number): Vec2 {
  const area = toPlacedFootprint(building);
  const door = entrancePoint(area, SPAWN_GAP);
  const slot = index % (SPAWN_ROW * 3);
  const lateral = ((slot % SPAWN_ROW) - (SPAWN_ROW - 1) / 2) * SPAWN_SPACING;
  const forward = Math.floor(slot / SPAWN_ROW) * SPAWN_SPACING;
  // Entrance faces local +Z: forward = (sin r, cos r), sideways = (cos r, -sin r).
  const sin = Math.sin(building.rotation);
  const cos = Math.cos(building.rotation);
  return {
    x: door.x + sin * forward + cos * lateral,
    z: door.z + cos * forward - sin * lateral,
  };
}
