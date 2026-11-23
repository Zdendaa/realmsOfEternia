import type { BuildingDefinition } from '@roe/game-data';

/**
 * Local (x, z) offsets of each model tile in a building, before rotation. A building
 * without tiling has a single tile at its center.
 */
export function tileOffsets(definition: BuildingDefinition): { x: number; z: number }[] {
  const tiling = definition.modelTiling;
  if (!tiling) return [{ x: 0, z: 0 }];
  const offsets: { x: number; z: number }[] = [];
  for (let c = 0; c < tiling.cols; c++) {
    for (let r = 0; r < tiling.rows; r++) {
      offsets.push({
        x: (c - (tiling.cols - 1) / 2) * tiling.stepX,
        z: (r - (tiling.rows - 1) / 2) * tiling.stepZ,
      });
    }
  }
  return offsets;
}
