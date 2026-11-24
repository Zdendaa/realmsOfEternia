import { applyCommand, type CommandResult } from '../commands/applyCommand.js';
import type { IssuedCommand } from '../commands/types.js';
import { progressConstruction } from '../construction/construction.js';
import { syncContext, type SimContext } from '../context/simContext.js';
import { commitEconomy, createEconomyDraft } from '../economy/draft.js';
import type { GameState } from '../state/gameState.js';
import { advanceUnits, invalidateBlockedRoutes, planPaths } from '../units/movement.js';
import { separateUnits } from '../units/separation.js';
import { updateSerfs } from '../units/serfBehavior.js';

export interface StepResult {
  state: GameState;
  /** One result per issued command, in order. */
  results: CommandResult[];
}

/**
 * Advances the game by one fixed tick (`SIMULATION_TICK_MS`). Client and server call
 * exactly this with the same commands in the same order and get the same state.
 *
 * Order: commands → behavior (tasks, gathering, deliveries) → route invalidation → path
 * planning → walking → separation → construction work. `ctx` is synced along the way and left matching the
 * returned state. The given state is never mutated.
 */
export function stepGame(
  ctx: SimContext,
  state: GameState,
  commands: readonly IssuedCommand[] = [],
): StepResult {
  syncContext(ctx, state);
  const navVersion = ctx.nav.version;

  let current = state;
  const results: CommandResult[] = [];
  for (const { issuer, command } of commands) {
    const result = applyCommand(ctx, current, issuer, command);
    results.push(result);
    current = result.state;
    syncContext(ctx, current);
  }

  // Working copies: units are shallow-copied once per tick and mutated in place below.
  const units = current.units.map((u) => ({ ...u }));
  const economy = createEconomyDraft(ctx.world, current);
  updateSerfs(ctx, current.tick, current.buildings, units, economy);
  if (ctx.nav.version !== navVersion) invalidateBlockedRoutes(ctx, units);
  planPaths(ctx, units);
  advanceUnits(units);
  separateUnits(ctx, units);
  const { buildings, construction } = progressConstruction(current, units);

  const next: GameState = {
    ...current,
    tick: current.tick + 1,
    units,
    buildings,
    construction,
    ...commitEconomy(economy),
  };
  syncContext(ctx, next);
  return { state: next, results };
}
