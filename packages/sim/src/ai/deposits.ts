import type { DepositDefinition, Vec2 } from '@roe/shared';

/** The index of the deposit whose area holds `point`, or -1. */
export const depositAt = (deposits: readonly DepositDefinition[], point: Vec2) =>
  deposits.findIndex((d) => (d.x - point.x) ** 2 + (d.z - point.z) ** 2 <= d.radius * d.radius);
