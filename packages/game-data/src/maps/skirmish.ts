import type {
  CampDefinition,
  DepositDefinition,
  GroveDefinition,
  MapDefinition,
  Vec2,
} from '@roe/shared';
import { toSlotPoint, turnPoint, type QuarterTurns } from '@roe/shared';

/** A start in a corner, the village turned to face the middle of the map. */
const corner = (x: number, z: number, quarterTurns: QuarterTurns) => ({
  x,
  z,
  quarterTurns,
  heroes: [
    { hero: 'commander', x: 1.9, z: 1.2 },
    { hero: 'archmage', x: 4, z: -0.9 },
  ],
});

/**
 * The four corners, clockwise from the north-west. Two players take opposite ones
 * (slots 0 and 1).
 */
const SLOTS = [
  corner(-100, -100, 0),
  corner(100, 100, 2),
  corner(100, -100, 3),
  corner(-100, 100, 1),
] as const;

/** Each start's own ore, in the village's coordinates: along the two map edges. */
const HOME_IRON: Vec2 = { x: 48, z: 4 };
const HOME_GOLD: Vec2 = { x: 4, z: 48 };

const homeDeposits: DepositDefinition[] = SLOTS.flatMap((slot) => [
  { kind: 'iron', ...toSlotPoint(slot, HOME_IRON), radius: 3, amount: 600 },
  { kind: 'gold', ...toSlotPoint(slot, HOME_GOLD), radius: 3, amount: 400 },
]);

const homeCamps: CampDefinition[] = SLOTS.flatMap((slot) => [
  {
    ...toSlotPoint(slot, HOME_IRON),
    units: [
      { unit: 'skeletonWarrior', count: 4 },
      { unit: 'skeletonMinion', count: 3 },
      { unit: 'skeletonArcher', count: 2 },
    ],
  },
  {
    ...toSlotPoint(slot, HOME_GOLD),
    units: [
      { unit: 'skeletonWarrior', count: 6 },
      { unit: 'skeletonMinion', count: 4 },
      { unit: 'skeletonArcher', count: 3 },
    ],
  },
]);

/**
 * Each start's own wood and stone, the same for everyone (in the village's coordinates):
 * two groves behind and beside the village and a quarry on its other side.
 */
const HOME_GROVES = [
  { kind: 'tree', x: -18, z: -38, radius: 11, count: 60 },
  { kind: 'tree', x: -40, z: 13, radius: 10, count: 50 },
  { kind: 'rock', x: 31, z: -22, radius: 7, count: 10 },
] as const;

const groves: GroveDefinition[] = SLOTS.flatMap((slot) =>
  HOME_GROVES.map((grove) => ({
    ...grove,
    ...toSlotPoint(slot, grove),
    minScale: grove.kind === 'tree' ? 0.5 : 0.8,
    maxScale: grove.kind === 'tree' ? 0.9 : 1.4,
    minSpacing: grove.kind === 'tree' ? 1.7 : 2.6,
  })),
);

/** The lakes, one between each two neighbouring corners. */
const lakes = ([0, 1, 2, 3] as const).map((turn) => ({
  ...turnPoint({ x: 0, z: -64 }, turn),
  radius: 11,
  depth: 2.2,
  irregularity: 0.22,
}));

/**
 * The map for 2–4 players: a start in each corner with its own iron and gold along the
 * edges (each guarded by a small camp), and a rich, heavily guarded middle to fight over.
 * No scripted waves and no objective: the last side with a Town Hall wins.
 */
export const SKIRMISH_MAP = {
  id: 'skirmish',
  name: 'Four Corners',
  size: 320,
  seed: 4242,
  terrain: { hillHeight: 11, hillScale: 70 },
  settlement: { halfSize: 28, blend: 14 },
  forest: { scale: 55, threshold: 0.52, strayChance: 0.02 },
  border: { width: 60, mountainHeight: 34 },
  water: { lakes },
  startSlots: SLOTS,
  deposits: [
    ...homeDeposits,
    { kind: 'gold', x: 0, z: -15, radius: 3, amount: 800 },
    { kind: 'iron', x: 0, z: 15, radius: 3, amount: 900 },
  ],
  camps: [
    ...homeCamps,
    {
      x: 0,
      z: 0,
      units: [
        { unit: 'skeletonWarrior', count: 10 },
        { unit: 'skeletonMinion', count: 8 },
        { unit: 'skeletonArcher', count: 6 },
      ],
    },
  ],
  groves,
  decorations: [
    {
      kind: 'tree',
      placement: 'forest',
      count: 2600,
      minSpacing: 1.5,
      minScale: 0.5,
      maxScale: 0.9,
    },
    {
      kind: 'tree',
      placement: 'border',
      count: 5400,
      minSpacing: 1.7,
      minScale: 0.5,
      maxScale: 0.9,
    },
    { kind: 'rock', placement: 'scatter', count: 120, minSpacing: 4, minScale: 0.5, maxScale: 1.8 },
  ],
} as const satisfies MapDefinition;
