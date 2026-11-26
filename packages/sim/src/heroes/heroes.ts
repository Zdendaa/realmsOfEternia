import {
  attackOf,
  combatOf,
  HERO_RULES,
  HEROES,
  isHeroId,
  UNITS,
  type AttackDefinition,
  type HeroId,
  type UnitDefinition,
  type UnitKind,
} from '@roe/game-data';
import type { EntityId, PlayerId, Vec2 } from '@roe/shared';
import type { GameState } from '../state/gameState.js';
import { createUnit, isAlive, type HeroState, type UnitInstance } from '../state/units.js';
import { areEnemies } from '../combat/hostility.js';

/**
 * Heroes: the one way to create them, their levels, and the experience they earn.
 * Nothing here depends on how a hero arrived (today: the map's starting heroes; later
 * perhaps recruiting), only on `spawnHero`.
 */

export type SpawnHeroIssue = 'unknownHero' | 'heroExists';

export type SpawnHeroResult =
  | { ok: true; state: GameState; unitId: EntityId }
  | { ok: false; state: GameState; issue: SpawnHeroIssue };

/** Whether `owner` already has this hero (a fallen one, in its grave, still counts). */
export const hasHero = (
  { units, graves }: Pick<GameState, 'units' | 'graves'>,
  owner: PlayerId,
  hero: HeroId,
) =>
  units.some((u) => u.type === hero && u.ownerId === owner) ||
  graves.some((g) => g.hero === hero && g.ownerId === owner);

/**
 * Creates `hero` for `owner` at `at`. Every hero is created here, so the rule of at most
 * one of each type per player holds whatever creates them.
 */
export function spawnHero(
  state: GameState,
  hero: string,
  owner: PlayerId,
  at: Vec2,
): SpawnHeroResult {
  if (!isHeroId(hero)) return { ok: false, state, issue: 'unknownHero' };
  if (hasHero(state, owner, hero)) return { ok: false, state, issue: 'heroExists' };
  const unitId = state.nextEntityId;
  const unit = createUnit(unitId, hero, owner, at);
  return {
    ok: true,
    unitId,
    state: { ...state, units: [...state.units, unit], nextEntityId: unitId + 1 },
  };
}

/** The level reached with `experience` in total. */
export function levelFor(experience: number): number {
  let level = 1;
  while (
    level < HERO_RULES.maxLevel &&
    experience >= (HERO_RULES.levelExperience[level] ?? Infinity)
  ) {
    level++;
  }
  return level;
}

/** Levels gained above the first by a unit: 0 for everyone but heroes. */
const gainedLevels = (unit: { hero: HeroState | null }) => (unit.hero?.level ?? 1) - 1;

const perLevel = (kind: UnitKind) => (isHeroId(kind) ? HEROES[kind] : null);

/** A unit's full health: its kind's, plus a hero's growth with its level. */
export function maxHealthOf(unit: Pick<UnitInstance, 'type' | 'hero'>): number {
  return (
    combatOf(unit.type).health + gainedLevels(unit) * (perLevel(unit.type)?.healthPerLevel ?? 0)
  );
}

/** A unit's attack, a hero's damage grown with its level; undefined for villagers. */
export function unitAttack(
  unit: Pick<UnitInstance, 'type' | 'hero'>,
): AttackDefinition | undefined {
  const attack = attackOf(unit.type);
  const bonus = gainedLevels(unit) * (perLevel(unit.type)?.damagePerLevel ?? 0);
  return attack && bonus > 0 ? { ...attack, damage: attack.damage + bonus } : attack;
}

/** What killing a unit of this kind is worth to a hero. */
export const experienceWorth = (kind: UnitKind) => (UNITS[kind] as UnitDefinition).experience;

/**
 * Adds experience to a hero (mutating the working copy). A new level raises its full
 * health, and its current health by as much; it doesn't otherwise heal.
 */
export function gainExperience(unit: UnitInstance, amount: number): void {
  if (!unit.hero || amount <= 0) return;
  const before = maxHealthOf(unit);
  const experience = unit.hero.experience + amount;
  unit.hero = { ...unit.hero, experience, level: levelFor(experience) };
  unit.health += maxHealthOf(unit) - before;
}

export interface Death {
  victim: UnitInstance;
  /** Who dealt the last blow: the player, and the unit or tower (null for a fire). */
  killer: PlayerId | null;
  killerId: EntityId | null;
}

/**
 * Hands out the experience for this tick's deaths: each living hero of the killing side
 * gets all of it for a kill of its own, and a share for its side's kills close by.
 * Several heroes each get their own. Mutates the working copies.
 */
export function grantExperience(units: UnitInstance[], deaths: readonly Death[]): void {
  if (deaths.length === 0) return;
  const heroes = units.filter((u) => u.hero && isAlive(u));
  if (heroes.length === 0) return;
  const reach = HERO_RULES.shareRadius ** 2;
  for (const { victim, killer, killerId } of deaths) {
    if (!areEnemies(killer, victim.ownerId)) continue;
    const worth = experienceWorth(victim.type);
    for (const hero of heroes) {
      if (hero.ownerId !== killer) continue;
      if (hero.id === killerId) gainExperience(hero, worth);
      else if ((hero.x - victim.x) ** 2 + (hero.z - victim.z) ** 2 <= reach) {
        gainExperience(hero, Math.floor(worth / HERO_RULES.shareDivisor));
      }
    }
  }
}
