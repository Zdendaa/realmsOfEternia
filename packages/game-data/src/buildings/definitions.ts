import { MEDIEVAL_PACK } from '../assets/medievalPack.js';
import type { BuildingDefinition } from './types.js';

const model = (file: string) => `${MEDIEVAL_PACK.modelDir}${file}.gltf.glb`;
const S = MEDIEVAL_PACK.worldScale;

/**
 * Building catalog. Footprints come from measured model bounding boxes (pack units):
 * castle 1.81×1.85, house 1.69×1.66, farm_plot 1.47×1.28, mill 1.69×1.67,
 * well 1.02×1.02, lumbermill 1.82×1.66, market 1.47×1.67.
 */
export const BUILDINGS = {
  townHall: {
    id: 'townHall',
    name: 'Town Hall',
    modelPath: model('castle'),
    // The landmark is 1.5× the base scale (pack castles are tile-sized like houses).
    scale: S * 1.5,
    footprint: { w: 8.5, d: 8.5 },
    rotationOffset: 0,
  },
  house: {
    id: 'house',
    name: 'House',
    modelPath: model('house'),
    scale: S,
    footprint: { w: 5, d: 5 },
    rotationOffset: 0,
  },
  farmPlot: {
    id: 'farmPlot',
    name: 'Farm Plot',
    modelPath: model('farm_plot'),
    scale: S,
    footprint: { w: 4.5, d: 4 },
    rotationOffset: 0,
  },
  mill: {
    id: 'mill',
    name: 'Mill',
    modelPath: model('mill'),
    scale: S,
    footprint: { w: 5, d: 5 },
    rotationOffset: 0,
  },
  well: {
    id: 'well',
    name: 'Well',
    modelPath: model('well'),
    scale: S,
    footprint: { w: 3, d: 3 },
    rotationOffset: 0,
  },
  lumbermill: {
    id: 'lumbermill',
    name: 'Lumbermill',
    modelPath: model('lumbermill'),
    scale: S,
    footprint: { w: 5.5, d: 5 },
    rotationOffset: 0,
  },
  market: {
    id: 'market',
    name: 'Market',
    modelPath: model('market'),
    scale: S,
    footprint: { w: 4.5, d: 5 },
    rotationOffset: 0,
  },
} as const satisfies Record<string, BuildingDefinition>;

export type BuildingId = keyof typeof BUILDINGS;
