import { isWall } from '@roe/game-data';
import type { EntityId } from '@roe/shared';
import { recordDecisions, thinkAi, type AiCommand } from '../ai/think.js';
import { applyCommand, type CommandResult } from '../commands/applyCommand.js';
import type { IssuedCommand } from '../commands/types.js';
import { applyBuildingHits } from '../combat/buildings.js';
import { payBounties } from '../combat/bounty.js';
import { sendDueWaves } from '../combat/waves.js';
import { applyHits, Hits, removeCorpses } from '../combat/damage.js';
import { updateFighters } from '../combat/fighting.js';
import { landProjectiles, type Projectile } from '../combat/projectiles.js';
import { updateAbilities } from '../heroes/abilities.js';
import { grantExperience } from '../heroes/heroes.js';
import { updateGraves } from '../heroes/graves.js';
import { progressConstruction } from '../construction/construction.js';
import { progressRepairs } from '../construction/repair.js';
import { progressTraining } from '../training/training.js';
import { syncContext, type SimContext } from '../context/simContext.js';
import { commitEconomy, createEconomyDraft } from '../economy/draft.js';
import type { GameState } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';
import { advanceUnits, invalidateBlockedRoutes, planPaths } from '../units/movement.js';
import { separateUnits } from '../units/separation.js';
import { updateSerfs } from '../units/serfBehavior.js';
import { hireWorkers, updateWorkers } from '../units/workers.js';
import { updateVision } from '../vision/vision.js';
import { addStats, decideOutcomes } from '../rules/outcome.js';
import { createUnitGrid, type UnitGrid } from '../combat/targeting.js';
import { updateTowers } from '../combat/towers.js';
import { applyTowerImpacts, updateEffects } from '../combat/towerImpacts.js';
import { applySplashImpacts } from '../combat/siege.js';
import { progressUpgrades } from '../combat/upgrades.js';

export interface StepResult {
  state: GameState;
  /** One result per issued command, in order. */
  results: CommandResult[];
  /** The commands the computer players gave on this tick, in the order applied. */
  ai: (AiCommand & { result: CommandResult })[];
}

/**
 * Advances the game by one fixed tick (`SIMULATION_TICK_MS`). Client and server call
 * exactly this with the same commands in the same order and get the same state.
 *
 * Order: computer players think (from the state as it came in) → commands → their commands →
 * arrows landing → behavior (serfs: tasks, gathering, deliveries;
 * workers: harvesting, farming; fighters: targets, chases, strikes) → the tick's damage
 * and deaths (units; then buildings, which fall into ruins with their workers) → route invalidation → path planning → walking → separation → construction
 * and repair work → workers for production buildings that have none (housing permitting) → trained
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

  // The computer players decide from the state as the tick begins, before anyone's
  // commands change it.
  const thought = thinkAi(ctx, state);

  let current = state;
  const apply = ({ issuer, command }: IssuedCommand): CommandResult => {
    const result = applyCommand(ctx, current, issuer, command);
    current = result.state;
    syncContext(ctx, current);
    return result;
  };
  const results = commands.map(apply);
  const ai = thought.map((given) => ({ ...given, result: apply(given) }));
  const memories = recordDecisions(current.ai, state.tick, ai);
  if (memories !== current.ai) current = { ...current, ai: memories };

  // Working copies: units are shallow-copied once per tick and mutated in place below.
  const units = current.units.map((u) => ({ ...u }));
  const economy = createEconomyDraft(ctx.world, current);
  const hits = new Hits();
  const flying = landProjectiles(current.projectiles, current.tick, hits);
  // What the landing tower shots do beyond damage, then fires and slows already on.
  const landed = current.projectiles.filter((p) => p.impactAt <= current.tick);
  if (landed.length > 0) {
    let byId: Map<EntityId, UnitInstance> | null = null;
    let impactGrid: UnitGrid | null = null;
    applyTowerImpacts(
      current.teams,
      landed,
      () => (byId ??= new Map(units.map((u) => [u.id, u]))),
      () => (impactGrid ??= createUnitGrid(units)),
      hits,
      current.tick,
    );
    applySplashImpacts(
      current.teams,
      landed,
      () => (impactGrid ??= createUnitGrid(units)),
      current.buildings,
      hits,
    );
  }
  updateEffects(units, hits, current.tick);
  const released: Projectile[] = [];
  updateSerfs(ctx, current.tick, current.buildings, units, economy, current.buildingDamage);
  updateWorkers(current.tick, current.buildings, units, economy);
  const magic = updateAbilities(
    current.teams,
    current.tick,
    units,
    current.buildings,
    hits,
    current,
  );
  updateFighters(ctx, current.tick, units, current.buildings, hits, released, current.projectiles);
  // Towers shoot after the units have moved on this tick's orders (the grid is built only
  // when a tower is ready to look).
  let unitGrid: UnitGrid | null = null;
  const towerCooldowns = updateTowers(
    current.teams,
    current.tick,
    current.buildings,
    () => (unitGrid ??= createUnitGrid(units)),
    current.towerCooldowns,
    released,
    current.upgrades,
  );
  const deaths = applyHits(units, hits, current.tick);
  payBounties(economy, deaths, (player) => current.stocks[player] !== undefined);
  grantExperience(current.teams, units, deaths);
  if (ctx.nav.version !== navVersion) invalidateBlockedRoutes(ctx, units);
  planPaths(ctx, units);
  advanceUnits(units, current.tick);
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
  const built = progressConstruction(
    { buildings: standing.buildings, construction: standing.construction },
    units,
  );
  const { construction } = built;
  // Repairs work on what is left after this tick's hits.
  const repaired = progressRepairs(
    current.tick,
    {
      buildings: standing.buildings,
      buildingDamage: standing.buildingDamage,
      stocks: economic.stocks,
    },
    units,
  );
  const { buildings, upgrades } = progressUpgrades(built.buildings, current.upgrades, current.tick);

  // Production buildings without a worker get one while their owner has free housing.
  const hired = hireWorkers(current.teams, buildings, units, current.nextEntityId);
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
  // Fallen heroes leave graves; revivals move on.
  const graves = updateGraves(ctx, remaining, current.graves, deaths);
  const projectiles = released.length > 0 ? [...flying, ...released] : flying;

  // End-screen numbers, counted as things happen.
  let stats = current.stats;
  for (const owner of trained.trained) stats = addStats(stats, owner, { soldiersTrained: 1 });
  for (const { victim, killer } of deaths) {
    if (killer !== null && killer !== victim.ownerId) {
      stats = addStats(stats, killer, { enemiesKilled: 1 });
    }
  }
  for (const ruin of standing.ruins.slice(current.ruins.length)) {
    // Wall segments don't count: one breach would read as a string of lost buildings.
    if (ruin.ownerId !== null && !isWall(ruin.type))
      stats = addStats(stats, ruin.ownerId, { buildingsLost: 1 });
  }

  const next: GameState = {
    ...current,
    tick: current.tick + 1,
    units: remaining,
    buildings,
    construction,
    resourceNodes: economic.resourceNodes,
    stocks: repaired.stocks,
    fields: standing.fields,
    buildingDamage: repaired.buildingDamage,
    ruins: standing.ruins,
    wavesSent: waves.wavesSent,
    lastWaveAt: waves.sentNow ? current.tick : current.lastWaveAt,
    stats,
    graves,
    casts: magic.casts,
    reveals: magic.reveals,
    projectiles,
    towerCooldowns,
    upgrades,
    training: trained.training,
    nextEntityId,
  };
  // Win or lose: decided once per player, after everything else this tick.
  const decided = { ...next, outcome: decideOutcomes(ctx.world, current, next) };
  syncContext(ctx, decided);
  for (const vision of ctx.visions.values()) updateVision(vision, decided);
  return { state: decided, results, ai };
}
