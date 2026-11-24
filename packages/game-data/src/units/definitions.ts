import type { UnitDefinition } from './types.js';

/** Unit catalog. Military units join with the combat phase. */
export const UNITS = {
  serf: {
    id: 'serf',
    name: 'Serf',
    description: 'Builds construction sites. Recruited at the Town Hall.',
    cost: { food: 2 },
    // A brisk walk. The character's walk cycle plays at speed / ~0.62 units/s (~3.2×) to
    // keep the feet planted: quick steps, which read fine at RTS zoom. See CHARACTER_PACK.serf.
    speed: 2,
    radius: 0.4,
    maxPerPlayer: 200,
    controllable: true,
  },
  worker: {
    id: 'worker',
    name: 'Worker',
    description: 'Works in a production building. Arrives when the building is finished.',
    cost: {},
    speed: 2,
    radius: 0.4,
    // One per production building (and only with free housing); the cap only guards
    // against runaway spawning.
    maxPerPlayer: 200,
    controllable: false,
  },
} as const satisfies Record<string, UnitDefinition>;

export type UnitKind = keyof typeof UNITS;

export function isUnitKind(value: unknown): value is UnitKind {
  return typeof value === 'string' && Object.hasOwn(UNITS, value);
}
