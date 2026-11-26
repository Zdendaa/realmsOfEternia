import { HEXAGON_PACK } from '../assets/hexagonPack.js';
import { MEDIEVAL_PACK } from '../assets/medievalPack.js';
import type { UnitKind } from '../units/definitions.js';
import { BUILDING_SIGHT } from './sight.js';
import type { BuildingDefinition } from './types.js';
import { WALL_RULES } from './walls.js';

const model = (file: string) => `${MEDIEVAL_PACK.modelDir}${file}.gltf.glb`;
const S = MEDIEVAL_PACK.worldScale;
const hexagonModel = (file: string) => `${HEXAGON_PACK.modelDir}${file}.glb`;
const H = HEXAGON_PACK.worldScale;
const prop = (file: string) => `${HEXAGON_PACK.modelDir}props/${file}.glb`;
const deg = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The storehouse yard (7 × 6, open toward +Z), assembled from Hexagon props at the pack
 * scale: a tent at the back, a lumber pile and a stone pile beside it, pallets with
 * crates and sacks, barrels and a wheelbarrow in front, and a flag in the owner's color.
 */
const STOREHOUSE_PARTS = [
  { modelPath: prop('tent'), x: 0, z: -1.5, scale: 5 },
  { modelPath: prop('resource_lumber'), x: -2.55, z: -0.8, rotation: deg(90), scale: H },
  { modelPath: prop('resource_stone'), x: 2.45, z: -1.75, rotation: deg(15), scale: H },
  { modelPath: prop('barrel'), x: 2.9, z: 0.15, scale: H },
  { modelPath: prop('barrel'), x: 2.2, z: 0.55, rotation: deg(40), scale: H },
  { modelPath: prop('barrel'), x: 3.0, z: 0.95, rotation: deg(80), scale: H },
  { modelPath: prop('pallet'), x: -2.2, z: 1.65, scale: H },
  { modelPath: prop('crate_A_big'), x: -2.45, z: 1.45, y: 0.3, scale: H },
  { modelPath: prop('crate_A_small'), x: -1.8, z: 1.95, y: 0.3, rotation: deg(25), scale: H },
  { modelPath: prop('crate_B_big'), x: -2.4, z: 1.45, y: 1.15, rotation: deg(10), scale: H * 0.85 },
  { modelPath: prop('pallet'), x: -0.6, z: 0.6, rotation: deg(-10), scale: H },
  { modelPath: prop('sack'), x: -0.85, z: 0.45, y: 0.3, rotation: deg(20), scale: H },
  { modelPath: prop('sack'), x: -0.35, z: 0.8, y: 0.3, rotation: deg(-30), scale: H },
  { modelPath: prop('crate_long_A'), x: 1.6, z: 2.25, rotation: deg(-15), scale: H },
  { modelPath: prop('wheelbarrow'), x: 0.6, z: 1.7, rotation: deg(-35), scale: H },
  { modelPath: HEXAGON_PACK.construction.flag, x: 3.1, z: 2.6, scale: 6 },
] as const;

/** farm_plot tile spacing inside a field: its footprint plus a thin furrow. */
const PLOT_STEP = { x: 4.6, z: 4.1 };

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
    // The heart of the village: much sturdier than its size alone gives, and it sees far.
    health: 3000,
    sight: BUILDING_SIGHT.townHall,
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
    construction: 'reveal',
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
    description: 'Its miller grinds grain from storage into flour.',
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
  storehouse: {
    id: 'storehouse',
    name: 'Storehouse',
    description:
      'A storage yard: villagers drop off goods and pick up building materials here, like at the Town Hall. Build it near your workers.',
    modelPath: prop('tent'),
    parts: STOREHOUSE_PARTS,
    scale: H,
    footprint: { w: 7, d: 6 },
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 6, stone: 3 },
    buildTime: 40,
    maxBuilders: 4,
    yard: true,
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
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    description: 'Trains swordsmen and spearmen.',
    modelPath: hexagonModel('building_barracks'),
    scale: H,
    footprint: { w: 6, d: 7 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 8, stone: 6 },
    buildTime: 50,
    maxBuilders: 4,
    trains: ['swordsman', 'spearman'],
  },
  archeryRange: {
    id: 'archeryRange',
    name: 'Archery Range',
    description: 'Trains archers.',
    modelPath: hexagonModel('building_archeryrange'),
    scale: H,
    footprint: { w: 7, d: 7 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 8, stone: 3 },
    buildTime: 45,
    maxBuilders: 4,
    trains: ['archer'],
  },
  palisade: {
    id: 'palisade',
    name: 'Palisade',
    description: 'Wooden wall: cheap and quick to build, but weak.',
    modelPath: hexagonModel('fence_wood_straight'),
    // The pack's fence runs along Z, one hex side off its origin.
    wallModel: {
      size: { length: 1.15, height: 0.55, depth: 0.1 },
      turn: deg(90),
      center: { x: -1, z: 0 },
      height: 1.9,
      depth: 0.45,
      post: { kind: 'log', radius: 0.32, height: 2.3, color: '#7a5434' },
    },
    scale: H,
    footprint: { w: WALL_RULES.segmentLength, d: 1 },
    wall: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 1 },
    buildTime: 4,
    maxBuilders: 2,
    health: 400,
    sight: BUILDING_SIGHT.wall,
  },
  stoneWall: {
    id: 'stoneWall',
    name: 'Stone Wall',
    description: 'Strong wall of stone: slow to build and hard to break.',
    modelPath: hexagonModel('wall_straight'),
    wallModel: {
      size: { length: 2, height: 1.1, depth: 0.8 },
      turn: 0,
      center: { x: 0, z: 0 },
      height: 2.2,
      depth: 1,
      post: {
        kind: 'model',
        modelPath: hexagonModel('building_tower_base'),
        scale: 1.6,
        stretchY: 1.15,
      },
    },
    scale: H,
    footprint: { w: WALL_RULES.segmentLength, d: 1 },
    wall: true,
    rotationOffset: 0,
    buildable: true,
    cost: { stone: 2 },
    buildTime: 10,
    maxBuilders: 2,
    health: 1400,
    sight: BUILDING_SIGHT.wall,
  },
  palisadeGate: {
    id: 'palisadeGate',
    name: 'Palisade Gate',
    description: 'A gate in a palisade: your people pass, enemies must break it.',
    modelPath: hexagonModel('fence_wood_straight_gate'),
    scale: H,
    footprint: { w: WALL_RULES.segmentLength, d: 1 },
    wall: true,
    gateOf: 'palisade',
    wallModel: {
      size: { length: 1.15, height: 0.65, depth: 0.14 },
      turn: deg(90),
      center: { x: -1, z: 0 },
      height: 2.25,
      depth: 0.6,
      post: { kind: 'log', radius: 0.32, height: 2.3, color: '#7a5434' },
      doors: [{ node: 'fence_wood_straight_door', openAngle: deg(100) }],
    },
    rotationOffset: 0,
    buildable: false,
    cost: { wood: 3 },
    buildTime: 8,
    maxBuilders: 2,
    health: 300,
    sight: BUILDING_SIGHT.wall,
  },
  stoneGate: {
    id: 'stoneGate',
    name: 'Stone Gate',
    description: 'A gate in a stone wall: your people pass, enemies must break it.',
    modelPath: hexagonModel('wall_straight_gate'),
    scale: H,
    footprint: { w: WALL_RULES.segmentLength, d: 1 },
    wall: true,
    gateOf: 'stoneWall',
    wallModel: {
      size: { length: 2, height: 1.41, depth: 0.9 },
      turn: 0,
      center: { x: 0, z: 0 },
      height: 2.8,
      depth: 1.15,
      post: {
        kind: 'model',
        modelPath: hexagonModel('building_tower_base'),
        scale: 1.6,
        stretchY: 1.15,
      },
      doors: [
        { node: 'wall_straight_gate_door_left', openAngle: deg(-95) },
        { node: 'wall_straight_gate_door_right', openAngle: deg(95) },
      ],
    },
    rotationOffset: 0,
    buildable: false,
    cost: { stone: 3, wood: 2 },
    buildTime: 15,
    maxBuilders: 2,
    health: 1100,
    sight: BUILDING_SIGHT.wall,
  },
  woodenTower: {
    id: 'woodenTower',
    name: 'Wooden Tower',
    description: 'A lookout with archers: shoots at enemies in range by itself.',
    modelPath: hexagonModel('building_tower_base'),
    tint: '#ffd49a',
    scale: 3.2,
    footprint: { w: 3, d: 4 },
    yard: true,
    rotationOffset: 0,
    buildable: true,
    cost: { wood: 8, stone: 1 },
    buildTime: 25,
    maxBuilders: 3,
    health: 600,
    sight: BUILDING_SIGHT.woodenTower,
    upgradesTo: ['stoneTower'],
    tower: {
      attack: {
        kind: 'ranged',
        damage: 8,
        cooldown: 1.6,
        windup: 0,
        range: 11,
        projectileSpeed: 22,
      },
      launchHeight: 4.6,
      shot: { look: 'arrow', size: 1 },
    },
  },
  stoneTower: {
    id: 'stoneTower',
    name: 'Stone Tower',
    description: 'Sturdy walls and better archers. Can be specialized.',
    modelPath: hexagonModel('building_tower_A'),
    scale: 3,
    footprint: { w: 3, d: 4 },
    yard: true,
    rotationOffset: 0,
    buildable: false,
    cost: { stone: 10, wood: 4 },
    buildTime: 30,
    maxBuilders: 3,
    health: 1200,
    sight: BUILDING_SIGHT.stoneTower,
    upgradesTo: ['crossbowTower', 'magicTower', 'fireTower'],
    tower: {
      attack: {
        kind: 'ranged',
        damage: 12,
        cooldown: 1.5,
        windup: 0,
        range: 12,
        projectileSpeed: 24,
      },
      launchHeight: 5.4,
      shot: { look: 'arrow', size: 1.15 },
    },
  },
  crossbowTower: {
    id: 'crossbowTower',
    name: 'Crossbow Tower',
    description: 'Slow, heavy bolts that go through armor. Longest reach.',
    modelPath: hexagonModel('building_tower_B'),
    tint: '#aebbd0',
    temporary: true,
    scale: 2.75,
    footprint: { w: 3, d: 4 },
    yard: true,
    rotationOffset: 0,
    buildable: false,
    cost: { wood: 6, stone: 6, iron: 4 },
    buildTime: 35,
    maxBuilders: 3,
    health: 1200,
    sight: BUILDING_SIGHT.crossbowTower,
    tower: {
      attack: {
        kind: 'ranged',
        damage: 42,
        cooldown: 3.6,
        windup: 0,
        range: 13,
        projectileSpeed: 32,
        ignoresArmor: true,
      },
      launchHeight: 6,
      shot: { look: 'arrow', size: 2 },
      topper: { kind: 'crossbow', height: 5.7 },
    },
  },
  magicTower: {
    id: 'magicTower',
    name: 'Magic Tower',
    description: 'Bolts of magic that slow whoever they hit.',
    modelPath: hexagonModel('building_tower_B'),
    tint: '#b79cf0',
    temporary: true,
    scale: 2.75,
    footprint: { w: 3, d: 4 },
    yard: true,
    rotationOffset: 0,
    buildable: false,
    cost: { stone: 8, gold: 8 },
    buildTime: 35,
    maxBuilders: 3,
    health: 1400,
    sight: BUILDING_SIGHT.magicTower,
    tower: {
      attack: {
        kind: 'ranged',
        damage: 16,
        cooldown: 1.6,
        windup: 0,
        range: 12,
        projectileSpeed: 18,
      },
      launchHeight: 6.4,
      slow: { factor: 0.5, seconds: 2.5 },
      shot: { look: 'orb', size: 0.28, color: '#b678ff' },
      topper: { kind: 'orb', height: 6.35 },
    },
  },
  fireTower: {
    id: 'fireTower',
    name: 'Fire Tower',
    description: 'Fire that bursts among enemies and keeps burning.',
    modelPath: hexagonModel('building_tower_B'),
    tint: '#f0a183',
    temporary: true,
    scale: 2.75,
    footprint: { w: 3, d: 4 },
    yard: true,
    rotationOffset: 0,
    buildable: false,
    cost: { stone: 8, wood: 8, iron: 3 },
    buildTime: 35,
    maxBuilders: 3,
    health: 1100,
    sight: BUILDING_SIGHT.fireTower,
    tower: {
      attack: {
        kind: 'ranged',
        damage: 6,
        cooldown: 3.8,
        windup: 0,
        range: 11,
        projectileSpeed: 16,
      },
      launchHeight: 6.4,
      splash: { radius: 1.7 },
      burn: { damagePerSecond: 3, seconds: 3 },
      shot: { look: 'orb', size: 0.36, color: '#ff7a1f' },
      topper: { kind: 'brazier', height: 6.3 },
    },
  },
} as const satisfies Record<string, BuildingDefinition>;

export type BuildingId = keyof typeof BUILDINGS;

export const isWall = (type: BuildingId): boolean =>
  (BUILDINGS[type] as BuildingDefinition).wall === true;

export const isGate = (type: BuildingId): boolean =>
  (BUILDINGS[type] as BuildingDefinition).gateOf !== undefined;

/** The gate a segment of `type` can be turned into (plain wall types have one). */
export const gateFor = (type: BuildingId): BuildingId | undefined =>
  (Object.keys(BUILDINGS) as BuildingId[]).find(
    (id) => (BUILDINGS[id] as BuildingDefinition).gateOf === type,
  );

/** The wall material a segment belongs to: a gate counts as its wall type. */
export const wallTierOf = (type: BuildingId): BuildingId =>
  ((BUILDINGS[type] as BuildingDefinition).gateOf as BuildingId | undefined) ?? type;

/** What a building of `type` can be upgraded into (towers). */
export const upgradesOf = (type: BuildingId): readonly BuildingId[] =>
  ((BUILDINGS[type] as BuildingDefinition).upgradesTo ?? []) as readonly BuildingId[];

/** The tower settings of a building type, if it is a tower. */
export const towerOf = (type: BuildingId): BuildingDefinition['tower'] =>
  (BUILDINGS[type] as BuildingDefinition).tower;

/** The production settings of a building type, if it is a production building. */
export const productionOf = (type: BuildingId): BuildingDefinition['production'] =>
  (BUILDINGS[type] as BuildingDefinition).production;

/** Hit points per square unit of footprint, for buildings without their own `health`. */
const HEALTH_PER_AREA = 30;
/** No building has less than this. */
const MIN_BUILDING_HEALTH = 300;

/** Hit points of a complete building of this type. */
export function buildingHealthOf(type: BuildingId): number {
  const definition = BUILDINGS[type] as BuildingDefinition;
  if (definition.health !== undefined) return definition.health;
  const { w, d } = definition.footprint;
  return Math.max(MIN_BUILDING_HEALTH, Math.round(w * d * HEALTH_PER_AREA));
}

/** How far a building of this type sees in the fog of war. */
export const buildingSightOf = (type: BuildingId): number =>
  (BUILDINGS[type] as BuildingDefinition).sight ?? BUILDING_SIGHT.default;

/** The units a building type trains (empty for most buildings). */
export const trainsOf = (type: BuildingId): readonly UnitKind[] =>
  (BUILDINGS[type] as BuildingDefinition).trains ?? [];

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
