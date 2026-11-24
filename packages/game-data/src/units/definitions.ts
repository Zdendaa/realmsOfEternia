import type { UnitDefinition } from './types.js';

/** Unit catalog. Workers and military units join with the economy and combat phases. */
export const UNITS = {
  serf: {
    id: 'serf',
    name: 'Serf',
    description: 'Builds construction sites. Recruited at the Town Hall.',
    // A calm Settlers-like walk; the short-legged character models still need their walk
    // cycle at ~2.6× to keep up (see CHARACTER_PACK.serf).
    speed: 1.6,
    radius: 0.4,
    maxPerPlayer: 200,
  },
} as const satisfies Record<string, UnitDefinition>;

export type UnitKind = keyof typeof UNITS;

export function isUnitKind(value: unknown): value is UnitKind {
  return typeof value === 'string' && Object.hasOwn(UNITS, value);
}
