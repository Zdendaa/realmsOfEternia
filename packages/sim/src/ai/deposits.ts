import { depositOf, type ResourceCost } from '@roe/game-data';
import type { DepositDefinition, Vec2 } from '@roe/shared';
import type { AiKnowledge } from './knowledge.js';

/** Whether `cost` takes ore it lacks and has no mine to get. */
export const lacksSource = (knowledge: AiKnowledge, cost: ResourceCost) =>
  (['iron', 'gold'] as const).some(
    (ore) =>
      (cost[ore] ?? 0) > knowledge.stock[ore] &&
      !knowledge.buildings.some((b) => b.status === 'complete' && depositOf(b.type) === ore),
  );

/** The index of the deposit whose area holds `point`, or -1. */
export const depositAt = (deposits: readonly DepositDefinition[], point: Vec2) =>
  deposits.findIndex((d) => (d.x - point.x) ** 2 + (d.z - point.z) ** 2 <= d.radius * d.radius);
