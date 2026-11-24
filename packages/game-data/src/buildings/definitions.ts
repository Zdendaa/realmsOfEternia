import { HEXAGON_PACK } from '../assets/hexagonPack.js';
import { MEDIEVAL_PACK } from '../assets/medievalPack.js';
import type { BuildingDefinition } from './types.js';

const model = (file: string) => `${MEDIEVAL_PACK.modelDir}${file}.gltf.glb`;
const S = MEDIEVAL_PACK.worldScale;
const hexagonModel = (file: string) => `${HEXAGON_PACK.modelDir}${file}.glb`;

/** farm_plot tile spacing inside a field: its footprint plus a thin furrow. */
const PLOT_STEP = { x: 4.6, z: 4.1 };

const H = HEXAGON_PACK.worldScale;

/**
 * Building catalog. Footprints come from measured model bounding boxes × scale, rounded
 * up to 0.5 and widened where a model is off-center. Hexagon pack (pack units, incl.
 * child parts): castle 1.98×2.26, home_A 0.79×0.85, home_B 0.88×1.10, well 0.65×0.75,
 * windmill 1.13×0.82, lumbermill 1.37×1.19, market 1.80×1.32, blacksmith 1.29×1.25,
 * mine 1.61×1.92. Builder pack: farm_plot 1.47×1.28, mine (quarry) 1.61×1.88.
 * Every model's entrance faces +Z (checked from front and back renders), so
 * `rotationOffset` is 0 throughout.
 */
export const BUILDINGS = {
  townHall: {
    id: 'townHall',
    name: 'Town Hall',
    description: 'Seat of your realm. One per player.',
    modelPath: hexagonModel('building_castle'),
    // The landmark: a tall castle (~14 units) at 3.5×, as in the style comparison.
    scale: 3.5,
    footprint: { w: 7, d: 8 },
    yard: true,
    rotationOffset: 0,
    buildable: false,
    cost: {},
    buildTime: 120,
    maxBuilders: 6,
    housing: 10,
  },
  house: {
    id: 'house',
    name: 'House',
    description: 'Home for settlers: room for 4 more serfs or workers.',
    modelPath: hexagonModel('building_home_A'),
    // Two house styles, picked by position; the footprint fits the larger (home_B).
    modelVariants: [hexagonModel('building_home_A'), hexagonModel('building_home_B')],
    scale: H,
    footprint: { w: 3.5, d: 4.5 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 4, stone: 2 },
    buildTime: 30,
    maxBuilders: 3,
    housing: 4,
  },
  well: {
    id: 'well',
    name: 'Well',
    description: 'Fresh water for the village.',
    modelPath: hexagonModel('building_well'),
    scale: H,
    footprint: { w: 3, d: 3 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { stone: 3 },
    buildTime: 15,
    maxBuilders: 2,
  },
  field: {
    id: 'field',
    name: 'Field',
    description:
      'A 2×3 grain field. Its farmer sows, waits for the harvest and brings the grain in.',
    modelPath: model('farm_plot'),
    modelTiling: { cols: 2, rows: 3, stepX: PLOT_STEP.x, stepZ: PLOT_STEP.z },
    cropMesh: 'farm_wheat',
    scale: S,
    // 2 × 3 plots of 4.42 × 3.85, spaced 4.6 × 4.1.
    footprint: { w: 9.5, d: 12.5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 3 },
    buildTime: 20,
    maxBuilders: 3,
    walkable: true,
    production: {
      kind: 'farm',
      profession: 'farmer',
      crop: 'grain',
      sowSeconds: 2,
      growSeconds: 60,
      harvestSeconds: 2,
    },
  },
  mill: {
    id: 'mill',
    name: 'Mill',
    description: 'Its miller grinds grain from the Town Hall into flour.',
    modelPath: hexagonModel('building_windmill'),
    scale: H,
    footprint: { w: 5, d: 4 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 6, stone: 4 },
    buildTime: 45,
    maxBuilders: 4,
    spinningPart: { mesh: 'building_windmill_top_fan_yellow', axis: 'z', turnsPerSecond: 0.25 },
    production: {
      kind: 'process',
      profession: 'miller',
      input: { resource: 'grain', amount: 1 },
      output: { resource: 'flour', amount: 1 },
      seconds: 4,
    },
  },
  bakery: {
    id: 'bakery',
    name: 'Bakery',
    description: 'Its baker bakes bread from flour: 2 food per sack.',
    // Temporary: the Hexagon pack's blacksmith (a shed with a domed oven and chimney)
    // stands in until there is a bakery model. Phase 6 (military) wants it as the blacksmith.
    modelPath: hexagonModel('building_bakery_temp'),
    temporary: true,
    scale: H,
    footprint: { w: 5.5, d: 5 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 5, stone: 4 },
    buildTime: 40,
    maxBuilders: 4,
    smokeFrom: { x: 0.21, y: 0.98, z: -0.14 },
    production: {
      kind: 'process',
      profession: 'baker',
      input: { resource: 'flour', amount: 1 },
      output: { resource: 'food', amount: 2 },
      seconds: 6,
    },
  },
  lumbermill: {
    id: 'lumbermill',
    name: 'Lumbermill',
    description: 'Its woodcutter fells trees nearby. Build it near the forest.',
    modelPath: hexagonModel('building_lumbermill'),
    scale: H,
    footprint: { w: 5.5, d: 6 },
    yard: true,
    // The saw blade turns while the woodcutter prepares the wood.
    spinningPart: { mesh: 'building_lumbermill_saw_yellow', axis: 'x', turnsPerSecond: 1.5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 5, stone: 2 },
    buildTime: 40,
    maxBuilders: 4,
    production: {
      kind: 'harvest',
      profession: 'woodcutter',
      node: 'tree',
      workRadius: 25,
      processSeconds: 2,
    },
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    description: 'Its stonecutter breaks rocks nearby. Build it near rocks.',
    modelPath: model('mine'),
    scale: S,
    footprint: { w: 5, d: 5.5 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 6, stone: 1 },
    buildTime: 40,
    maxBuilders: 4,
    production: {
      kind: 'harvest',
      profession: 'stonecutter',
      node: 'rock',
      workRadius: 30,
      processSeconds: 2,
    },
  },
  goldMine: {
    id: 'goldMine',
    name: 'Gold Mine',
    description: 'Must be built on a gold deposit. Its miner digs gold ore, eating 1 food per ore.',
    modelPath: hexagonModel('building_mine'),
    scale: H,
    footprint: { w: 6.5, d: 8.5 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 8, stone: 4 },
    buildTime: 50,
    maxBuilders: 4,
    production: {
      kind: 'process',
      profession: 'miner',
      input: { resource: 'food', amount: 1 },
      output: { resource: 'gold', amount: 1 },
      seconds: 8,
      deposit: 'gold',
    },
  },
  ironMine: {
    id: 'ironMine',
    name: 'Iron Mine',
    description:
      'Must be built on an iron deposit. Its miner digs iron ore, eating 1 food per ore.',
    modelPath: hexagonModel('building_mine'),
    scale: H,
    footprint: { w: 6.5, d: 8.5 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 8, stone: 4 },
    buildTime: 50,
    maxBuilders: 4,
    production: {
      kind: 'process',
      profession: 'miner',
      input: { resource: 'food', amount: 1 },
      output: { resource: 'iron', amount: 1 },
      seconds: 8,
      deposit: 'iron',
    },
  },
  market: {
    id: 'market',
    name: 'Market',
    description: 'Trade goods with neighbours.',
    modelPath: hexagonModel('building_market'),
    scale: H,
    footprint: { w: 7.5, d: 6 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 6, stone: 6, gold: 2 },
    buildTime: 50,
    maxBuilders: 4,
  },
} as const satisfies Record<string, BuildingDefinition>;

export type BuildingId = keyof typeof BUILDINGS;

/** The production settings of a building type, if it is a production building. */
export const productionOf = (type: BuildingId): BuildingDefinition['production'] =>
  (BUILDINGS[type] as BuildingDefinition).production;

/** The deposit kind a building must stand on (mines), if any. */
export const depositOf = (type: BuildingId) => {
  const production = productionOf(type);
  return production?.kind === 'process' ? production.deposit : undefined;
};

/**
 * The model of building `id`: one of its `modelVariants`, picked by id, so neighbours
 * built one after another alternate (the starting houses have consecutive ids) and the
 * placement ghost can show the variant of the id the next building will get. Cosmetic.
 */
export function modelPathOf(definition: BuildingDefinition, id: number): string {
  const variants = definition.modelVariants;
  if (!variants || variants.length === 0) return definition.modelPath;
  return variants[Math.abs(Math.trunc(id)) % variants.length] as string;
}

/** True for buildings units can walk across (fields). */
export const isWalkableBuilding = (type: BuildingId): boolean =>
  (BUILDINGS[type] as BuildingDefinition).walkable === true;

/** Population capacity a complete building of this type adds (0 for most buildings). */
export const housingOf = (type: BuildingId): number =>
  (BUILDINGS[type] as BuildingDefinition).housing ?? 0;

/** Narrows an arbitrary string (e.g. from a network message) to a known building id. */
export function isBuildingId(value: unknown): value is BuildingId {
  return typeof value === 'string' && Object.hasOwn(BUILDINGS, value);
}
