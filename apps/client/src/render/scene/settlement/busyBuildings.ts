import type { EntityId } from '@roe/shared';
import type { UnitInstance } from '@roe/sim';

const cache = new WeakMap<readonly UnitInstance[], ReadonlySet<EntityId>>();

/**
 * Buildings whose worker is processing right now (the mill turns, the bakery smokes).
 * Derived from the units array and cached per array, so per-frame readers pay once per
 * tick.
 */
export function busyBuildings(units: readonly UnitInstance[]): ReadonlySet<EntityId> {
  let busy = cache.get(units);
  if (!busy) {
    const set = new Set<EntityId>();
    for (const u of units) {
      if (u.task.kind === 'work' && u.task.phase === 'processing') set.add(u.task.buildingId);
    }
    busy = set;
    cache.set(units, busy);
  }
  return busy;
}
