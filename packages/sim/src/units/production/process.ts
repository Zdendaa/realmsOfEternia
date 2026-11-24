import { PROFESSIONS, type ProcessProduction } from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import { deposit, withdraw, type EconomyDraft } from '../../economy/draft.js';
import type { BuildingInstance } from '../../state/gameState.js';
import type { UnitInstance, WorkTask } from '../../state/units.js';
import { nearestStorage, storageDoor } from '../gathering.js';
import { moveTo } from '../orders.js';
import {
  depositAtStorage,
  goToStorage,
  isLookTick,
  isNear,
  setPhase,
  workerDoor,
} from './common.js';

/** Most process steps per trip: the input and the output of each must fit the load. */
export function stepsPerTrip(production: ProcessProduction): number {
  const capacity = PROFESSIONS[production.profession].carryCapacity;
  const perStep = Math.max(production.input.amount, production.output.amount);
  return Math.max(1, Math.floor(capacity / perStep));
}

/** Waits for input; walks back to the building first if it is elsewhere. */
function waitAtBuilding(unit: UnitInstance, task: WorkTask, building: BuildingInstance) {
  setPhase(unit, task, 'waiting', -1);
  unit.movement = isNear(building, unit) ? null : moveTo(workerDoor(building));
}

/**
 * Starts the next trip if the owner's stock holds input: takes it out of the stock right
 * away (so no other worker counts on it) and fetches it from the nearest storage, or, when
 * already standing there, picks it up and heads for the building. Otherwise waits.
 */
function startTrip(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  production: ProcessProduction,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  const storage = nearestStorage(buildings, unit.ownerId, unit);
  const owner = unit.ownerId;
  const { input } = production;
  const inStock = owner !== null ? (economy.stocks[owner]?.[input.resource] ?? 0) : 0;
  const steps = Math.min(stepsPerTrip(production), Math.floor(inStock / input.amount));
  if (!storage || owner === null || steps === 0) return waitAtBuilding(unit, task, building);

  withdraw(economy, owner, input.resource, input.amount * steps);
  if (isNear(storage, unit)) {
    unit.carrying = { resource: input.resource, amount: input.amount * steps };
    setPhase(unit, task, 'toBuilding', steps);
    unit.movement = moveTo(workerDoor(building));
    return;
  }
  setPhase(unit, task, 'fetching', steps);
  unit.movement = moveTo(storageDoor(storage));
}

/**
 * One tick of a processing worker (mill, bakery): wait until the stock holds input →
 * fetch it from storage (taken from the stock as they set off) → work on it at the
 * building → carry the output to storage → start the next trip right there. `target` is
 * the number of steps of the current trip. A fetch that can't reach the storage puts the
 * input back into the stock; input that can't reach the building is carried back to
 * storage, so goods are never lost or counted twice.
 */
export function updateProcessor(
  unit: UnitInstance,
  task: WorkTask,
  building: BuildingInstance,
  production: ProcessProduction,
  tick: number,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  if (unit.movement) return;

  switch (task.phase) {
    case 'waiting': {
      if (!isLookTick(tick, unit)) return;
      if (unit.carrying) goToStorage(unit, task, buildings);
      else startTrip(unit, task, building, production, buildings, economy);
      return;
    }
    case 'fetching': {
      const storage = nearestStorage(buildings, unit.ownerId, unit);
      const { input } = production;
      const amount = input.amount * task.target;
      if (!storage || !isNear(storage, unit)) {
        // Couldn't get there: the reserved input goes back into the stock.
        if (unit.ownerId !== null)
          deposit(economy, unit.ownerId, { resource: input.resource, amount });
        setPhase(unit, task, 'waiting', -1);
        return;
      }
      unit.carrying = { resource: input.resource, amount };
      setPhase(unit, task, 'toBuilding');
      unit.movement = moveTo(workerDoor(building));
      return;
    }
    case 'toBuilding': {
      if (isNear(building, unit)) setPhase(unit, task, 'processing');
      else goToStorage(unit, task, buildings); // the input goes back to the stock
      return;
    }
    case 'processing': {
      const progress = task.progress + 1;
      if (progress < production.seconds * SIMULATION_TICK_RATE * task.target) {
        unit.task = { ...task, progress };
        return;
      }
      const { output } = production;
      unit.carrying = { resource: output.resource, amount: output.amount * task.target };
      goToStorage(unit, task, buildings);
      return;
    }
    case 'toStorage': {
      if (depositAtStorage(unit, task, buildings, economy)) {
        startTrip(unit, task, building, production, buildings, economy);
      }
      return;
    }
    default:
      // Not a processing phase (can't happen for this building): start over.
      setPhase(unit, task, 'waiting', -1);
  }
}
