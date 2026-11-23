import type { MapDefinition } from '@roe/shared';

/** Test map: gentle hills, forests and a flat settlement area in the center. */
export const PROTOTYPE_MAP = {
  id: 'prototype',
  name: 'Prototype Meadow',
  size: 240,
  seed: 1337,
  terrain: { hillHeight: 12, hillScale: 70 },
  settlement: { halfSize: 20, blend: 14 },
  forest: { scale: 55, threshold: 0.52, strayChance: 0.02 },
  decorations: [
    {
      kind: 'tree',
      placement: 'forest',
      count: 900,
      minSpacing: 2.2,
      minScale: 0.8,
      maxScale: 1.5,
    },
    { kind: 'rock', placement: 'scatter', count: 60, minSpacing: 4, minScale: 0.5, maxScale: 1.8 },
  ],
} as const satisfies MapDefinition;
