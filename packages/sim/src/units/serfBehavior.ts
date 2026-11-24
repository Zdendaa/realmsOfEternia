import { distanceToFootprint, type EntityId } from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import type { EconomyDraft } from '../economy/draft.js';
import { cellCenter, isWalkable, nearestWalkableCell } from '../nav/navGrid.js';
import { toPlacedFootprint, type BuildingInstance } from '../state/gameState.js';
import { IDLE, type UnitInstance } from '../state/units.js';
import { materialsInTransit } from '../construction/delivery.js';
import { isBuilding, updateBuilder, updateDeliverer } from './building.js';
import { updateGatherer } from './gathering.js';
import { assignToSlot, freeSlots, moveTo } from './orders.js';

export const SERF_RULES = {
  /** Idle serfs take construction sites within this distance on their own. */
  autoAssignRadius: 30,
  /** Idle serfs look for work once per this many ticks (staggered by unit id). */
  lookForWorkEvery: 10,
} as const;

/**
 * Decides tasks and activities for every serf (state order): builders fetch missing
 * material and build while their site exists, gatherers run their loop, finished moves
 * become idle, and idle serfs pick up nearby construction sites. Mutates the given
 * working copies and the economy draft.
 */
export function updateSerfs(
  ctx: SimContext,
  tick: number,
  buildings: readonly BuildingInstance[],
  units: UnitInstance[],
  economy: EconomyDraft,
): void {
  const byId = new Map<EntityId, BuildingInstance>(buildings.map((b) => [b.id, b]));
  const transit = materialsInTransit(units);
  for (const unit of units) {
    if (unit.type !== 'serf') continue;
    const task = unit.task;
    if (task.kind === 'build') {
      updateBuilder(unit, byId.get(task.siteId), buildings, economy, transit);
    } else if (task.kind === 'deliver') {
      updateDeliverer(unit, byId.get(task.siteId), buildings, economy);
    } else if (task.kind === 'gather') {
      updateGatherer(unit, buildings, economy);
    } else if (task.kind === 'move' && !unit.movement) {
      unit.task = IDLE;
    }

    if (unit.task.kind === 'idle' && !unit.movement) {
      if (!isWalkable(ctx.nav, unit.x, unit.z)) {
        // A site was placed on top of this serf: step out of it.
        const cell = nearestWalkableCell(ctx.nav, unit.x, unit.z);
        if (cell >= 0) unit.movement = moveTo(cellCenter(ctx.nav, cell));
      } else if ((tick + unit.id) % SERF_RULES.lookForWorkEvery === 0) {
        lookForWork(unit, buildings, units);
      }
    }
    unit.activity = activityOf(unit, byId, economy);
  }
}

/** Builders only work while delivered material leaves work to do; otherwise they wait. */
function activityOf(
  unit: UnitInstance,
  byId: ReadonlyMap<EntityId, BuildingInstance>,
  economy: EconomyDraft,
): UnitInstance['activity'] {
  if (unit.movement) return 'walking';
  const { task } = unit;
  if (task.kind === 'build') {
    return isBuilding(unit, byId.get(task.siteId), economy) ? 'working' : 'idle';
  }
  return task.kind === 'gather' && task.phase === 'working' ? 'working' : 'idle';
}

/** Assigns `serf` to the nearest own site with a free slot within the auto-assign radius. */
function lookForWork(
  serf: UnitInstance,
  buildings: readonly BuildingInstance[],
  units: readonly UnitInstance[],
): void {
  let best: { site: BuildingInstance; slot: number; distance: number } | null = null;
  for (const site of buildings) {
    if (site.status !== 'construction' || site.ownerId !== serf.ownerId) continue;
    const distance = distanceToFootprint(toPlacedFootprint(site), serf.x, serf.z);
    if (distance > SERF_RULES.autoAssignRadius) continue;
    if (best && distance >= best.distance) continue;
    const slot = freeSlots(site, units)[0];
    if (slot !== undefined) best = { site, slot, distance };
  }
  if (!best) return;
  const assigned = assignToSlot(serf, best.site, best.slot, false);
  serf.task = assigned.task;
  serf.movement = assigned.movement;
}
