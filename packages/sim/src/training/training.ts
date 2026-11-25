import { UNITS, type UnitDefinition, type UnitKind } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { housingCapacity, populationUsed } from '../economy/population.js';
import type { BuildingInstance } from '../state/gameState.js';
import { spawnPoint } from '../state/spawn.js';
import { createUnit, type UnitInstance } from '../state/units.js';

/** Most units one building can have queued (the one in training included). */
export const TRAINING_QUEUE_LIMIT = 5;

/**
 * A training building's queue. The first unit is in training and is ready on tick
 * `readyAt`; it leaves the building once its owner has free housing (until then the queue
 * waits). Costs were paid when each unit was queued. Changes only when a unit is queued,
 * cancelled or finished, never while one trains.
 */
export interface TrainingQueue {
  queue: readonly UnitKind[];
  readyAt: number;
}

/** `records` without the entry for `id` (a new object). */
export function withoutKey<T>(
  records: Readonly<Record<EntityId, T>>,
  id: EntityId,
): Record<EntityId, T> {
  return Object.fromEntries(Object.entries(records).filter(([key]) => Number(key) !== id));
}

/** Ticks one unit of `kind` takes to train (at least 1). */
export const trainTicks = (kind: UnitKind): number =>
  Math.max(1, Math.round(((UNITS[kind] as UnitDefinition).trainTime ?? 0) * SIMULATION_TICK_RATE));

/** `queue` with `kind` appended; a unit queued into an empty queue starts training now. */
export function enqueue(current: TrainingQueue | undefined, kind: UnitKind, tick: number) {
  if (!current || current.queue.length === 0) {
    return { queue: [kind], readyAt: tick + trainTicks(kind) };
  }
  return { queue: [...current.queue, kind], readyAt: current.readyAt };
}

/**
 * `queue` without the unit at `index`, or null when the queue is then empty. Cancelling
 * the unit in training starts the next one from scratch.
 */
export function dequeue(current: TrainingQueue, index: number, tick: number): TrainingQueue | null {
  const queue = current.queue.filter((_, i) => i !== index);
  const next = queue[0];
  if (next === undefined) return null;
  return { queue, readyAt: index === 0 ? tick + trainTicks(next) : current.readyAt };
}

/**
 * Finishes training where it is due: the unit appears in front of the building's
 * entrance if its owner has free housing (checked per owner, buildings in id order,
 * after this tick's workers were hired), and the next queued unit starts. Queues of
 * buildings that no longer stand complete are dropped. New units are appended to
 * `units`. Returns the training records (the same object when nothing changed) and the
 * next free entity id.
 */
export function progressTraining(
  buildings: readonly BuildingInstance[],
  training: Readonly<Record<EntityId, TrainingQueue>>,
  units: UnitInstance[],
  tick: number,
  nextEntityId: EntityId,
): {
  training: Readonly<Record<EntityId, TrainingQueue>>;
  nextEntityId: EntityId;
  /** The owner of each unit that came out this tick. */
  trained: PlayerId[];
} {
  const trained: PlayerId[] = [];
  const ids = Object.keys(training);
  if (ids.length === 0) return { training, nextEntityId, trained };
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const freeHousing = new Map<PlayerId, number>();
  const free = (owner: PlayerId) => {
    let value = freeHousing.get(owner);
    if (value === undefined) {
      value = housingCapacity(buildings, owner) - populationUsed(units, owner);
      freeHousing.set(owner, value);
    }
    return value;
  };

  let next = nextEntityId;
  // Copied on the first change, so an unchanged tick keeps the same object.
  const result: { records: Record<EntityId, TrainingQueue> | null } = { records: null };
  const update = (id: EntityId, value: TrainingQueue | null) => {
    const records = result.records ?? training;
    result.records = value ? { ...records, [id]: value } : withoutKey(records, id);
  };
  // Building ids in ascending order: the same order on every machine.
  for (const id of ids.map(Number).sort((a, b) => a - b)) {
    const current = training[id] as TrainingQueue;
    const building = byId.get(id);
    if (!building || building.status !== 'complete' || building.ownerId === null) {
      update(id, null);
      continue;
    }
    const kind = current.queue[0];
    if (kind === undefined || tick < current.readyAt) continue;
    const owner = building.ownerId;
    if (free(owner) <= 0) continue;
    freeHousing.set(owner, free(owner) - 1);
    units.push(createUnit(next, kind, owner, spawnPoint(building, next)));
    trained.push(owner);
    next++;
    update(id, dequeue(current, 0, tick));
  }
  return { training: result.records ?? training, nextEntityId: next, trained };
}

/** Ticks of training left for the unit in training, and the total (for progress bars). */
export function trainingProgress(queue: TrainingQueue, tick: number) {
  const kind = queue.queue[0];
  if (kind === undefined) return null;
  const total = trainTicks(kind);
  return { done: Math.min(total, Math.max(0, total - (queue.readyAt - tick))), total };
}
