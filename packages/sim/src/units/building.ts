import { distanceToFootprint, type Vec2 } from '@roe/shared';
import {
  addTransit,
  canWork,
  missingMaterial,
  needsMaterial,
  type InTransit,
} from '../construction/delivery.js';
import { workSlots } from '../construction/workSlots.js';
import { deliverToSite, deposit, type EconomyDraft } from '../economy/draft.js';
import { toPlacedFootprint, type BuildingInstance } from '../state/gameState.js';
import { IDLE, type UnitInstance } from '../state/units.js';
import { nearestStorage, storageDoor, STORAGE_RULES } from './gathering.js';
import { moveTo } from './orders.js';

export const BUILD_RULES = {
  /** A builder counts as at the site within this distance of the footprint. */
  workReach: 2.2,
} as const;

const slotPoint = (site: BuildingInstance, slot: number): Vec2 =>
  workSlots(site)[slot] ?? { x: site.x, z: site.z };

const atSite = (site: BuildingInstance, unit: UnitInstance) =>
  distanceToFootprint(toPlacedFootprint(site), unit.x, unit.z) <= BUILD_RULES.workReach;

/** Hands in material the unit carries for this site, if the site still needs it. */
function handIn(unit: UnitInstance, site: BuildingInstance, economy: EconomyDraft): void {
  const cargo = unit.carrying;
  if (cargo?.siteId !== site.id) return;
  const progress = economy.construction[site.id];
  if (progress && needsMaterial(site, progress, cargo.resource)) {
    deliverToSite(economy, site.id, cargo.resource);
  }
  // Surplus reserved material simply returns to the site's reserve.
  unit.carrying = null;
}

/** Starts fetching the site's next missing unit, if any and a storage exists. */
function startFetching(
  unit: UnitInstance,
  site: BuildingInstance,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
  transit: InTransit,
): boolean {
  const task = unit.task;
  const progress = economy.construction[site.id];
  if (task.kind !== 'build' || !progress) return false;
  const missing = missingMaterial(site, progress, transit);
  if (!missing) return false;
  const storage = nearestStorage(buildings, unit.ownerId, unit);
  if (!storage) return false;
  addTransit(transit, site.id, missing);
  unit.task = {
    kind: 'deliver',
    siteId: site.id,
    slot: task.slot,
    manual: task.manual,
    resource: missing,
    phase: 'toStorage',
  };
  unit.movement = moveTo(storageDoor(storage));
  return true;
}

/**
 * A builder of a site: fetches the next missing unit if nobody is fetching it yet (also
 * on the way to the site, so it doesn't walk there first; unless it brings material for
 * this site), hands in reserved material at its slot, and builds otherwise; the work
 * waits for deliveries (`activityOf` decides whether there is work to do).
 */
export function updateBuilder(
  unit: UnitInstance,
  site: BuildingInstance | undefined,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
  transit: InTransit,
): void {
  if (unit.task.kind !== 'build') return;
  if (site?.status !== 'construction') {
    unit.task = IDLE;
    unit.movement = null;
    return;
  }
  const bringsMaterial = unit.carrying?.siteId === site.id;
  if (!bringsMaterial && startFetching(unit, site, buildings, economy, transit)) return;
  if (unit.movement) return;
  if (!atSite(site, unit)) {
    // The route ended as close as the ground allows, but too far to work.
    unit.task = IDLE;
    return;
  }
  handIn(unit, site, economy);
  startFetching(unit, site, buildings, economy, transit);
}

/**
 * A builder fetching one unit: at the storage it hands in anything else it carries and
 * picks up the material (reserved for the site), then walks back to its slot, delivers
 * and builds again. A route that ends short of its target makes it give up.
 */
export function updateDeliverer(
  unit: UnitInstance,
  site: BuildingInstance | undefined,
  buildings: readonly BuildingInstance[],
  economy: EconomyDraft,
): void {
  const task = unit.task;
  if (task.kind !== 'deliver') return;
  if (site?.status !== 'construction') {
    unit.task = IDLE; // keeps anything it carries
    unit.movement = null;
    return;
  }
  if (unit.movement) return;

  if (task.phase === 'toStorage') {
    const storage = nearestStorage(buildings, unit.ownerId, unit);
    const reach = storage
      ? distanceToFootprint(toPlacedFootprint(storage), unit.x, unit.z)
      : Infinity;
    if (reach > STORAGE_RULES.depositReach) {
      unit.task = IDLE;
      return;
    }
    if (unit.carrying && unit.ownerId !== null) deposit(economy, unit.ownerId, unit.carrying);
    unit.carrying = { resource: task.resource, amount: 1, siteId: site.id };
    unit.task = { ...task, phase: 'toSite' };
    unit.movement = moveTo(slotPoint(site, task.slot));
    return;
  }

  if (!atSite(site, unit)) {
    unit.task = IDLE;
    return;
  }
  handIn(unit, site, economy);
  unit.task = { kind: 'build', siteId: site.id, slot: task.slot, manual: task.manual };
}

/** True when a builder stands at its site and delivered material leaves work to do. */
export function isBuilding(
  unit: UnitInstance,
  site: BuildingInstance | undefined,
  economy: EconomyDraft,
): boolean {
  if (unit.task.kind !== 'build' || unit.movement || !site) return false;
  const progress = economy.construction[site.id];
  return progress !== undefined && canWork(site, progress);
}
