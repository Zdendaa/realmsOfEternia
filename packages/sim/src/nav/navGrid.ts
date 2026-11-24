import {
  distanceToFootprint,
  isInPlayableArea,
  type PlacedFootprint,
  type Vec2,
} from '@roe/shared';
import { PLACEMENT_RULES } from '../rules/placement.js';
import type { SimWorld } from '../world/createWorld.js';

/** Blocked by terrain, water or trees/rocks (never changes during a match). */
const STATIC = 1;
/** Blocked by a building or construction site. */
const BUILDING = 2;

export const NAV_RULES = {
  /** Side length of one navigation cell, in world units. */
  cellSize: 1,
  /** Extra clearance around obstacles: roughly a unit's radius. */
  clearance: 0.3,
  /** Height difference between neighbouring cells above which a cell is too steep. */
  maxStep: 0.9,
} as const;

/**
 * Walkability grid over the playable area. Derived data: rebuilt from the world and the
 * buildings in the state, never stored in `GameState` or sent over the network.
 * Cells are row-major: index = row * cols + col, row along +Z.
 */
export interface NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly originX: number;
  readonly originZ: number;
  /** Bit flags per cell (0 = walkable). */
  readonly flags: Uint8Array;
  /** Bumped whenever building cells change, so routes can be re-checked. */
  version: number;
}

export function createNavGrid(world: SimWorld): NavGrid {
  const size = world.map.size;
  const cols = Math.ceil(size / NAV_RULES.cellSize);
  const rows = cols;
  const originX = -size / 2;
  const originZ = -size / 2;
  const flags = new Uint8Array(cols * rows);
  const grid: NavGrid = { cols, rows, originX, originZ, flags, version: 0 };

  const heights = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = cellCenterOf(grid, col, row);
      heights[row * cols + col] = world.heights.getHeightAt(c.x, c.z);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const c = cellCenterOf(grid, col, row);
      const h = heights[i] as number;
      let steep = false;
      if (col + 1 < cols) steep ||= Math.abs((heights[i + 1] as number) - h) > NAV_RULES.maxStep;
      if (row + 1 < rows) {
        steep ||= Math.abs((heights[i + cols] as number) - h) > NAV_RULES.maxStep;
      }
      if (col > 0) steep ||= Math.abs((heights[i - 1] as number) - h) > NAV_RULES.maxStep;
      if (row > 0) steep ||= Math.abs((heights[i - cols] as number) - h) > NAV_RULES.maxStep;
      if (steep || !isInPlayableArea(world.map, c.x, c.z) || world.water.isWater(c.x, c.z)) {
        flags[i] = STATIC;
      }
    }
  }

  for (const d of world.decorations) {
    const radius =
      (d.kind === 'tree' ? PLACEMENT_RULES.treeRadius : PLACEMENT_RULES.rockRadius) * d.scale +
      NAV_RULES.clearance;
    forEachCellNear(grid, d.x, d.z, radius, (i, c) => {
      if ((c.x - d.x) ** 2 + (c.z - d.z) ** 2 < radius * radius)
        flags[i] = (flags[i] ?? 0) | STATIC;
    });
    // The trunk's own cell is always blocked, even for small trees near a cell corner.
    const own = cellIndexAt(grid, d.x, d.z);
    if (own >= 0) flags[own] = (flags[own] ?? 0) | STATIC;
  }
  return grid;
}

/** Marks every building footprint as blocked, replacing the previous building layer. */
export function stampBuildings(grid: NavGrid, footprints: readonly PlacedFootprint[]): void {
  const { flags } = grid;
  for (let i = 0; i < flags.length; i++) flags[i] = (flags[i] as number) & ~BUILDING;
  for (const f of footprints) addBuilding(grid, f);
  grid.version++;
}

/** Marks one more footprint as blocked (incremental update when a site is placed). */
export function addBuilding(grid: NavGrid, area: PlacedFootprint): void {
  const reach = Math.hypot(area.footprint.w, area.footprint.d) / 2 + NAV_RULES.clearance;
  forEachCellNear(grid, area.x, area.z, reach, (i, c) => {
    if (distanceToFootprint(area, c.x, c.z, NAV_RULES.clearance) === 0) {
      grid.flags[i] = (grid.flags[i] as number) | BUILDING;
    }
  });
  grid.version++;
}

export function cellCenterOf(grid: NavGrid, col: number, row: number): Vec2 {
  return {
    x: grid.originX + (col + 0.5) * NAV_RULES.cellSize,
    z: grid.originZ + (row + 0.5) * NAV_RULES.cellSize,
  };
}

/** Cell index containing (x, z), or -1 outside the grid. */
export function cellIndexAt(grid: NavGrid, x: number, z: number): number {
  const col = Math.floor((x - grid.originX) / NAV_RULES.cellSize);
  const row = Math.floor((z - grid.originZ) / NAV_RULES.cellSize);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
  return row * grid.cols + col;
}

export function isWalkableCell(grid: NavGrid, index: number): boolean {
  return index >= 0 && grid.flags[index] === 0;
}

export function isWalkable(grid: NavGrid, x: number, z: number): boolean {
  return isWalkableCell(grid, cellIndexAt(grid, x, z));
}

/** Walkable cell nearest to (x, z) within `maxRadius` cells (ring search), or -1. */
export function nearestWalkableCell(grid: NavGrid, x: number, z: number, maxRadius = 12): number {
  const start = cellIndexAt(grid, x, z);
  if (isWalkableCell(grid, start)) return start;
  const col0 = Math.floor((x - grid.originX) / NAV_RULES.cellSize);
  const row0 = Math.floor((z - grid.originZ) / NAV_RULES.cellSize);
  for (let r = 1; r <= maxRadius; r++) {
    let best = -1;
    let bestDistance = Infinity;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
        const col = col0 + dc;
        const row = row0 + dr;
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
        const i = row * grid.cols + col;
        if (!isWalkableCell(grid, i)) continue;
        const c = cellCenterOf(grid, col, row);
        const distance = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

export function cellCenter(grid: NavGrid, index: number): Vec2 {
  return cellCenterOf(grid, index % grid.cols, Math.floor(index / grid.cols));
}

function forEachCellNear(
  grid: NavGrid,
  x: number,
  z: number,
  radius: number,
  visit: (index: number, center: Vec2) => void,
): void {
  const s = NAV_RULES.cellSize;
  const minCol = Math.max(0, Math.floor((x - radius - grid.originX) / s));
  const maxCol = Math.min(grid.cols - 1, Math.floor((x + radius - grid.originX) / s));
  const minRow = Math.max(0, Math.floor((z - radius - grid.originZ) / s));
  const maxRow = Math.min(grid.rows - 1, Math.floor((z + radius - grid.originZ) / s));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      visit(row * grid.cols + col, cellCenterOf(grid, col, row));
    }
  }
}
