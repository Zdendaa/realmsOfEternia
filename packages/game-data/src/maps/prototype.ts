import type { MapDefinition } from '@roe/shared';

/** Test map: gentle hills, forests, a flat central settlement area and a mountain border. */
export const PROTOTYPE_MAP = {
  id: 'prototype',
  name: 'Prototype Meadow',
  size: 240,
  seed: 1337,
  terrain: { hillHeight: 12, hillScale: 70 },
  settlement: { halfSize: 20, blend: 14 },
  forest: { scale: 55, threshold: 0.52, strayChance: 0.02 },
  border: { width: 60, mountainHeight: 34 },
  water: {
    // A lake in the flat south-western lowland, away from the village and both roads.
    lakes: [{ x: -46, z: 42, radius: 15, depth: 2.4, irregularity: 0.22 }],
  },
  // Ore deposits ~45 units from the Town Hall on flat ground (a mine fits anywhere on
  // them), away from the roads and the lake: gold to the west-north-west beyond the
  // fields, iron to the south-east. `amount` is unused while deposits are infinite.
  deposits: [
    { kind: 'gold', x: -42, z: -18, radius: 3, amount: 400 },
    { kind: 'iron', x: 18, z: 42, radius: 3, amount: 600 },
  ],
  // Victory: clear both camps and beat the wave.
  objective: 'clearMonsters',
  // After eight minutes a skeleton horde marches down the north road to the Town Hall.
  waves: [
    {
      at: 480,
      x: 9,
      z: -80,
      units: [
        { unit: 'skeletonWarrior', count: 2 },
        { unit: 'skeletonMinion', count: 5 },
        { unit: 'skeletonArcher', count: 2 },
      ],
    },
  ],
  // Skeleton camps on the deposits: the mines can only be built once they are cleared.
  // Gold is guarded harder than iron.
  camps: [
    {
      x: -42,
      z: -18,
      units: [
        { unit: 'skeletonWarrior', count: 2 },
        { unit: 'skeletonMinion', count: 3 },
        { unit: 'skeletonArcher', count: 2 },
      ],
    },
    {
      x: 18,
      z: 42,
      units: [
        { unit: 'skeletonWarrior', count: 1 },
        { unit: 'skeletonMinion', count: 3 },
      ],
    },
  ],
  decorations: [
    {
      kind: 'tree',
      placement: 'forest',
      count: 1500,
      minSpacing: 1.5,
      minScale: 0.5,
      maxScale: 0.9,
    },
    {
      kind: 'tree',
      placement: 'border',
      count: 4200,
      minSpacing: 1.7,
      minScale: 0.5,
      maxScale: 0.9,
    },
    { kind: 'rock', placement: 'scatter', count: 60, minSpacing: 4, minScale: 0.5, maxScale: 1.8 },
  ],
} as const satisfies MapDefinition;
