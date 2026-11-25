import { RESOURCE_IDS, UNITS, type UnitDefinition } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import { deposit, type EconomyDraft } from '../economy/draft.js';
import type { UnitInstance } from '../state/units.js';

/**
 * Pays each killed unit's bounty (monsters) to the player who struck the last blow, if
 * that player has a stock. Goes through the economy draft like delivered goods.
 */
export function payBounties(
  economy: EconomyDraft,
  deaths: readonly { victim: UnitInstance; killer: PlayerId | null }[],
  hasStock: (player: PlayerId) => boolean,
): void {
  for (const { victim, killer } of deaths) {
    const bounty = (UNITS[victim.type] as UnitDefinition).bounty;
    if (!bounty || killer === null || killer === victim.ownerId || !hasStock(killer)) continue;
    for (const resource of RESOURCE_IDS) {
      const amount = bounty[resource] ?? 0;
      if (amount > 0) deposit(economy, killer, { resource, amount });
    }
  }
}
