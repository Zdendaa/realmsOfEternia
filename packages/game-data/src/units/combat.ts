/**
 * What a unit or building counts as when it is hit. Attacks name bonuses per class, so
 * counters are data: swordsmen beat infantry, spearmen break buildings, infantry breaks
 * siege engines. `cavalry` is reserved for 6b.7.
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
  /** Shot flight speed in world units per second (ranged only). */
  projectileSpeed?: number;
  /**
   * A siege weapon: on its own it goes for enemy buildings first (towers, then the
   * nearest, walls and gates included, which other units leave alone) and only then for
   * units.
   */
  siege?: boolean;
  /** It can't hit units at all, and never fights back against them. */
  buildingsOnly?: boolean;
  /** Nothing closer than this (edge to edge) can be hit. */
  minRange?: number;
  /**
   * The shot flies to where the target was at release and hits every enemy unit and
   * building within `radius` of that spot, so units that move away dodge it.
   */
  splash?: { radius: number };
  /** Height above the ground the shot leaves from (rendering). */
  launchHeight?: number;
  /** How the shot looks, when it isn't an arrow (rendering). */
  shot?: { look: 'orb'; color: string; size: number };
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

/** What every building counts as when hit: some armor, and the building class. */
export const BUILDING_COMBAT = { armor: 2, armorClass: 'building' } as const satisfies Pick<
  CombatStats,
  'armor' | 'armorClass'
>;

/**
 * Breaching: fighters with no way to where they want to go break through an enemy wall.
 * These costs only choose which segment: they are in path-search units (a straight step
 * of one cell costs 10).
 */
export const BREACH_RULES = {
  /** Per wall cell crossed: so high that any way around always wins. */
  cellCost: 10_000,
  /** Added per cell for each hit point of the segment: weak spots (gates) are preferred. */
  costPerHealth: 10,
} as const;

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
  /**
   * A construction site has this share of its building's health when started, growing
   * to all of it as the work progresses.
   */
  siteHealthShare: 0.1,
  /** Idle comrades this close to a unit a tower is shooting react along with it. */
  alarmRadius: 6,
  /**
   * Units that can't get at a tower shooting them retreat this far beyond its range
   * (also how far beyond it a unit fighting back may stray before its leash counts again).
   */
  retreatMargin: 2,
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
