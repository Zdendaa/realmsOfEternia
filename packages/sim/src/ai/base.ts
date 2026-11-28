import {
  AI_RULES,
  buildingHealthOf,
  BUILDINGS,
  depositOf,
  housingOf,
  isWall,
  productionOf,
  type BuildingId,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type Vec2 } from '@roe/shared';
import { repairCost } from '../construction/repair.js';
import { canAfford } from '../economy/stock.js';
import type { BuildingInstance } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';
import { affords, spend } from './budget.js';
import { depositAt, lacksSource } from './deposits.js';
import type { AiKnowledge } from './knowledge.js';
import type { AiProposal, ManagerInput } from './manager.js';
import { isDangerous } from './memory.js';
import { siteFor } from './siting.js';
import type { AiGoal, AiState } from './state.js';

const distanceSq = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

const nameOf = (building: BuildingId) => BUILDINGS[building].name.toLowerCase();

/** Whether enemies are in sight or remembered by `building`. */
const underThreat = ({ memory, knowledge }: ManagerInput, building: Vec2) =>
  isDangerous(memory, building) ||
  knowledge.enemyUnits.some((u) => distanceSq(u, building) <= AI_RULES.dangerRadius ** 2);

/**
 * Up to `count` of its serfs for a job at `at`, nearest first: idle ones before gatherers.
 * Those taken are claimed, so no later job in this decision gets them.
 */
function takeSerfs(input: ManagerInput, at: Vec2, count: number): EntityId[] {
  const rank = (u: UnitInstance) => (u.task.kind === 'idle' ? 0 : 1);
  const free = input.knowledge.units.filter(
    (u) =>
      u.type === 'serf' &&
      (u.task.kind === 'idle' || u.task.kind === 'gather') &&
      !input.claimed.has(u.id),
  );
  const ids = free
    .sort((a, b) => rank(a) - rank(b) || distanceSq(a, at) - distanceSq(b, at) || a.id - b.id)
    .slice(0, Math.max(0, count))
    .map((u) => u.id);
  for (const id of ids) input.claimed.add(id);
  return ids;
}

/** Sends serfs to mend what is damaged and out of danger, if it can pay for it. */
function repairs(input: ManagerInput): AiProposal[] {
  const { knowledge } = input;
  return knowledge.buildings.flatMap((building): AiProposal[] => {
    const damage = knowledge.buildingDamage[building.id] ?? 0;
    if (building.status !== 'complete' || isWall(building.type)) return [];
    if (damage < buildingHealthOf(building.type) * AI_RULES.repairAtShare) return [];
    const busy = knowledge.units.some(
      (u) => u.task.kind === 'repair' && u.task.buildingId === building.id,
    );
    if (busy || underThreat(input, building)) return [];
    if (!canAfford(knowledge.stock, repairCost(building.type, damage))) return [];
    const unitIds = takeSerfs(input, building, AI_RULES.repairers);
    if (unitIds.length === 0) return [];
    return [
      {
        command: { type: 'repair', unitIds, buildingId: building.id },
        note: `repair ${nameOf(building.type)}`,
      },
    ];
  });
}

/**
 * Keeps every construction site manned (busy serfs never take up a site on their own),
 * with no more than `builderShare` of its serfs building at once.
 */
function builders(input: ManagerInput): AiProposal[] {
  const { knowledge, difficulty } = input;
  const serfs = knowledge.units.filter((u) => u.type === 'serf');
  const building = serfs.filter((u) => u.task.kind === 'build' || u.task.kind === 'deliver');
  let spare = Math.ceil(serfs.length * AI_RULES.builderShare) - building.length;
  return knowledge.buildings.flatMap((site): AiProposal[] => {
    if (site.status !== 'construction' || underThreat(input, site)) return [];
    const there = knowledge.units.filter(
      (u) => (u.task.kind === 'build' || u.task.kind === 'deliver') && u.task.siteId === site.id,
    ).length;
    const wanted = Math.min(BUILDINGS[site.type].maxBuilders, difficulty.buildersPerSite);
    const unitIds = takeSerfs(input, site, Math.min(wanted - there, spare));
    if (unitIds.length === 0) return [];
    spare -= unitIds.length;
    return [
      {
        command: { type: 'assignBuilders', unitIds, siteId: site.id },
        note: `${unitIds.length} serf(s) build ${nameOf(site.type)}`,
      },
    ];
  });
}

/**
 * Whether `building` still does its job: a finished lumbermill or quarry with nothing
 * left to harvest around it doesn't count, so it builds another elsewhere.
 */
function productive(knowledge: AiKnowledge, building: BuildingInstance): boolean {
  const production = productionOf(building.type);
  if (production?.kind !== 'harvest' || building.status !== 'complete') return true;
  const { node, workRadius } = production;
  return knowledge.nodesAround(node, building, workRadius, 1).length > 0;
}

/** Whether a deposit of the mine's ore, seen unguarded and still free, is in its surroundings. */
function hasOpenDeposit({ knowledge, memory }: ManagerInput, mine: BuildingId): boolean {
  const ore = depositOf(mine);
  const hall = knowledge.townHall;
  if (!ore || !hall) return false;
  const taken = new Set(
    knowledge.buildings
      .filter((b) => depositOf(b.type) !== undefined)
      .map((b) => depositAt(knowledge.deposits, b)),
  );
  return knowledge.deposits.some(
    (d, i) =>
      d.kind === ore &&
      memory.deposits[i] === 'clear' &&
      !taken.has(i) &&
      distanceSq(d, hall) <= AI_RULES.farGatherRadius ** 2,
  );
}

/**
 * The first building of its build order that it has fewer of than the list asks for by
 * then, skipping what it can't place now.
 */
export function nextInBuildOrder(input: ManagerInput): BuildingId | null {
  const { knowledge, memory, personality } = input;
  const owned = new Map<BuildingId, number>();
  for (const building of knowledge.buildings) {
    if (!productive(knowledge, building)) continue;
    owned.set(building.type, (owned.get(building.type) ?? 0) + 1);
  }
  const listed = new Map<BuildingId, number>();
  for (const building of personality.buildOrder) {
    const wanted = (listed.get(building) ?? 0) + 1;
    listed.set(building, wanted);
    if ((owned.get(building) ?? 0) >= wanted) continue;
    if ((memory.noRoom[building] ?? 0) > knowledge.tick) continue;
    if (depositOf(building) && !hasOpenDeposit(input, building)) continue;
    // Saving up for what it has no way to come by would stop everything behind it.
    if (lacksSource(knowledge, BUILDINGS[building].cost)) continue;
    return building;
  }
  return null;
}

/** Whether free places are running out and no house is on the way. */
function needsHouse({ knowledge, memory }: ManagerInput): boolean {
  if ((memory.noRoom.house ?? 0) > knowledge.tick) return false;
  const coming = knowledge.buildings
    .filter((b) => b.status === 'construction')
    .reduce((sum, b) => sum + housingOf(b.type), 0);
  const { capacity, used } = knowledge.population;
  return capacity + coming - used < AI_RULES.freeHousing;
}

export interface BasePlan {
  proposals: AiProposal[];
  /** What changes in its memory. */
  memory: Pick<AiState, 'goal' | 'search' | 'builtAt' | 'noRoom'>;
}

/**
 * The base manager: repairs, builders for its sites, then the next building: a house
 * when places run short (at once), otherwise the next of its build order, as fast as the
 * difficulty lets it. It starts at most one building per decision and saves up for it.
 */
export function manageBase(input: ManagerInput): BasePlan {
  const { knowledge, memory, difficulty } = input;
  const proposals = [...repairs(input), ...builders(input)];
  const { builtAt, noRoom } = memory;
  const idle: BasePlan = { proposals, memory: { goal: null, search: null, builtAt, noRoom } };
  if (!knowledge.townHall) return idle;

  const house = needsHouse(input);
  const building = house ? 'house' : nextInBuildOrder(input);
  if (!building) return idle;

  const sites = knowledge.buildings.filter(
    (b) => b.status === 'construction' && !isWall(b.type),
  ).length;
  const pause = difficulty.buildPauseSeconds * SIMULATION_TICK_RATE;
  let waiting: AiGoal['waiting'] = null;
  if (!affords(input.budget, BUILDINGS[building].cost)) waiting = 'resources';
  // A house doesn't wait its turn: without places nothing else can be staffed.
  else if (!house && sites >= difficulty.maxSites) waiting = 'sites';
  else if (!house && builtAt !== null && knowledge.tick < builtAt + pause) waiting = 'pause';
  const goal: AiGoal = { building, waiting };
  if (waiting) return { proposals, memory: { goal, search: null, builtAt, noRoom } };

  const from = memory.search?.building === building ? memory.search.next : 0;
  const search = siteFor(input, building, from);
  if (search.kind === 'more') {
    const resume = { building, next: search.next };
    return { proposals, memory: { goal, search: resume, builtAt, noRoom } };
  }
  if (search.kind === 'none') {
    const retry = knowledge.tick + AI_RULES.retrySeconds * SIMULATION_TICK_RATE;
    return { ...idle, memory: { ...idle.memory, noRoom: { ...noRoom, [building]: retry } } };
  }
  spend(input.budget, BUILDINGS[building].cost);
  proposals.push({ command: search.spot, note: `build ${nameOf(building)}` });
  return {
    proposals,
    memory: { goal, search: null, builtAt: house ? builtAt : knowledge.tick, noRoom },
  };
}
