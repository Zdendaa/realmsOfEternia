import type { EntityId, Vec2 } from '@roe/shared';
import { workSlots } from '../construction/workSlots.js';
import type { BuildingInstance } from '../state/gameState.js';
import type { UnitInstance, UnitMovement } from '../state/units.js';

/** Distance between neighbouring goals when a group is sent to one point. */
const FORMATION_SPACING = 1.1;

/** A fresh movement toward `goal`; the path planner fills in the waypoints. */
export function moveTo(goal: Vec2): UnitMovement {
  return {
    goal: { x: goal.x, z: goal.z },
    waypoints: null,
    next: 0,
    stuckTicks: 0,
    bestDistance: Infinity,
    replans: 0,
  };
}

/**
 * Offsets for `count` units sent to one point: grid points spiralling outward from the
 * center, nearest first (ties by angle order), so the group spreads into a blob.
 */
export function formationOffsets(count: number): Vec2[] {
  const points: { x: number; z: number; d: number; order: number }[] = [];
  const radius = Math.ceil(Math.sqrt(count)) + 1;
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      points.push({ x: i, z: j, d: i * i + j * j, order: points.length });
    }
  }
  points.sort((a, b) => a.d - b.d || a.order - b.order);
  return points
    .slice(0, count)
    .map((p) => ({ x: p.x * FORMATION_SPACING, z: p.z * FORMATION_SPACING }));
}

const distanceSq = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Units sorted by distance to a point, ties by id (deterministic). */
export function byDistanceTo<T extends UnitInstance>(units: readonly T[], target: Vec2): T[] {
  return [...units].sort((a, b) => distanceSq(a, target) - distanceSq(b, target) || a.id - b.id);
}

/**
 * Work slots of a building that no unit has claimed yet: builders (also while fetching
 * material) and repairers keep theirs.
 */
export function freeSlots(site: BuildingInstance, units: readonly UnitInstance[]): number[] {
  const taken = new Set<number>();
  for (const u of units) {
    const t = u.task;
    if ((t.kind === 'build' || t.kind === 'deliver') && t.siteId === site.id) taken.add(t.slot);
    if (t.kind === 'repair' && t.buildingId === site.id) taken.add(t.slot);
  }
  return workSlots(site)
    .map((_, slot) => slot)
    .filter((slot) => !taken.has(slot));
}

/** Gives `unit` the build task for `slot` and starts walking there. */
export function assignToSlot(
  unit: UnitInstance,
  site: BuildingInstance,
  slot: number,
  manual: boolean,
): UnitInstance {
  const goal = workSlots(site)[slot] as Vec2;
  return {
    ...unit,
    task: { kind: 'build', siteId: site.id, slot, manual },
    movement: moveTo(goal),
  };
}

/** Gives `unit` the repair task for `slot` and starts walking there. */
export function assignToRepair(
  unit: UnitInstance,
  building: BuildingInstance,
  slot: number,
): UnitInstance {
  const goal = workSlots(building)[slot] as Vec2;
  return {
    ...unit,
    task: { kind: 'repair', buildingId: building.id, slot },
    movement: moveTo(goal),
  };
}

/** Replaces the units whose ids appear in `changed`, keeping array order. */
export function replaceUnits(
  units: readonly UnitInstance[],
  changed: ReadonlyMap<EntityId, UnitInstance>,
): UnitInstance[] {
  return units.map((u) => changed.get(u.id) ?? u);
}
