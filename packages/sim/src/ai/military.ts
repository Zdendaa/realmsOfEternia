import {
  AI_RULES,
  attackOf,
  BUILDINGS,
  depositOf,
  isWall,
  RESOURCE_IDS,
  towerOf,
  trainsOf,
  UNITS,
  upgradesOf,
  type ResourceCost,
  type SoldierKind,
  type UnitKind,
} from '@roe/game-data';
import type { BuildingInstance } from '../state/gameState.js';
import { affords, spend } from './budget.js';
import type { AiProposal, ManagerInput } from './manager.js';
import { isSoldier, within } from './strength.js';

/** What it counts its soldiers by: foot soldiers and siege engines, queued ones too. */
function armyCounts({ knowledge }: ManagerInput): Map<UnitKind, number> {
  const counts = new Map<UnitKind, number>();
  const add = (kind: UnitKind) => counts.set(kind, (counts.get(kind) ?? 0) + 1);
  for (const unit of knowledge.units) if (isSoldier(unit) && !unit.hero) add(unit.type);
  for (const queue of Object.values(knowledge.training)) queue.queue.forEach(add);
  return counts;
}

/**
 * The personality's weights for foot soldiers; one that counters what it sees trains
 * twice the swordsmen against infantry and monsters, and twice the spearmen (who break
 * buildings) against walls and towers.
 */
function weights(input: ManagerInput): Record<SoldierKind, number> {
  const { personality, difficulty, knowledge, memory } = input;
  const result = { ...personality.army };
  if (!difficulty.countersEnemy) return result;
  const seen = knowledge.enemyUnits;
  const infantry = seen.filter((u) => {
    const armor = UNITS[u.type].combat.armorClass;
    return armor === 'infantry' || armor === 'siege';
  });
  if (seen.length > 0 && infantry.length * 2 >= seen.length) result.swordsman *= 2;
  if (memory.sightings.some((s) => isWall(s.type) || towerOf(s.type))) result.spearman *= 2;
  return result;
}

/** What the goal of its build order costs: training leaves that in the stock. */
const savedFor = ({ memory }: ManagerInput): ResourceCost =>
  memory.goal ? BUILDINGS[memory.goal.building].cost : {};

/** Whether the budget pays for \`cost\` on top of what is being saved up or held back. */
function sparing(input: ManagerInput, cost: ResourceCost): boolean {
  const held = savedFor(input);
  const miners = input.knowledge.buildings.some((b) => depositOf(b.type) !== undefined);
  const food = AI_RULES.trainFoodReserve + (miners ? AI_RULES.mineFoodReserve : 0);
  return RESOURCE_IDS.every((id) => {
    const needed = cost[id] ?? 0;
    if (needed === 0) return true;
    const reserve = (held[id] ?? 0) + (id === 'food' ? food : 0);
    return input.budget[id] - needed >= reserve;
  });
}

/**
 * Fills its training queues: the kind furthest below its share among those it can pay
 * for, and siege engines (up to the personality's) once it knows of an enemy base.
 */
function training(input: ManagerInput): AiProposal[] {
  const { knowledge, personality, difficulty, memory } = input;
  const counts = armyCounts(input);
  let total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const share = weights(input);
  const trainers = knowledge.buildings.filter(
    (b) => b.status === 'complete' && trainsOf(b.type).length > 0,
  );
  return trainers.flatMap((building): AiProposal[] => {
    const queued = knowledge.training[building.id]?.queue.length ?? 0;
    if (queued >= difficulty.queuePerBuilding || total >= difficulty.maxSoldiers) return [];
    /** How far a kind is below its share: lower is more wanted; null: not wanted. */
    const filled = (kind: UnitKind): number | null => {
      const have = counts.get(kind) ?? 0;
      if (attackOf(kind)?.siege) {
        const limit = (personality.siege as Partial<Record<UnitKind, number>>)[kind] ?? 0;
        return memory.sightings.length > 0 && have < limit ? have / limit : null;
      }
      const weight = (share as Partial<Record<UnitKind, number>>)[kind] ?? 0;
      return weight > 0 ? (have + 1) / weight : null;
    };
    let best: { kind: UnitKind; level: number } | null = null;
    for (const kind of trainsOf(building.type)) {
      const level = filled(kind);
      if (level === null || !sparing(input, UNITS[kind].cost)) continue;
      if (!best || level < best.level) best = { kind, level };
    }
    if (!best) return [];
    spend(input.budget, UNITS[best.kind].cost);
    counts.set(best.kind, (counts.get(best.kind) ?? 0) + 1);
    total++;
    return [
      {
        command: { type: 'trainUnit', buildingId: building.id, unit: best.kind },
        note: `train ${UNITS[best.kind].name.toLowerCase()}`,
      },
    ];
  });
}

/** Upgrades one of its wooden towers (or whatever leads there) when it can spare it. */
function upgrades(input: ManagerInput): AiProposal[] {
  const { knowledge, personality } = input;
  const to = personality.towerUpgrade;
  if (!to) return [];
  const calm = (tower: BuildingInstance) =>
    !knowledge.enemyUnits.some((u) => within(u, tower, AI_RULES.defendRadius));
  const tower = knowledge.buildings.find(
    (b) =>
      b.status === 'complete' &&
      upgradesOf(b.type).includes(to) &&
      !knowledge.upgrades[b.id] &&
      calm(b),
  );
  const cost: ResourceCost = BUILDINGS[to].cost;
  if (!tower || !affords(input.budget, cost) || !sparing(input, cost)) return [];
  spend(input.budget, cost);
  return [
    {
      command: { type: 'upgradeTower', buildingId: tower.id, to },
      note: `upgrade tower to ${BUILDINGS[to].name.toLowerCase()}`,
    },
  ];
}

/** The military manager: what to train, and tower upgrades. */
export const manageMilitary = (input: ManagerInput): AiProposal[] => [
  ...training(input),
  ...upgrades(input),
];
