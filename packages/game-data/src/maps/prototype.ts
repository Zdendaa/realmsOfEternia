import type { MapDefinition } from '@roe/shared';

/** Flat test map used to verify the rendering pipeline. */
export const PROTOTYPE_MAP = {
  id: 'prototype',
  name: 'Prototype Meadow',
  size: 240,
  seed: 1337,
  clearRadius: 18,
  decorations: [
    { kind: 'tree', count: 140, minScale: 0.8, maxScale: 1.6 },
    { kind: 'rock', count: 45, minScale: 0.5, maxScale: 1.8 },
  ],
} as const satisfies MapDefinition;
