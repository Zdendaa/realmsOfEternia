import { applyCommand, type CommandResult } from '../commands/applyCommand.js';
import type { IssuedCommand } from '../commands/types.js';
import { applyBuildingHits } from '../combat/buildings.js';
import { payBounties } from '../combat/bounty.js';
import { sendDueWaves } from '../combat/waves.js';
import { applyHits, Hits, removeCorpses } from '../combat/damage.js';
import { updateFighters } from '../combat/fighting.js';
import { landProjectiles, type Projectile } from '../combat/projectiles.js';
import { progressConstruction } from '../construction/construction.js';
import { progressTraining } from '../training/training.js';
import { syncContext, type SimContext } from '../context/simContext.js';
import { commitEconomy, createEconomyDraft } from '../economy/draft.js';
import type { GameState } from '../state/gameState.js';
import { advanceUnits, invalidateBlockedRoutes, planPaths } from '../units/movement.js';
import { separateUnits } from '../units/separation.js';
import { updateSerfs } from '../units/serfBehavior.js';
import { hireWorkers, updateWorkers } from '../units/workers.js';

export interface StepResult {
  state: GameState;
  /** One result per issued command, in order. */
  results: CommandResult[];
}

/**
 * Advances the game by one fixed tick (`SIMULATION_TICK_MS`). Client and server call
 * exactly this with the same commands in the same order and get the same state.
 *
 * Order: commands → arrows landing → behavior (serfs: tasks, gathering, deliveries;
 * workers: harvesting, farming; fighters: targets, chases, strikes) → the tick's damage
 * and deaths (units; then buildings, which fall into ruins with their workers) → route invalidation → path planning → walking → separation → construction
 * work → workers for production buildings that have none (housing permitting) → trained
 * units leaving their building → scripted waves that are due → removal
 * of corpses that have lain long enough. `ctx` is synced along the
 * way and left matching the returned state. The given state is never mutated.
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
  const hits = new Hits();
  const flying = landProjectiles(current.projectiles, current.tick, hits);
  const released: Projectile[] = [];
  updateSerfs(ctx, current.tick, current.buildings, units, economy);
  updateWorkers(current.tick, current.buildings, units, economy);
  updateFighters(ctx, current.tick, units, current.buildings, hits, released);
  const deaths = applyHits(units, hits, current.tick);
  payBounties(economy, deaths, (player) => current.stocks[player] !== undefined);
  if (ctx.nav.version !== navVersion) invalidateBlockedRoutes(ctx, units);
  planPaths(ctx, units);
  advanceUnits(units);
  separateUnits(ctx, units);
  const economic = commitEconomy(economy);
  // Buildings hit hard enough fall (with their workers) and leave ruins.
  const standing = applyBuildingHits(
    {
      buildings: current.buildings,
      construction: economic.construction,
      fields: economic.fields,
      buildingDamage: current.buildingDamage,
      ruins: current.ruins,
    },
    units,
    hits,
    current.tick,
  );
  const { buildings, construction } = progressConstruction(
    { buildings: standing.buildings, construction: standing.construction },
    units,
  );

  // Production buildings without a worker get one while their owner has free housing.
  const hired = hireWorkers(buildings, units, current.nextEntityId);
  // Trained units leave their building (housing permitting, after this tick's workers).
  const trained = progressTraining(buildings, current.training, units, current.tick, hired);
  // Scripted monster waves that are due march in.
  const waves = sendDueWaves(
    ctx.world.map.waves ?? [],
    current.wavesSent,
    current.tick,
    buildings,
    units,
    trained.nextEntityId,
  );
  const nextEntityId = waves.nextEntityId;
  const remaining = removeCorpses(units, current.tick);
  const projectiles = released.length > 0 ? [...flying, ...released] : flying;

  const next: GameState = {
    ...current,
    tick: current.tick + 1,
    units: remaining,
    buildings,
    construction,
    resourceNodes: economic.resourceNodes,
    stocks: economic.stocks,
    fields: standing.fields,
    buildingDamage: standing.buildingDamage,
    ruins: standing.ruins,
    wavesSent: waves.wavesSent,
    lastWaveAt: waves.sentNow ? current.tick : current.lastWaveAt,
    projectiles,
    training: trained.training,
    nextEntityId,
  };
  syncContext(ctx, next);
  return { state: next, results };
}
