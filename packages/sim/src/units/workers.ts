import { productionOf } from '@roe/game-data';
import type { EntityId, PlayerId } from '@roe/shared';
import type { EconomyDraft } from '../economy/draft.js';
import { housingCapacity, populationUsed } from '../economy/population.js';
import type { BuildingInstance } from '../state/gameState.js';
import { IDLE, type UnitInstance, type WorkPhase } from '../state/units.js';
import { workerDoor } from './production/common.js';
import { updateFarmer } from './production/farm.js';
import { updateHarvester } from './production/harvest.js';
import { updateProcessor } from './production/process.js';

export { WORKER_RULES } from './production/common.js';

/** A new worker for a just-completed production building, at its door. */
export function createWorker(building: BuildingInstance, id: EntityId): UnitInstance {
  const at = workerDoor(building);
  return {
    id,
    type: 'worker',
    ownerId: building.ownerId,
    x: at.x,
    z: at.z,
    task: { kind: 'work', buildingId: building.id, phase: 'waiting', target: -1, progress: 0 },
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

/** Phases in which a worker is visibly at work (animation and separation weight). */
const WORKING_PHASES: ReadonlySet<WorkPhase> = new Set([
  'working',
  'processing',
  'sowing',
  'harvesting',
]);

/**
 * One tick of every worker's loop (state order), by the kind of production of its
 * building: harvesting (`production/harvest.ts`), farming (`production/farm.ts`) or
 * processing (`production/process.ts`).
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
    const production =
      building && employsWorker(building) ? productionOf(building.type) : undefined;
    if (!building || !production) {
      unit.task = IDLE;
      unit.movement = null;
      unit.activity = 'idle';
      continue;
    }
    switch (production.kind) {
      case 'harvest':
        updateHarvester(unit, task, building, production, tick, buildings, economy);
        break;
      case 'farm':
        updateFarmer(unit, task, building, production, tick, buildings, economy);
        break;
      case 'process':
        updateProcessor(unit, task, building, production, tick, buildings, economy);
        break;
    }
    const phase = unit.task.kind === 'work' ? unit.task.phase : null;
    unit.activity = unit.movement
      ? 'walking'
      : phase && WORKING_PHASES.has(phase)
        ? 'working'
        : 'idle';
  }
}
