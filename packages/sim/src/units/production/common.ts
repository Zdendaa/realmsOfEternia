import { distanceToFootprint, entrancePoint, type Vec2 } from '@roe/shared';
import { deposit, type EconomyDraft } from '../../economy/draft.js';
import { toPlacedFootprint, type BuildingInstance } from '../../state/gameState.js';
import type { UnitInstance, WorkPhase, WorkTask } from '../../state/units.js';
import { nearestStorage, storageDoor, STORAGE_RULES } from '../gathering.js';
import { moveTo } from '../orders.js';

export const WORKER_RULES = {
  /** A waiting worker looks for something to do once per this many ticks (staggered). */
  lookForNodeEvery: 20,
  /** Workers walk to and from this point in front of their building's entrance. */
  doorOffset: 1.5,
} as const;

/** The point in front of a production building's entrance. */
export const workerDoor = (building: BuildingInstance): Vec2 =>
  entrancePoint(toPlacedFootprint(building), WORKER_RULES.doorOffset);

/** True when `unit` stands at `building` (within the storage deposit reach). */
export const isNear = (building: BuildingInstance, unit: UnitInstance) =>
  distanceToFootprint(toPlacedFootprint(building), unit.x, unit.z) <= STORAGE_RULES.depositReach;

/** True on the (staggered) ticks a waiting worker looks for something to do. */
export const isLookTick = (tick: number, unit: UnitInstance) =>
  (tick + unit.id) % WORKER_RULES.lookForNodeEvery === 0;

/** Moves the worker to `phase` with fresh progress. */
export function setPhase(
  unit: UnitInstance,
  task: WorkTask,
  phase: WorkPhase,
  target = task.target,
) {
  unit.task = { ...task, phase, target, progress: 0 };
}

/** Carries the goods to the nearest storage (or waits with them if there is none). */
export function goToStorage(
  unit: UnitInstance,
  task: WorkTask,
  buildings: readonly BuildingInstance[],
): void {
  const storage = nearestStorage(buildings, unit.ownerId, unit);
  setPhase(unit, task, storage ? 'toStorage' : 'waiting');
  unit.movement = storage ? moveTo(storageDoor(storage)) : null;
}

/**
 * Arrived with goods at a storage: hands them in and returns true. Returns false (and
 * waits, keeping the goods) when the route ended short of the storage.
 */
export function depositAtStorage(
  unit: UnitInstance,
  task: WorkTask,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): boolean {
  const storage = nearestStorage(buildings, unit.ownerId, unit);
  if (!storage || !isNear(storage, unit)) {
    setPhase(unit, task, 'waiting'); // try again later
    return false;
  }
  if (unit.carrying && unit.ownerId !== null) deposit(economy, unit.ownerId, unit.carrying);
  unit.carrying = null;
  return true;
}
