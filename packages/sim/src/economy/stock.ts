import {
  RESOURCE_IDS,
  type ResourceAmounts,
  type ResourceCost,
  type ResourceId,
} from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import type { GameState } from '../state/gameState.js';

/** A stock with nothing in it (players without a stock, e.g. neutral). */
export const EMPTY_STOCK: Readonly<ResourceAmounts> = Object.freeze(
  Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0])) as ResourceAmounts,
);

/** The player's stock; an empty one if the player has none. */
export const stockOf = (state: GameState, player: PlayerId | null): Readonly<ResourceAmounts> =>
  (player !== null ? state.stocks[player] : undefined) ?? EMPTY_STOCK;

/** Resources of `cost` the stock can't cover, in display order. */
export function missingResources(
  stock: Readonly<ResourceAmounts>,
  cost: ResourceCost,
): ResourceId[] {
  return RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > stock[id]);
}

export const canAfford = (stock: Readonly<ResourceAmounts>, cost: ResourceCost) =>
  missingResources(stock, cost).length === 0;

/** The stock after paying `cost`. The caller checks `canAfford` first. */
export function pay(stock: Readonly<ResourceAmounts>, cost: ResourceCost): ResourceAmounts {
  const next = { ...stock };
  for (const id of RESOURCE_IDS) next[id] -= cost[id] ?? 0;
  return next;
}

/** `state` with the player's stock replaced. */
export const withStock = (
  state: GameState,
  player: PlayerId,
  stock: ResourceAmounts,
): GameState => ({ ...state, stocks: { ...state.stocks, [player]: stock } });
