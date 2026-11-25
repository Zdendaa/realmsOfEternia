import type { PlayerId } from '@roe/shared';

/**
 * The neutral monsters' player (skeleton camps, waves). An ordinary player id: being
 * different from every other owner makes monsters hostile to everyone.
 */
export const MONSTER_PLAYER: PlayerId = 'monsters';

/**
 * Whether units of `a` and `b` fight each other: both have an owner and the owners
 * differ. Neutral (null) units and buildings are never attacked and never attack.
 * There are no alliances yet.
 */
export const areEnemies = (a: PlayerId | null, b: PlayerId | null): boolean =>
  a !== null && b !== null && a !== b;
