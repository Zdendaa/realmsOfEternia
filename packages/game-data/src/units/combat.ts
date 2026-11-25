/**
 * What a unit or building counts as when it is hit. Attacks name bonuses per class, so
 * counters are data: swordsmen beat infantry, spearmen break buildings. `cavalry` and
 * `siege` are reserved for Phase 6b.
 */
export type ArmorClass =
  'villager' | 'infantry' | 'ranged' | 'building' | 'monster' | 'cavalry' | 'siege';

export interface AttackDefinition {
  /** Melee hits on the strike tick; ranged attacks release an arrow that hits later. */
  kind: 'melee' | 'ranged';
  /** Base damage per hit, before bonus and armor. */
  damage: number;
  /** Seconds from one attack to the next. */
  cooldown: number;
  /**
   * Seconds from the start of an attack to the hit (melee) or the release (ranged), so
   * the damage lands with the swing of the animation.
   */
  windup: number;
  /** Reach in world units, measured between the two units' edges (radii excluded). */
  range: number;
  /** Damage multipliers by the target's armor class (1 when absent). */
  bonus?: Readonly<Partial<Record<ArmorClass, number>>>;
  /** Arrow flight speed in world units per second (ranged only). */
  projectileSpeed?: number;
}

export interface CombatStats {
  /** Hit points; the unit dies at 0. */
  health: number;
  /** Subtracted from every hit (each hit still does at least 1 damage). */
  armor: number;
  armorClass: ArmorClass;
  /** Units that fight: how they attack, and how far they notice enemies on their own. */
  attack?: AttackDefinition;
  /** Distance (world units, center to center) within which idle units engage enemies. */
  sightRange?: number;
}

/** Shared combat tuning. */
export const COMBAT_RULES = {
  /** Fighting units look for enemies once per this many ticks (staggered by unit id). */
  scanEvery: 3,
  /**
   * A unit that engaged on its own (while idle) gives up a chase this far (world units)
   * from where it started and walks back.
   */
  leash: 12,
  /** A dead unit lies on the ground this long (seconds) before it is removed. */
  corpseSeconds: 3,
  /**
   * A chasing unit re-plans its route when its target has moved this far (world units)
   * from the route's goal.
   */
  repathDistance: 1.5,
  /** Extra reach (world units) a strike in progress still lands within, so a target stepping away mid-swing is still hit. */
  strikeTolerance: 0.5,
} as const;

/**
 * Damage of one hit of `attack` against a target: base damage times the bonus for the
 * target's armor class, minus armor, rounded, at least 1. Integers keep health exact.
 */
export function damageAgainst(
  attack: Pick<AttackDefinition, 'damage' | 'bonus'>,
  target: Pick<CombatStats, 'armor' | 'armorClass'>,
): number {
  const multiplier = attack.bonus?.[target.armorClass] ?? 1;
  return Math.max(1, Math.round(attack.damage * multiplier - target.armor));
}
