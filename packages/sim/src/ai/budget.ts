import { RESOURCE_IDS, type ResourceAmounts, type ResourceCost } from '@roe/game-data';

/**
 * What is left to spend in one decision: the stock, less what the managers before have
 * already committed, so no two of them count on the same resources.
 */
export type Budget = ResourceAmounts;

export const affords = (budget: Budget, cost: ResourceCost) =>
  RESOURCE_IDS.every((id) => (cost[id] ?? 0) <= budget[id]);

export function spend(budget: Budget, cost: ResourceCost): void {
  for (const id of RESOURCE_IDS) budget[id] -= cost[id] ?? 0;
}
