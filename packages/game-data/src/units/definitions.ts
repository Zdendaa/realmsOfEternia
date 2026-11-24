import type { UnitDefinition } from './types.js';

/** Unit catalog. Workers and military units join with the economy and combat phases. */
export const UNITS = {
  serf: {
    id: 'serf',
    name: 'Serf',
    description: 'Builds construction sites. Recruited at the Town Hall.',
    // A brisk walk. The character's walk cycle plays at speed / ~0.62 units/s (~3.2×) to
    // keep the feet planted: quick steps, which read fine at RTS zoom. See CHARACTER_PACK.serf.
    speed: 2,
    radius: 0.4,
    maxPerPlayer: 200,
  },
} as const satisfies Record<string, UnitDefinition>;

export type UnitKind = keyof typeof UNITS;

export function isUnitKind(value: unknown): value is UnitKind {
  return typeof value === 'string' && Object.hasOwn(UNITS, value);
}
