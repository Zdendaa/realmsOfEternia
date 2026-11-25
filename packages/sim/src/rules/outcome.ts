import type { PlayerId } from '@roe/shared';
import { MONSTER_PLAYER } from '../combat/hostility.js';
import type { GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import type { SimWorld } from '../world/createWorld.js';

/** How the game ended for a player, and on which tick; absent from `GameState.outcome` while it goes on. */
export interface Outcome {
  result: 'won' | 'lost';
  at: number;
}

/** Per-player numbers for the end screen. Counted as things happen. */
export interface PlayerStats {
  soldiersTrained: number;
  enemiesKilled: number;
  buildingsLost: number;
}

export const EMPTY_STATS: PlayerStats = { soldiersTrained: 0, enemiesKilled: 0, buildingsLost: 0 };

/** `stats` with `player`'s numbers changed by `change` (a new object). */
export function addStats(
  stats: Readonly<Record<PlayerId, PlayerStats>>,
  player: PlayerId,
  change: Partial<PlayerStats>,
): Readonly<Record<PlayerId, PlayerStats>> {
  const current = stats[player] ?? EMPTY_STATS;
  return {
    ...stats,
    [player]: {
      soldiersTrained: current.soldiersTrained + (change.soldiersTrained ?? 0),
      enemiesKilled: current.enemiesKilled + (change.enemiesKilled ?? 0),
      buildingsLost: current.buildingsLost + (change.buildingsLost ?? 0),
    },
  };
}

/**
 * Decides the game for every player with a stock who isn't decided yet: **lost** when
 * they had a Town Hall and have none left (checked first), **won** when they have a Town
 * Hall and the map's objective is met (`clearMonsters`: every wave sent and no living
 * monster, on a map that has camps or waves). Outcomes never change once set. Returns the
 * same object when nothing was decided.
 */
export function decideOutcomes(
  world: SimWorld,
  previous: GameState,
  next: GameState,
): Readonly<Record<PlayerId, Outcome>> {
  let outcome: Record<PlayerId, Outcome> | null = null;
  const hasTownHall = (state: GameState, player: PlayerId) =>
    state.buildings.some((b) => b.type === 'townHall' && b.ownerId === player);
  // A map without camps or waves has nothing to clear, so it can't be won this way.
  const hasMonsters = (world.map.camps?.length ?? 0) + (world.map.waves?.length ?? 0) > 0;
  const objectiveMet =
    world.map.objective === 'clearMonsters' &&
    hasMonsters &&
    next.wavesSent >= (world.map.waves?.length ?? 0) &&
    !next.units.some((u) => u.ownerId === MONSTER_PLAYER && isAlive(u));
  for (const player of Object.keys(next.stocks)) {
    if (next.outcome[player]) continue;
    let decided: Outcome | null = null;
    if (hasTownHall(previous, player) && !hasTownHall(next, player)) {
      decided = { result: 'lost', at: previous.tick };
    } else if (objectiveMet && hasTownHall(next, player)) {
      decided = { result: 'won', at: previous.tick };
    }
    if (decided) {
      outcome ??= { ...next.outcome };
      outcome[player] = decided;
    }
  }
  return outcome ?? next.outcome;
}
