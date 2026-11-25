import type { AttackDefinition, CombatStats } from './combat.js';
import type { UnitDefinition } from './types.js';

/** Villagers can be killed but don't fight back. */
const VILLAGER_COMBAT = { health: 40, armor: 0, armorClass: 'villager' } as const;

/** Unit catalog: villagers and the Humans' base army. Numbers are starting values, tuned in play. */
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
    combat: VILLAGER_COMBAT,
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
    combat: VILLAGER_COMBAT,
  },
  swordsman: {
    id: 'swordsman',
    name: 'Swordsman',
    description: 'Armored infantry with sword and shield. Strong against infantry.',
    cost: { food: 3, iron: 2, gold: 1 },
    trainTime: 20,
    speed: 2.2,
    radius: 0.45,
    maxPerPlayer: 200,
    controllable: true,
    combat: {
      health: 120,
      armor: 3,
      armorClass: 'infantry',
      sightRange: 9,
      attack: {
        kind: 'melee',
        damage: 12,
        cooldown: 1.2,
        windup: 0.5,
        range: 0.6,
        bonus: { infantry: 1.5 },
      },
    },
  },
  spearman: {
    id: 'spearman',
    name: 'Spearman',
    description: 'Infantry with a long spear. Breaks buildings; later the answer to cavalry.',
    cost: { food: 2, iron: 1, wood: 2 },
    trainTime: 15,
    speed: 2.2,
    radius: 0.45,
    maxPerPlayer: 200,
    controllable: true,
    combat: {
      health: 90,
      armor: 1,
      armorClass: 'infantry',
      sightRange: 9,
      attack: {
        kind: 'melee',
        damage: 9,
        cooldown: 1.4,
        windup: 0.6,
        range: 1.2,
        bonus: { building: 3, cavalry: 2 },
      },
    },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    description: 'Shoots arrows from a distance. Weak up close and against armor.',
    cost: { food: 2, wood: 3, gold: 1 },
    trainTime: 18,
    speed: 2.3,
    radius: 0.4,
    maxPerPlayer: 200,
    controllable: true,
    combat: {
      health: 60,
      armor: 0,
      armorClass: 'ranged',
      sightRange: 11,
      attack: {
        kind: 'ranged',
        damage: 8,
        cooldown: 1.6,
        windup: 0.7,
        range: 9,
        projectileSpeed: 18,
        bonus: { building: 0.5 },
      },
    },
  },
  // Neutral monsters (camps, waves): never trained, never commanded by a player.
  skeletonMinion: {
    id: 'skeletonMinion',
    name: 'Skeleton',
    description: 'A shambling skeleton with a rusty blade. Weak alone, dangerous in numbers.',
    cost: {},
    bounty: { gold: 1 },
    speed: 1.9,
    radius: 0.4,
    maxPerPlayer: 400,
    controllable: false,
    combat: {
      health: 50,
      armor: 0,
      armorClass: 'monster',
      sightRange: 8,
      attack: { kind: 'melee', damage: 6, cooldown: 1.2, windup: 0.5, range: 0.6 },
    },
  },
  skeletonWarrior: {
    id: 'skeletonWarrior',
    name: 'Skeleton Warrior',
    description: 'A helmeted skeleton with axe and shield.',
    cost: {},
    bounty: { gold: 2 },
    speed: 1.9,
    radius: 0.45,
    maxPerPlayer: 400,
    controllable: false,
    combat: {
      health: 110,
      armor: 2,
      armorClass: 'monster',
      sightRange: 8,
      attack: { kind: 'melee', damage: 10, cooldown: 1.4, windup: 0.6, range: 0.7 },
    },
  },
  skeletonArcher: {
    id: 'skeletonArcher',
    name: 'Skeleton Crossbowman',
    description: 'A hooded skeleton with a crossbow.',
    cost: {},
    bounty: { gold: 1 },
    speed: 1.9,
    radius: 0.4,
    maxPerPlayer: 400,
    controllable: false,
    combat: {
      health: 50,
      armor: 0,
      armorClass: 'monster',
      sightRange: 10,
      attack: {
        kind: 'ranged',
        damage: 7,
        cooldown: 1.8,
        windup: 0.4,
        range: 8,
        projectileSpeed: 20,
        bonus: { building: 0.5 },
      },
    },
  },
} as const satisfies Record<string, UnitDefinition>;

export type UnitKind = keyof typeof UNITS;

export function isUnitKind(value: unknown): value is UnitKind {
  return typeof value === 'string' && Object.hasOwn(UNITS, value);
}

/** Health, armor and attack of a unit kind (widened from the catalog's literal types). */
export const combatOf = (kind: UnitKind): CombatStats => UNITS[kind].combat;

/** The attack of a unit kind, or undefined for units that don't fight (villagers). */
export const attackOf = (kind: UnitKind): AttackDefinition | undefined => combatOf(kind).attack;
