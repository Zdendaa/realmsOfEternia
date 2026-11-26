/**
 * Hero abilities as data, built from a few reusable effects. The simulation applies the
 * effects; nothing in it knows an ability by name.
 */

/** What a lasting boost changes: damage dealt, walking speed, or damage taken. */
export type BoostStat = 'damage' | 'speed' | 'damageTaken';

export type AbilityEffect =
  /** Hurts enemies in the area (or the targeted building). Armor doesn't help. */
  | { kind: 'damage'; amount: number }
  /** Restores health to own units in the area, the caster included. */
  | { kind: 'heal'; amount: number }
  /** Own units in the area: `stat` × `factor` for `seconds`. */
  | { kind: 'boost'; stat: BoostStat; factor: number; seconds: number }
  /** Enemies in the area walk at `factor` of their speed. */
  | { kind: 'slow'; factor: number; seconds: number }
  /** Enemies in the area can neither move nor strike. */
  | { kind: 'stun'; seconds: number }
  /** Shows the area through the fog of war to the caster's owner. */
  | { kind: 'reveal'; seconds: number };

/**
 * What the player picks: nothing (the area is around the hero), a point on the ground,
 * or an enemy building or wall.
 */
export type AbilityTarget = 'self' | 'point' | 'building';

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  /** The hero level that unlocks it. */
  level: number;
  /** Seconds before it can be used again, counted from when it takes effect. */
  cooldown: number;
  /** Seconds the hero stands casting before it takes effect. */
  castTime: number;
  target: AbilityTarget;
  /**
   * How close the hero must come: to the point (center to center), or to the building
   * (edge to edge). 0 for `self`. The hero walks there first.
   */
  range: number;
  /** Radius of the area affected (0: only the targeted building). */
  radius: number;
  /** A point may be chosen out of sight (scouting); every other target must be seen. */
  blind?: boolean;
  effects: readonly AbilityEffect[];
  /** Color of the burst drawn when it takes effect (client). */
  color: string;
}

export const ABILITIES = {
  // Commander
  rally: {
    id: 'rally',
    name: 'Rally',
    description: 'Nearby own units hit harder and walk faster for a while.',
    level: 1,
    cooldown: 45,
    castTime: 0.5,
    target: 'self',
    range: 0,
    radius: 8,
    effects: [
      { kind: 'boost', stat: 'damage', factor: 1.25, seconds: 10 },
      { kind: 'boost', stat: 'speed', factor: 1.25, seconds: 10 },
    ],
    color: '#f2b632',
  },
  shockwave: {
    id: 'shockwave',
    name: 'Shockwave',
    description: 'Strikes the ground: enemies around are hurt and stunned.',
    level: 3,
    cooldown: 30,
    castTime: 0.6,
    target: 'self',
    range: 0,
    radius: 4,
    effects: [
      { kind: 'damage', amount: 35 },
      { kind: 'stun', seconds: 2 },
    ],
    color: '#d9772e',
  },
  lastStand: {
    id: 'lastStand',
    name: 'Last Stand',
    description: 'Nearby own units take much less damage for a short time.',
    level: 5,
    cooldown: 90,
    castTime: 0.5,
    target: 'self',
    range: 0,
    radius: 8,
    effects: [{ kind: 'boost', stat: 'damageTaken', factor: 0.4, seconds: 8 }],
    color: '#fff0b0',
  },
  // Archmage
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    description: 'A burst of fire that hurts every enemy where it lands.',
    level: 1,
    cooldown: 15,
    castTime: 0.8,
    target: 'point',
    range: 10,
    radius: 2.5,
    effects: [{ kind: 'damage', amount: 45 }],
    color: '#ff6a1f',
  },
  frostNova: {
    id: 'frostNova',
    name: 'Frost Nova',
    description: 'Freezing cold: enemies in the area are hurt a little and slowed.',
    level: 3,
    cooldown: 25,
    castTime: 0.6,
    target: 'point',
    range: 10,
    radius: 4,
    effects: [
      { kind: 'damage', amount: 10 },
      { kind: 'slow', factor: 0.45, seconds: 6 },
    ],
    color: '#8fd8ff',
  },
  massHeal: {
    id: 'massHeal',
    name: 'Mass Heal',
    description: 'Heals every own unit nearby.',
    level: 5,
    cooldown: 60,
    castTime: 0.8,
    target: 'self',
    range: 0,
    radius: 8,
    effects: [{ kind: 'heal', amount: 80 }],
    color: '#7dff8a',
  },
  // Pathfinder
  eagleEye: {
    id: 'eagleEye',
    name: 'Eagle Eye',
    description: 'Reveals a distant area through the fog of war for a while.',
    level: 1,
    cooldown: 45,
    castTime: 0.5,
    target: 'point',
    range: 40,
    radius: 14,
    blind: true,
    effects: [{ kind: 'reveal', seconds: 15 }],
    color: '#d6f5ff',
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    description: 'A rain of arrows over an area.',
    level: 3,
    cooldown: 25,
    castTime: 0.8,
    target: 'point',
    range: 12,
    radius: 3.5,
    effects: [{ kind: 'damage', amount: 30 }],
    color: '#c9b48a',
  },
  sapperCharge: {
    id: 'sapperCharge',
    name: 'Sapper Charge',
    description: 'A charge set against an enemy building or wall does heavy damage.',
    level: 5,
    cooldown: 60,
    castTime: 2,
    target: 'building',
    range: 2,
    radius: 0,
    effects: [{ kind: 'damage', amount: 600 }],
    color: '#ffb02e',
  },
} as const satisfies Record<string, AbilityDefinition>;

export type AbilityId = keyof typeof ABILITIES;

export const isAbilityId = (value: unknown): value is AbilityId =>
  typeof value === 'string' && Object.hasOwn(ABILITIES, value);

/** An ability's definition (widened from the catalog's literal types). */
export const abilityOf = (id: AbilityId): AbilityDefinition => ABILITIES[id];
