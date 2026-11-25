import { createPointGrid, type PointGrid } from '../spatial/pointGrid.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { areEnemies } from './hostility.js';

/** Cell size of the per-tick unit grid; about a typical sight range. */
const GRID_CELL = 8;

/** Living units by position, rebuilt once per tick when anyone fights. */
export type UnitGrid = PointGrid<UnitInstance>;

export const createUnitGrid = (units: readonly UnitInstance[]): UnitGrid =>
  createPointGrid(units.filter(isAlive), GRID_CELL);

/** Distance between two units' edges (negative when they overlap). */
export function edgeDistance(
  a: Pick<UnitInstance, 'x' | 'z'>,
  aRadius: number,
  b: Pick<UnitInstance, 'x' | 'z'>,
  bRadius: number,
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2) - aRadius - bRadius;
}

/**
 * The enemy `unit` engages on its own within `sightRange` (center to center): first
 * enemies already attacking it, then the nearest; ties by id, so the choice is the same
 * on every machine. Null when no enemy is in sight.
 */
export function findTarget(
  unit: UnitInstance,
  grid: UnitGrid,
  sightRange: number,
): UnitInstance | null {
  const candidates = grid.query({
    minX: unit.x - sightRange,
    maxX: unit.x + sightRange,
    minZ: unit.z - sightRange,
    maxZ: unit.z + sightRange,
  });
  const maxSq = sightRange * sightRange;
  let best: UnitInstance | null = null;
  let bestAttacking = false;
  let bestSq = Infinity;
  for (const other of candidates) {
    if (!isAlive(other) || !areEnemies(unit.ownerId, other.ownerId)) continue;
    const sq = (other.x - unit.x) ** 2 + (other.z - unit.z) ** 2;
    if (sq > maxSq) continue;
    const attacking = other.combat?.targetId === unit.id;
    const better =
      best === null ||
      (attacking && !bestAttacking) ||
      (attacking === bestAttacking && (sq < bestSq || (sq === bestSq && other.id < best.id)));
    if (better) {
      best = other;
      bestAttacking = attacking;
      bestSq = sq;
    }
  }
  return best;
}
