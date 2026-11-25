import {
  distanceToFootprint,
  isInPlayableArea,
  type Decoration,
  type PlacedFootprint,
  type PlayerId,
  type Vec2,
} from '@roe/shared';
import { PLACEMENT_RULES } from '../rules/placement.js';
import type { SimWorld } from '../world/createWorld.js';

/** Blocked by terrain or water (never changes during a match). */
const STATIC = 1;
/** Blocked by a building or construction site. */
const BUILDING = 2;
/** Blocked by a tree or rock; cleared when the node is depleted. */
const DECORATION = 4;
/** Covered by a finished gate: open to its owner's units only (`gateOwners`). */
const GATE = 8;

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
  /** The owner of the gate on each `GATE` cell. */
  readonly gateOwners: Map<number, PlayerId>;
  /** Bumped whenever building or decoration cells change, so routes can be re-checked. */
  version: number;
}

/** What one building puts on the grid. */
export interface BuildingStamp {
  area: PlacedFootprint;
  /** Set for a finished gate: its owner's units may walk through. */
  gateOwner?: PlayerId;
}

/**
 * Builds the grid for `world`. Trees and rocks for which `isGone` returns true
 * (depleted resource nodes) don't block.
 */
export function createNavGrid(
  world: SimWorld,
  isGone: (id: number) => boolean = () => false,
): NavGrid {
  const size = world.map.size;
  const cols = Math.ceil(size / NAV_RULES.cellSize);
  const rows = cols;
  const originX = -size / 2;
  const originZ = -size / 2;
  const flags = new Uint8Array(cols * rows);
  const grid: NavGrid = {
    cols,
    rows,
    originX,
    originZ,
    flags,
    gateOwners: new Map(),
    version: 0,
  };

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

  for (const d of world.decorations) if (!isGone(d.id)) stampDecoration(grid, d);
  return grid;
}

/** Upper bound of `decorationReach` for any tree or rock on the maps (scale ≤ ~2.5). */
const MAX_DECORATION_REACH = 2.6;

const decorationReach = (d: Decoration) =>
  (d.kind === 'tree' ? PLACEMENT_RULES.treeRadius : PLACEMENT_RULES.rockRadius) * d.scale +
  NAV_RULES.clearance;

function stampDecoration(grid: NavGrid, d: Decoration): void {
  const radius = decorationReach(d);
  forEachCellNear(grid, d.x, d.z, radius, (i, c) => {
    if ((c.x - d.x) ** 2 + (c.z - d.z) ** 2 < radius * radius) {
      grid.flags[i] = (grid.flags[i] as number) | DECORATION;
    }
  });
  // The trunk's own cell is always blocked, even for small trees near a cell corner.
  const own = cellIndexAt(grid, d.x, d.z);
  if (own >= 0) grid.flags[own] = (grid.flags[own] as number) | DECORATION;
}

/**
 * Unblocks the cells of a depleted tree or rock. Neighbouring nodes that overlap those
 * cells and are still there (`isGone` false) are stamped again.
 */
export function removeDecoration(
  grid: NavGrid,
  world: SimWorld,
  d: Decoration,
  isGone: (id: number) => boolean,
): void {
  const reach = decorationReach(d) + NAV_RULES.cellSize;
  forEachCellNear(grid, d.x, d.z, reach, (i) => {
    grid.flags[i] = (grid.flags[i] as number) & ~DECORATION;
  });
  // Any node whose blocked circle could reach the cleared cells (big rocks: ~2 units).
  const near = reach + MAX_DECORATION_REACH;
  for (const other of world.obstacleIndex.query({
    minX: d.x - near,
    maxX: d.x + near,
    minZ: d.z - near,
    maxZ: d.z + near,
  })) {
    if (other.id !== d.id && !isGone(other.id)) stampDecoration(grid, other);
  }
  grid.version++;
}

/** Marks every building footprint, replacing the previous building layer. */
export function stampBuildings(grid: NavGrid, stamps: readonly BuildingStamp[]): void {
  const { flags } = grid;
  for (let i = 0; i < flags.length; i++) flags[i] = (flags[i] as number) & ~(BUILDING | GATE);
  grid.gateOwners.clear();
  for (const stamp of stamps) addBuilding(grid, stamp);
  grid.version++;
}

/**
 * Marks one more footprint (incremental update when a site is placed). A cell that a gate
 * shares with anything solid, or with another player's gate, is blocked for everyone.
 */
export function addBuilding(grid: NavGrid, { area, gateOwner }: BuildingStamp): void {
  const reach = Math.hypot(area.footprint.w, area.footprint.d) / 2 + NAV_RULES.clearance;
  forEachCellNear(grid, area.x, area.z, reach, (i, c) => {
    if (distanceToFootprint(area, c.x, c.z, NAV_RULES.clearance) !== 0) return;
    let flag = BUILDING;
    if (gateOwner !== undefined) {
      const other = grid.gateOwners.get(i);
      if (other === undefined || other === gateOwner) {
        grid.gateOwners.set(i, gateOwner);
        flag = GATE;
      }
    }
    grid.flags[i] = (grid.flags[i] as number) | flag;
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

/**
 * Who is asking: a player's units also walk through that player's gates. Without one
 * (null), gates are closed.
 */
export type Passer = PlayerId | null;

export function isWalkableCell(grid: NavGrid, index: number, passer: Passer = null): boolean {
  if (index < 0) return false;
  const flags = grid.flags[index];
  return (
    flags === 0 || (flags === GATE && passer !== null && grid.gateOwners.get(index) === passer)
  );
}

export function isWalkable(grid: NavGrid, x: number, z: number, passer: Passer = null): boolean {
  return isWalkableCell(grid, cellIndexAt(grid, x, z), passer);
}

/** Walkable cell nearest to (x, z) within `maxRadius` cells (ring search), or -1. */
export function nearestWalkableCell(
  grid: NavGrid,
  x: number,
  z: number,
  passer: Passer = null,
  maxRadius = 12,
): number {
  const start = cellIndexAt(grid, x, z);
  if (isWalkableCell(grid, start, passer)) return start;
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
        if (!isWalkableCell(grid, i, passer)) continue;
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

/**
 * Where a unit sent to (x, z) actually ends up: the point itself when walkable,
 * otherwise the center of the nearest walkable cell (the same rule as `findPath`'s
 * goal), or null when nothing walkable is near.
 */
export function nearestWalkablePoint(
  grid: NavGrid,
  x: number,
  z: number,
  passer: Passer = null,
): Vec2 | null {
  if (isWalkable(grid, x, z, passer)) return { x, z };
  const cell = nearestWalkableCell(grid, x, z, passer);
  return cell < 0 ? null : cellCenter(grid, cell);
}
