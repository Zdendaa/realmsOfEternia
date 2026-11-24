import { BUILDINGS, RESOURCE_IDS, type ResourceCost, type ResourceId } from '@roe/game-data';
import type { EntityId } from '@roe/shared';
import type { BuildingInstance, ConstructionProgress } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';

/** Units of each resource a site needs delivered: its whole cost. */
export const requiredMaterials = (site: Pick<BuildingInstance, 'type'>): ResourceCost =>
  BUILDINGS[site.type].cost;

const total = (amounts: Readonly<Partial<Record<ResourceId, number>>>) =>
  RESOURCE_IDS.reduce((sum, id) => sum + (amounts[id] ?? 0), 0);

/**
 * Work the site may have done so far: the delivered share of its materials times the
 * work required (integers, rounded down). Sites without a cost aren't limited.
 */
export function allowedWork(
  site: Pick<BuildingInstance, 'type'>,
  progress: ConstructionProgress,
): number {
  const needed = total(requiredMaterials(site));
  if (needed === 0) return progress.workRequired;
  const delivered = Math.min(needed, total(progress.delivered));
  return Math.floor((progress.workRequired * delivered) / needed);
}

/** True while builders have delivered material left to work with. */
export const canWork = (site: Pick<BuildingInstance, 'type'>, progress: ConstructionProgress) =>
  progress.workDone < allowedWork(site, progress);

/** Units of material on their way to each site, by resource. */
export type InTransit = Map<EntityId, Partial<Record<ResourceId, number>>>;

/** Counts every fetch in progress (builders with a `deliver` task). */
export function materialsInTransit(units: readonly UnitInstance[]): InTransit {
  const transit: InTransit = new Map();
  for (const u of units)
    if (u.task.kind === 'deliver') addTransit(transit, u.task.siteId, u.task.resource);
  return transit;
}

export function addTransit(transit: InTransit, siteId: EntityId, resource: ResourceId): void {
  const site = transit.get(siteId) ?? {};
  site[resource] = (site[resource] ?? 0) + 1;
  transit.set(siteId, site);
}

/**
 * The first resource (display order) the site still needs that nobody is fetching yet,
 * or null when everything is delivered or on its way.
 */
export function missingMaterial(
  site: BuildingInstance,
  progress: ConstructionProgress,
  transit: InTransit,
): ResourceId | null {
  const required = requiredMaterials(site);
  const coming = transit.get(site.id) ?? {};
  for (const id of RESOURCE_IDS) {
    const short = (required[id] ?? 0) - (progress.delivered[id] ?? 0) - (coming[id] ?? 0);
    if (short > 0) return id;
  }
  return null;
}

/** True if the site still lacks delivered units of `resource`. */
export const needsMaterial = (
  site: BuildingInstance,
  progress: ConstructionProgress,
  resource: ResourceId,
) => (progress.delivered[resource] ?? 0) < (requiredMaterials(site)[resource] ?? 0);
