import type { EntityId } from '@roe/shared';
import type { BuildingInstance, ConstructionProgress, GameState } from '../state/gameState.js';
import { allowedWork } from './delivery.js';
import type { UnitInstance } from '../state/units.js';

/**
 * Adds one tick of work from every serf working at a site (linear in the number of
 * builders; work slots cap it at `maxBuilders`), never beyond the delivered share of the
 * materials, and completes finished sites.
 * Returns the new buildings and construction records; unchanged ones keep their references.
 */
export function progressConstruction(
  state: Pick<GameState, 'buildings' | 'construction'>,
  units: readonly UnitInstance[],
): Pick<GameState, 'buildings' | 'construction'> {
  const workers = new Map<EntityId, number>();
  for (const u of units) {
    if (u.activity === 'working' && u.task.kind === 'build') {
      workers.set(u.task.siteId, (workers.get(u.task.siteId) ?? 0) + 1);
    }
  }
  if (workers.size === 0) return state;

  const types = new Map(state.buildings.map((b) => [b.id, b]));
  const construction: Record<EntityId, ConstructionProgress> = {};
  const finished = new Set<EntityId>();
  for (const [key, progress] of Object.entries(state.construction)) {
    const siteId = Number(key);
    const site = types.get(siteId);
    const limit = site ? allowedWork(site, progress) : progress.workRequired;
    const workDone = Math.max(
      progress.workDone,
      Math.min(limit, progress.workDone + (workers.get(siteId) ?? 0)),
    );
    if (workDone >= progress.workRequired) {
      finished.add(siteId);
    } else {
      construction[siteId] = workDone === progress.workDone ? progress : { ...progress, workDone };
    }
  }

  const buildings =
    finished.size === 0
      ? state.buildings
      : state.buildings.map((b): BuildingInstance =>
          finished.has(b.id) ? { ...b, status: 'complete' } : b,
        );
  return { buildings, construction };
}
