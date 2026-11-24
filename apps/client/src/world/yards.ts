import type { BuildingDefinition } from '@roe/game-data';
import { entrancePoint, type PlacedFootprint } from '@roe/shared';
import type { WornPatch } from './decorateWorld';

/**
 * Added to the half-diagonal for the base patch's radius. Wear is full only in the inner
 * third of a patch and fades outward, so this leaves ~1.5–2 units of dirt around the walls.
 */
const YARD_MARGIN = 2.5;

/**
 * Trampled dirt for a building with a `yard` (Hexagon models stand straight on the
 * grass, unlike the Builder Pack's with their own dirt plates): one patch around the
 * base, reaching just past the corners, and one in front of the entrance where people
 * come and go. Cosmetic; baked into the terrain colors.
 */
export function yardPatches(
  building: PlacedFootprint & { definition: Pick<BuildingDefinition, 'yard'> },
): WornPatch[] {
  if (!building.definition.yard) return [];
  const { w, d } = building.footprint;
  const front = entrancePoint(building, 1.8);
  return [
    { x: building.x, z: building.z, radius: Math.hypot(w, d) / 2 + YARD_MARGIN },
    { ...front, radius: Math.min(w, d) * 0.5 + 1.5 },
  ];
}
