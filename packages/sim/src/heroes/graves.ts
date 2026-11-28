import { HERO_RULES, type HeroId, isHeroId } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { areEnemies, type Teams } from '../combat/hostility.js';
import type { SimContext } from '../context/simContext.js';
import { nearestWalkablePoint } from '../nav/navGrid.js';
import { createUnit, IDLE, isAlive, type HeroState, type UnitInstance } from '../state/units.js';
import { maxHealthOf, type Death } from './heroes.js';

/**
 * Fallen heroes. A hero that dies leaves a grave on the spot: nothing can attack it,
 * and it keeps what the hero had learned. Its own side brings the hero back by standing
 * next to it for a while with no enemy near.
 */
export interface Grave {
  /** The fallen hero's unit id; the hero comes back under it. */
  id: EntityId;
  hero: HeroId;
  ownerId: PlayerId;
  x: number;
  z: number;
  /** Level, experience and cooldowns as they were. */
  state: HeroState;
  /** Ticks of revival done; it pauses, but is never lost. */
  progress: number;
}

/** Ticks a revival takes. */
export const REVIVE_TICKS = HERO_RULES.reviveSeconds * SIMULATION_TICK_RATE;

/** How a revival stands: under way, waiting for an own unit, or held up by enemies. */
export type ReviveStatus = 'reviving' | 'noUnit' | 'contested';

export function reviveStatus(
  teams: Teams,
  grave: Grave,
  units: readonly UnitInstance[],
): ReviveStatus {
  const near = HERO_RULES.reviveRadius ** 2;
  const clear = HERO_RULES.reviveClearRadius ** 2;
  let helper = false;
  for (const unit of units) {
    if (!isAlive(unit)) continue;
    const distance = (unit.x - grave.x) ** 2 + (unit.z - grave.z) ** 2;
    if (distance <= clear && areEnemies(teams, grave.ownerId, unit.ownerId)) return 'contested';
    if (distance <= near && unit.ownerId === grave.ownerId) helper = true;
  }
  return helper ? 'reviving' : 'noUnit';
}

/** The grave a hero that just died leaves, or null for anyone else. */
function graveOf({ victim }: Death): Grave | null {
  if (!victim.hero || !isHeroId(victim.type) || victim.ownerId === null) return null;
  return {
    id: victim.id,
    hero: victim.type,
    ownerId: victim.ownerId,
    x: victim.x,
    z: victim.z,
    state: victim.hero,
    progress: 0,
  };
}

/** The hero back from its grave: hurt, with everything it had learned. */
function risen(ctx: SimContext, grave: Grave): UnitInstance {
  // Something may have been built over the grave meanwhile.
  const at = nearestWalkablePoint(ctx.nav, grave.x, grave.z, grave.ownerId) ?? grave;
  const unit = createUnit(grave.id, grave.hero, grave.ownerId, at);
  unit.hero = grave.state;
  unit.health = Math.max(1, Math.floor((maxHealthOf(unit) * HERO_RULES.reviveHealthPercent) / 100));
  return unit;
}

/**
 * One tick of the graves: this tick's fallen heroes get theirs, revivals that have an
 * own unit close and no enemy near move on, and finished ones bring the hero back
 * (appended to `units`). Units sent to a grave that is gone become idle. Returns the
 * same array when no grave changed. Mutates the unit working copies.
 */
export function updateGraves(
  ctx: SimContext,
  units: UnitInstance[],
  current: readonly Grave[],
  deaths: readonly Death[],
): readonly Grave[] {
  const fallen = deaths.map(graveOf).filter((g): g is Grave => g !== null);
  if (current.length === 0 && fallen.length === 0) return current;
  let changed = fallen.length > 0;
  const graves: Grave[] = [];
  const back: UnitInstance[] = [];
  for (const grave of current) {
    if (reviveStatus(ctx.teams, grave, units) !== 'reviving') {
      graves.push(grave);
      continue;
    }
    changed = true;
    if (grave.progress + 1 >= REVIVE_TICKS) back.push(risen(ctx, grave));
    else graves.push({ ...grave, progress: grave.progress + 1 });
  }
  graves.push(...fallen);
  if (back.length > 0) {
    const standing = new Set(graves.map((g) => g.id));
    for (const unit of units) {
      if (unit.task.kind === 'revive' && !standing.has(unit.task.graveId)) unit.task = IDLE;
    }
    // A fallen hero's body is long gone by the time it can rise.
    units.push(...back);
  }
  return changed ? graves : current;
}
