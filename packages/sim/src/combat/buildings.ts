import { buildingHealthOf, COMBAT_RULES, isWall } from '@roe/game-data';
import { distanceToFootprint, type EntityId, type Vec2 } from '@roe/shared';
import {
  toPlacedFootprint,
  type BuildingInstance,
  type ConstructionProgress,
  type GameState,
  type Ruin,
} from '../state/gameState.js';
import { IDLE, isAlive, type UnitInstance } from '../state/units.js';
import type { Hits } from './damage.js';
import { areEnemies } from './hostility.js';

/** How far beyond a building's edge a unit stands when it walks up to attack. */
const APPROACH_GAP = 0.6;

/**
 * Hit points of `building` now: all of its health when complete; a construction site
 * has `siteHealthShare` of it when started, growing with the work done.
 */
export function buildingMaxHealth(
  building: Pick<BuildingInstance, 'type' | 'status'>,
  progress: ConstructionProgress | undefined,
): number {
  const full = buildingHealthOf(building.type);
  if (building.status === 'complete' || !progress) return full;
  const share = COMBAT_RULES.siteHealthShare;
  const done = progress.workRequired > 0 ? progress.workDone / progress.workRequired : 0;
  return Math.max(1, Math.round(full * (share + (1 - share) * Math.min(1, done))));
}

/** Distance from a unit's edge to a building's footprint (0 or less when touching). */
export const buildingReach = (unit: Vec2, radius: number, building: BuildingInstance) =>
  distanceToFootprint(toPlacedFootprint(building), unit.x, unit.z) - radius;

/**
 * Where a unit walks to attack `building`: the point of its footprint nearest to the
 * unit, a little outside the edge (the path planner snaps a blocked goal to the nearest
 * walkable cell).
 */
export function approachPoint(unit: Vec2, building: BuildingInstance): Vec2 {
  const { w, d } = toPlacedFootprint(building).footprint;
  const cos = Math.cos(building.rotation);
  const sin = Math.sin(building.rotation);
  const dx = unit.x - building.x;
  const dz = unit.z - building.z;
  // Into the building's local frame (rotation about Y), clamp, and out again.
  const lx = cos * dx - sin * dz;
  const lz = sin * dx + cos * dz;
  const hx = w / 2 + APPROACH_GAP;
  const hz = d / 2 + APPROACH_GAP;
  let cx = Math.max(-hx, Math.min(hx, lx));
  let cz = Math.max(-hz, Math.min(hz, lz));
  if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) {
    // Inside (or on) the footprint: out through the nearest side.
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) cx = Math.sign(lx || 1) * hx;
    else cz = Math.sign(lz || 1) * hz;
  }
  return {
    x: building.x + cos * cx + sin * cz,
    z: building.z - sin * cx + cos * cz,
  };
}

/**
 * The nearest enemy building whose footprint lies within `sightRange` of `unit`, ties
 * by id; null when none. Units are preferred over buildings by the caller. Walls and
 * gates are never picked: they are attacked on order, or when they block the way.
 */
export function findBuildingTarget(
  unit: UnitInstance,
  buildings: readonly BuildingInstance[],
  sightRange: number,
): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDistance = Infinity;
  for (const building of buildings) {
    if (!areEnemies(unit.ownerId, building.ownerId) || isWall(building.type)) continue;
    const distance = distanceToFootprint(toPlacedFootprint(building), unit.x, unit.z);
    if (distance > sightRange) continue;
    if (distance < bestDistance || (distance === bestDistance && best && building.id < best.id)) {
      best = building;
      bestDistance = distance;
    }
  }
  return best;
}

export interface Destruction {
  buildings: readonly BuildingInstance[];
  construction: GameState['construction'];
  fields: GameState['fields'];
  buildingDamage: GameState['buildingDamage'];
  ruins: readonly Ruin[];
}

/**
 * Applies the tick's hits on buildings. A building whose damage reaches its health falls:
 * it leaves `buildings` (with its construction progress and field state), becomes a
 * ruin, and its worker dies with it (mutating the unit working copies). Returns the same
 * objects when no building was hit.
 */
export function applyBuildingHits(
  current: Destruction,
  units: UnitInstance[],
  hits: Hits,
  tick: number,
): Destruction {
  if (hits.size === 0) return current;
  let damage: Record<EntityId, number> | null = null;
  const fallen = new Set<EntityId>();
  for (const building of current.buildings) {
    const hit = hits.of(building.id);
    if (hit === 0) continue;
    damage ??= { ...current.buildingDamage };
    const taken = (damage[building.id] ?? 0) + hit;
    damage[building.id] = taken;
    if (taken >= buildingMaxHealth(building, current.construction[building.id])) {
      fallen.add(building.id);
    }
  }
  if (!damage) return current;
  if (fallen.size === 0) return { ...current, buildingDamage: damage };

  const keep = <T>(record: Readonly<Record<EntityId, T>>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => !fallen.has(Number(id))));
  for (const unit of units) {
    const task = unit.task;
    if (task.kind === 'work' && fallen.has(task.buildingId) && isAlive(unit)) {
      // The worker was inside: lost with the building.
      unit.health = 0;
      unit.diedAt = tick;
      unit.task = IDLE;
      unit.movement = null;
      unit.activity = 'dying';
      unit.carrying = null;
    }
  }
  const ruins = current.buildings
    .filter((b) => fallen.has(b.id))
    .map((b): Ruin => ({
      id: b.id,
      type: b.type,
      x: b.x,
      z: b.z,
      rotation: b.rotation,
      ownerId: b.ownerId,
      destroyedAt: tick,
    }));
  return {
    buildings: current.buildings.filter((b) => !fallen.has(b.id)),
    construction: keep(current.construction),
    fields: keep(current.fields),
    buildingDamage: keep(damage),
    ruins: [...current.ruins, ...ruins],
  };
}
