import { MEDIEVAL_PACK } from '../assets/medievalPack.js';
import type { BuildingDefinition } from './types.js';

const model = (file: string) => `${MEDIEVAL_PACK.modelDir}${file}.gltf.glb`;
const S = MEDIEVAL_PACK.worldScale;

/** farm_plot tile spacing inside a field: its footprint plus a thin furrow. */
const PLOT_STEP = { x: 4.6, z: 4.1 };

/**
 * Building catalog. Footprints come from measured model bounding boxes (pack units):
 * castle 1.81×1.85, house 1.69×1.66, farm_plot 1.47×1.28, mill 1.69×1.67,
 * well 1.02×1.02, lumbermill 1.82×1.66, market 1.47×1.67.
 */
export const BUILDINGS = {
  townHall: {
    id: 'townHall',
    name: 'Town Hall',
    description: 'Seat of your realm. One per player.',
    modelPath: model('castle'),
    // The landmark is 1.5× the base scale (pack castles are tile-sized like houses).
    scale: S * 1.5,
    footprint: { w: 8.5, d: 8.5 },
    rotationOffset: 0,
    buildable: false,
    cost: {},
    buildTime: 120,
    maxBuilders: 6,
  },
  house: {
    id: 'house',
    name: 'House',
    description: 'Home for settlers.',
    modelPath: model('house'),
    scale: S,
    footprint: { w: 5, d: 5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 4, stone: 2 },
    buildTime: 30,
    maxBuilders: 3,
  },
  well: {
    id: 'well',
    name: 'Well',
    description: 'Fresh water for the village.',
    modelPath: model('well'),
    scale: S,
    footprint: { w: 3, d: 3 },
    rotationOffset: 0,
    buildable: true,
    cost: { stone: 3 },
    buildTime: 15,
    maxBuilders: 2,
  },
  field: {
    id: 'field',
    name: 'Field',
    description: 'A 2×3 grain field. Best placed near a mill.',
    modelPath: model('farm_plot'),
    modelTiling: { cols: 2, rows: 3, stepX: PLOT_STEP.x, stepZ: PLOT_STEP.z },
    scale: S,
    // 2 × 3 plots of 4.42 × 3.85, spaced 4.6 × 4.1.
    footprint: { w: 9.5, d: 12.5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 3 },
    buildTime: 20,
    maxBuilders: 3,
  },
  mill: {
    id: 'mill',
    name: 'Mill',
    description: 'Grinds grain from nearby fields.',
    modelPath: model('mill'),
    scale: S,
    footprint: { w: 5, d: 5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 6, stone: 4 },
    buildTime: 45,
    maxBuilders: 4,
  },
  lumbermill: {
    id: 'lumbermill',
    name: 'Lumbermill',
    description: 'Cuts wood from the forest. Build it near trees.',
    modelPath: model('lumbermill'),
    scale: S,
    footprint: { w: 5.5, d: 5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 5, stone: 2 },
    buildTime: 40,
    maxBuilders: 4,
  },
  market: {
    id: 'market',
    name: 'Market',
    description: 'Trade goods with neighbours.',
    modelPath: model('market'),
    scale: S,
    footprint: { w: 4.5, d: 5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 6, stone: 6, gold: 2 },
    buildTime: 50,
    maxBuilders: 4,
  },
} as const satisfies Record<string, BuildingDefinition>;

export type BuildingId = keyof typeof BUILDINGS;

/** Narrows an arbitrary string (e.g. from a network message) to a known building id. */
export function isBuildingId(value: unknown): value is BuildingId {
  return typeof value === 'string' && Object.hasOwn(BUILDINGS, value);
}
