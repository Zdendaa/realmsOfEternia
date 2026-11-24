import type { BuildingId, SettlementLayout } from '@roe/game-data';
import type { MapDefinition } from '@roe/shared';
import type { PlaceBuildingCommand } from '../commands/types.js';

/**
 * A small, perfectly flat test map (hillHeight 0) with one lake at (35, 35) and no
 * decorations, so every placement expectation is exact. The border foothills start
 * rising ~42 units from the center.
 */
export const FLAT_MAP: MapDefinition = {
  id: 'test-flat',
  name: 'Test flat',
  size: 120,
  seed: 7,
  terrain: { hillHeight: 0, hillScale: 50 },
  settlement: { halfSize: 10, blend: 5 },
  forest: { scale: 30, threshold: 0.5, strayChance: 0 },
  border: { width: 20, mountainHeight: 20 },
  water: { lakes: [{ x: 35, z: 35, radius: 8, depth: 2, irregularity: 0 }] },
  decorations: [],
};

/** The same map with forests. */
export const FOREST_MAP: MapDefinition = {
  ...FLAT_MAP,
  id: 'test-forest',
  decorations: [
    {
      kind: 'tree',
      placement: 'forest',
      count: 300,
      minSpacing: 2,
      minScale: 0.5,
      maxScale: 0.9,
    },
  ],
};

/** One house at the origin (entrance facing +Z) and a path running north from its door. */
export const SETTLEMENT: SettlementLayout = {
  buildings: [{ building: 'house', x: 0, z: 0, rotation: 0 }],
  paths: [
    [
      { x: 0, z: 3.7 },
      { x: 0, z: 25 },
    ],
  ],
  pathWidth: 2,
  squares: [],
  props: { around: [], models: [], perBuilding: { min: 0, max: 0 } },
  startingSerfs: 0,
};

export function place(
  building: BuildingId,
  x: number,
  z: number,
  quarterTurns = 0,
): PlaceBuildingCommand {
  return { type: 'placeBuilding', building, x, z, quarterTurns };
}

/** A Town Hall at the origin (entrance facing +Z) with five starting serfs. */
export const TOWN: SettlementLayout = {
  buildings: [{ building: 'townHall', x: 0, z: 0, rotation: 0 }],
  paths: [],
  pathWidth: 2,
  squares: [],
  props: { around: [], models: [], perBuilding: { min: 0, max: 0 } },
  startingSerfs: 5,
};
