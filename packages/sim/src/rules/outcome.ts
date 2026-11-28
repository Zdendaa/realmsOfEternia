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

/** The sides of the match: each team's players, and every teamless player on their own. */
function sidesOf(state: GameState): PlayerId[][] {
  const sides = new Map<string, PlayerId[]>();
  for (const player of Object.keys(state.stocks)) {
    const team = state.teams[player];
    const key = team === undefined ? `player:${player}` : `team:${team}`;
    const side = sides.get(key);
    if (side) side.push(player);
    else sides.set(key, [player]);
  }
  return [...sides.values()];
}

/**
 * Decides the game for every player with a stock who isn't decided yet, side by side (a
 * team, or a player alone): **lost** when the side had a Town Hall and has none left
 * (checked first); **won** when the side has a Town Hall and either every other side has
 * lost, or the map's objective is met (`clearMonsters`: every wave sent and no living
 * monster, on a map that has camps or waves). A player whose own Town Hall fell plays on
 * while an ally's stands. Outcomes never change once set. Returns the same object when
 * nothing was decided.
 */
export function decideOutcomes(
  world: SimWorld,
  previous: GameState,
  next: GameState,
): Readonly<Record<PlayerId, Outcome>> {
  let outcome: Record<PlayerId, Outcome> | null = null;
  const current = () => outcome ?? next.outcome;
  const decide = (side: readonly PlayerId[], result: Outcome['result']) => {
    for (const player of side) {
      if (current()[player]) continue;
      outcome ??= { ...next.outcome };
      outcome[player] = { result, at: previous.tick };
    }
  };
  const hasTownHall = (state: GameState, side: readonly PlayerId[]) =>
    state.buildings.some(
      (b) => b.type === 'townHall' && b.ownerId !== null && side.includes(b.ownerId),
    );
  const sides = sidesOf(next);
  for (const side of sides) {
    if (hasTownHall(previous, side) && !hasTownHall(next, side)) decide(side, 'lost');
  }

  // A map without camps or waves has nothing to clear, so it can't be won this way.
  const hasMonsters = (world.map.camps?.length ?? 0) + (world.map.waves?.length ?? 0) > 0;
  const objectiveMet =
    world.map.objective === 'clearMonsters' &&
    hasMonsters &&
    next.wavesSent >= (world.map.waves?.length ?? 0) &&
    !next.units.some((u) => u.ownerId === MONSTER_PLAYER && isAlive(u));
  const lost = (side: readonly PlayerId[]) => side.every((p) => current()[p]?.result === 'lost');
  const standing = sides.filter((side) => !lost(side));
  const lastOne = sides.length > 1 && standing.length === 1;
  for (const side of standing) {
    if ((objectiveMet || lastOne) && hasTownHall(next, side)) decide(side, 'won');
  }
  return current();
}
