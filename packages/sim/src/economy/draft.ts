import type { ResourceAmounts, ResourceId } from '@roe/game-data';
import type { EntityId, PlayerId } from '@roe/shared';
import type { ConstructionProgress, GameState } from '../state/gameState.js';
import { remainingAmount } from '../state/resourceNodes.js';
import type { Cargo } from '../state/units.js';
import type { SimWorld } from '../world/createWorld.js';
import { EMPTY_STOCK } from './stock.js';

/**
 * Copy-on-write working copies of the economy for one tick. Harvesting, deposits and
 * material deliveries to construction sites write here; `commit` returns the new records, or the old ones (same references)
 * when nothing changed, so per-tick state changes stay cheap and stable.
 */
export interface EconomyDraft {
  readonly world: SimWorld;
  /** Read through `remaining`; written by `take`. */
  nodes: Readonly<Record<number, number>>;
  stocks: Readonly<Record<PlayerId, Readonly<ResourceAmounts>>>;
  construction: Readonly<Record<EntityId, ConstructionProgress>>;
  nodesCopied: boolean;
  stocksCopied: boolean;
  constructionCopied: boolean;
}

export function createEconomyDraft(
  world: SimWorld,
  state: Pick<GameState, 'resourceNodes' | 'stocks' | 'construction'>,
): EconomyDraft {
  return {
    world,
    nodes: state.resourceNodes,
    stocks: state.stocks,
    construction: state.construction,
    nodesCopied: false,
    stocksCopied: false,
    constructionCopied: false,
  };
}

/** What is left of node `id` in this tick. */
export const remaining = (draft: EconomyDraft, id: number) =>
  remainingAmount(draft.world, draft.nodes, id);

/** Takes one unit from node `id`. Returns false if nothing is left. */
export function take(draft: EconomyDraft, id: number): boolean {
  const left = remaining(draft, id);
  if (left <= 0) return false;
  if (!draft.nodesCopied) {
    draft.nodes = { ...draft.nodes };
    draft.nodesCopied = true;
  }
  (draft.nodes as Record<number, number>)[id] = left - 1;
  return true;
}

/**
 * Hands goods in at a storage: they join the player's stock, except construction
 * material reserved for a site, which goes back to that site's reserve (it was paid
 * already; adding it again would create resources).
 */
export function deposit(draft: EconomyDraft, player: PlayerId, cargo: Cargo): void {
  if (cargo.siteId !== undefined) return;
  if (!draft.stocksCopied) {
    draft.stocks = { ...draft.stocks };
    draft.stocksCopied = true;
  }
  const stock = draft.stocks[player] ?? EMPTY_STOCK;
  (draft.stocks as Record<PlayerId, ResourceAmounts>)[player] = {
    ...stock,
    [cargo.resource]: stock[cargo.resource] + cargo.amount,
  };
}

/** Records one delivered unit of `resource` at construction site `siteId`. */
export function deliverToSite(draft: EconomyDraft, siteId: EntityId, resource: ResourceId): void {
  const progress = draft.construction[siteId];
  if (!progress) return;
  if (!draft.constructionCopied) {
    draft.construction = { ...draft.construction };
    draft.constructionCopied = true;
  }
  (draft.construction as Record<EntityId, ConstructionProgress>)[siteId] = {
    ...progress,
    delivered: { ...progress.delivered, [resource]: (progress.delivered[resource] ?? 0) + 1 },
  };
}

/** The tick's resulting records (unchanged references when nothing happened). */
export const commitEconomy = (draft: EconomyDraft) => ({
  resourceNodes: draft.nodes,
  stocks: draft.stocks,
  construction: draft.construction,
});
