import { SIMULATION_TICK_RATE, type EntityId, type PlayerId, type Vec2 } from '@roe/shared';
import type { BuildingId, UnitKind } from '@roe/game-data';
import type { UnitInstance } from '../state/units.js';
import type { Hits } from './damage.js';

/**
 * An arrow in flight. It homes on its target and can't miss a living one: on
 * `impactAt` the damage applies if the target is still alive, otherwise the arrow lands
 * harmlessly. Rendering draws the arc between the release point and the target.
 * Keyed by `attackerId` + `firedAt` (a unit releases at most one arrow per tick).
 */
export interface Projectile {
  attackerId: EntityId;
  /** The shooter's owner (kept after the shooter dies). */
  ownerId: PlayerId | null;
  targetId: EntityId;
  fromX: number;
  fromZ: number;
  /** Height above the ground it leaves from; absent: a standing archer's bow (rendering). */
  fromHeight?: number;
  /** The tower type that shot it: decides its effects on impact and its look. */
  source?: BuildingId;
  /** The unit kind that fired a shot with its own look (rendering). */
  shooter?: UnitKind;
  /** The unit kind that fired a splash shot (a catapult's rock): decides what it hits. */
  weapon?: UnitKind;
  /**
   * Where the target stood at release. A catapult's rock lands there; a tower's splash
   * shot whose target is gone bursts there.
   */
  aim?: Vec2;
  firedAt: number;
  impactAt: number;
  /** Damage on impact, worked out at release (bonus and armor included). */
  damage: number;
}

/**
 * A new arrow from `attacker` to the unit or building `targetId` (now at `target`),
 * flying at `speed` units per second.
 */
export function fireProjectile(
  attacker: UnitInstance,
  targetId: EntityId,
  target: Vec2,
  tick: number,
  speed: number,
  damage: number,
): Projectile {
  return {
    attackerId: attacker.id,
    ownerId: attacker.ownerId,
    targetId,
    ...arrowFlight(attacker, target, tick, speed),
    damage,
  };
}

/** Where and when an arrow from `from` to `target` flies. */
export function arrowFlight(from: Vec2, target: Vec2, tick: number, speed: number) {
  const distance = Math.sqrt((target.x - from.x) ** 2 + (target.z - from.z) ** 2);
  const flightTicks = Math.max(1, Math.ceil((distance / speed) * SIMULATION_TICK_RATE));
  return { fromX: from.x, fromZ: from.z, firedAt: tick, impactAt: tick + flightTicks };
}

/**
 * Lands every arrow due on `tick` (adding its damage to `hits`, whether or not the
 * target still lives; dead targets ignore hits) and returns the ones still flying.
 * Returns the same array when nothing landed.
 */
export function landProjectiles(
  projectiles: readonly Projectile[],
  tick: number,
  hits: Hits,
): readonly Projectile[] {
  if (!projectiles.some((p) => p.impactAt <= tick)) return projectiles;
  const flying: Projectile[] = [];
  for (const p of projectiles) {
    // Splash shots carry no damage of their own (see `applyTowerImpacts`).
    if (p.impactAt <= tick) {
      if (p.damage > 0) hits.add(p.targetId, p.damage, p.ownerId, p.attackerId);
    } else flying.push(p);
  }
  return flying;
}
