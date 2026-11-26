import type { UnitKind } from '../units/definitions.js';
import type { AbilityId } from './abilities.js';

/** The hero types of the Humans; each is also a unit kind with its level 1 numbers. */
export const HERO_IDS = [
  'commander',
  'archmage',
  'pathfinder',
] as const satisfies readonly UnitKind[];

export type HeroId = (typeof HERO_IDS)[number];

export interface HeroDefinition {
  id: HeroId;
  /** Added per level above the first, in whole numbers (every machine computes the same). */
  healthPerLevel: number;
  damagePerLevel: number;
  /** In the order they unlock (levels 1, 3 and 5). */
  abilities: readonly AbilityId[];
}

export const HEROES: Readonly<Record<HeroId, HeroDefinition>> = {
  commander: {
    id: 'commander',
    healthPerLevel: 45,
    damagePerLevel: 3,
    abilities: ['rally', 'shockwave', 'lastStand'],
  },
  archmage: {
    id: 'archmage',
    healthPerLevel: 25,
    damagePerLevel: 3,
    abilities: ['fireball', 'frostNova', 'massHeal'],
  },
  /** Not given by the prototype map; ready for later maps. */
  pathfinder: {
    id: 'pathfinder',
    healthPerLevel: 30,
    damagePerLevel: 3,
    abilities: ['eagleEye', 'volley', 'sapperCharge'],
  },
};

export const HERO_RULES = {
  maxLevel: 5,
  /** Total experience needed for level 1, 2, ... `maxLevel`. */
  levelExperience: [0, 100, 250, 450, 700],
  /**
   * A hero gets all the experience of what it kills itself, and this fraction's worth
   * (1 / `shareDivisor`, rounded down) of what its side kills within `shareRadius`.
   */
  shareRadius: 10,
  shareDivisor: 2,
} as const;

export const isHeroId = (value: unknown): value is HeroId =>
  typeof value === 'string' && (HERO_IDS as readonly string[]).includes(value);
