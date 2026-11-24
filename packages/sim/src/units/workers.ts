import { productionOf, RESOURCE_NODES } from '@roe/game-data';
import {
  distanceToFootprint,
  entrancePoint,
  SIMULATION_TICK_RATE,
  type EntityId,
  type PlayerId,
  type Vec2,
} from '@roe/shared';
import { deposit, remaining, take, type EconomyDraft } from '../economy/draft.js';
import { housingCapacity, populationUsed } from '../economy/population.js';
import { toPlacedFootprint, type BuildingInstance } from '../state/gameState.js';
import { gatherReach, nodeById, nodesNear } from '../state/resourceNodes.js';
import { IDLE, type UnitInstance, type WorkPhase, type WorkTask } from '../state/units.js';
import { nearestStorage, storageDoor, STORAGE_RULES } from './gathering.js';
import { moveTo } from './orders.js';

export const WORKER_RULES = {
  /** A worker with nothing to harvest looks again once per this many ticks (staggered). */
  lookForNodeEvery: 20,
  /** Workers walk to and from this point in front of their building's entrance. */
  doorOffset: 1.5,
} as const;

const door = (building: BuildingInstance): Vec2 =>
  entrancePoint(toPlacedFootprint(building), WORKER_RULES.doorOffset);

const near = (building: BuildingInstance, unit: UnitInstance) =>
  distanceToFootprint(toPlacedFootprint(building), unit.x, unit.z) <= STORAGE_RULES.depositReach;

/** A new worker for a just-completed production building, at its door. */
export function createWorker(building: BuildingInstance, id: EntityId): UnitInstance {
  const at = door(building);
  return {
    id,
    type: 'worker',
    ownerId: building.ownerId,
    x: at.x,
    z: at.z,
    task: { kind: 'work', buildingId: building.id, phase: 'waiting', nodeId: -1, progress: 0 },
    movement: null,
    activity: 'idle',
    carrying: null,
  };
}

/** True for complete, owned production buildings, which get one worker each. */
export const employsWorker = (building: BuildingInstance) =>
  building.status === 'complete' &&
  building.ownerId !== null &&
  productionOf(building.type) !== undefined;

/**
 * Gives every complete production building without a worker its worker, as long as the
 * owner has free housing; the others keep waiting and are checked again next tick.
 * Buildings are served in state (id) order, so the result is deterministic. New workers
 * are appended to `units`; returns the next free entity id.
 */
export function hireWorkers(
  buildings: readonly BuildingInstance[],
  units: UnitInstance[],
  nextEntityId: EntityId,
): EntityId {
  let employing = 0;
  for (const building of buildings) if (employsWorker(building)) employing++;
  if (employing === 0) return nextEntityId;
  const staffed = new Set<EntityId>();
  for (const u of units) {
    if (u.type === 'worker' && u.task.kind === 'work') staffed.add(u.task.buildingId);
  }
  // The usual tick: every production building already has its worker.
  if (staffed.size >= employing) return nextEntityId;

  const freeHousing = new Map<PlayerId, number>();
  let next = nextEntityId;
  for (const building of buildings) {
    if (!employsWorker(building) || staffed.has(building.id)) continue;
    const owner = building.ownerId as PlayerId; // employsWorker: owned
    const free =
      freeHousing.get(owner) ?? housingCapacity(buildings, owner) - populationUsed(units, owner);
    if (free <= 0) {
      freeHousing.set(owner, 0);
      continue;
    }
    units.push(createWorker(building, next++));
    freeHousing.set(owner, free - 1);
  }
  return next;
}

/** True when a complete production building still waits for its worker (no free housing). */
export const awaitsWorker = (building: BuildingInstance, units: readonly UnitInstance[]) =>
  employsWorker(building) &&
  !units.some(
    (u) => u.type === 'worker' && u.task.kind === 'work' && u.task.buildingId === building.id,
  );

const setPhase = (unit: UnitInstance, task: WorkTask, phase: WorkPhase, nodeId = task.nodeId) => {
  unit.task = { ...task, phase, nodeId, progress: 0 };
};

/** Walks to the node nearest the building with something left, or waits. */
function goToNextNode(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  economy: EconomyDraft,
) {
  const production = productionOf(building.type);
  const node = production
    ? nodesNear(economy.world, economy.nodes, production.node, building, production.workRadius)[0]
    : undefined;
  if (!node) {
    setPhase(unit, task, 'waiting', -1);
    unit.movement = null;
    return;
  }
  setPhase(unit, task, 'toNode', node.id);
  unit.movement = moveTo(node);
}

/** Carries the processed unit to the nearest storage (or waits with it if there is none). */
function goToStorage(unit: UnitInstance, task: WorkTask, buildings: readonly BuildingInstance[]) {
  const storage = nearestStorage(buildings, unit.ownerId, unit);
  setPhase(unit, task, storage ? 'toStorage' : 'waiting');
  unit.movement = storage ? moveTo(storageDoor(storage)) : null;
}

/**
 * One tick of every worker's loop (state order): harvest the node nearest its building →
 * back to the building → process → storage → deposit → next node. Each phase starts
 * walking right away; a route that ends short of its target falls back (a missed node or
 * storage means waiting and trying again later, a missed building skips processing).
 * Workers whose building is gone or no longer complete stand idle.
 */
export function updateWorkers(
  tick: number,
  buildings: readonly BuildingInstance[],
  units: UnitInstance[],
  economy: EconomyDraft,
): void {
  const byId = new Map(buildings.map((b) => [b.id, b]));
  for (const unit of units) {
    const task = unit.task;
    if (unit.type !== 'worker' || task.kind !== 'work') continue;
    const building = byId.get(task.buildingId);
    if (!building || !employsWorker(building)) {
      unit.task = IDLE;
      unit.movement = null;
      unit.activity = 'idle';
      continue;
    }
    updateWorker(unit, task, building, tick, buildings, economy);
    const phase = unit.task.kind === 'work' ? unit.task.phase : null;
    unit.activity = unit.movement
      ? 'walking'
      : phase === 'working' || phase === 'processing'
        ? 'working'
        : 'idle';
  }
}

function updateWorker(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  tick: number,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  const production = productionOf(building.type);
  if (!production) return;
  if (unit.movement) {
    // Someone else took the last unit while we were on our way: pick another node.
    if (task.phase === 'toNode' && remaining(economy, task.nodeId) <= 0) {
      goToNextNode(unit, task, building, economy);
    }
    return;
  }

  switch (task.phase) {
    case 'waiting': {
      if ((tick + unit.id) % WORKER_RULES.lookForNodeEvery !== 0) return;
      if (unit.carrying) goToStorage(unit, task, buildings);
      else goToNextNode(unit, task, building, economy);
      return;
    }
    case 'toNode': {
      const node = nodeById(economy.world, task.nodeId);
      if (!node || remaining(economy, node.id) <= 0)
        return goToNextNode(unit, task, building, economy);
      if (Math.hypot(unit.x - node.x, unit.z - node.z) <= gatherReach(node)) {
        setPhase(unit, task, 'working');
      } else {
        setPhase(unit, task, 'waiting', -1); // unreachable for now
      }
      return;
    }
    case 'working': {
      const node = nodeById(economy.world, task.nodeId);
      if (!node || remaining(economy, node.id) <= 0)
        return goToNextNode(unit, task, building, economy);
      const rule = RESOURCE_NODES[node.kind];
      const progress = task.progress + 1;
      if (progress < rule.workSeconds * SIMULATION_TICK_RATE) {
        unit.task = { ...task, progress };
        return;
      }
      take(economy, node.id);
      unit.carrying = { resource: rule.resource, amount: 1 };
      setPhase(unit, task, 'toBuilding');
      unit.movement = moveTo(door(building));
      return;
    }
    case 'toBuilding': {
      if (near(building, unit)) setPhase(unit, task, 'processing');
      else goToStorage(unit, task, buildings);
      return;
    }
    case 'processing': {
      const progress = task.progress + 1;
      if (progress < production.processSeconds * SIMULATION_TICK_RATE) {
        unit.task = { ...task, progress };
        return;
      }
      goToStorage(unit, task, buildings);
      return;
    }
    case 'toStorage': {
      const storage = nearestStorage(buildings, unit.ownerId, unit);
      if (!storage || !near(storage, unit)) {
        setPhase(unit, task, 'waiting'); // try again later, keeping the goods
        return;
      }
      if (unit.carrying && unit.ownerId !== null) deposit(economy, unit.ownerId, unit.carrying);
      unit.carrying = null;
      goToNextNode(unit, task, building, economy);
      return;
    }
  }
}
