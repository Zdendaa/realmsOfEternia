import type { PlayerId } from '@roe/shared';

/**
 * The neutral monsters' player (skeleton camps, waves). An ordinary player id: being
 * different from every other owner makes monsters hostile to everyone.
 */
export const MONSTER_PLAYER: PlayerId = 'monsters';

/** Each player's team number. A player without one stands alone. */
export type Teams = Readonly<Record<PlayerId, number>>;

/** Whether `a` and `b` are on one side: the same player, or players of the same team. */
export const areAllies = (teams: Teams, a: PlayerId | null, b: PlayerId | null): boolean =>
  a !== null && b !== null && (a === b || (teams[a] !== undefined && teams[a] === teams[b]));

/**
 * Whether units of `a` and `b` fight each other: both have an owner and they aren't
 * allies. Monsters have no team, so they fight everyone. Neutral (null) units and
 * buildings are never attacked and never attack.
 */
export const areEnemies = (teams: Teams, a: PlayerId | null, b: PlayerId | null): boolean =>
  a !== null && b !== null && !areAllies(teams, a, b);
