import type { EntityId, Vec2 } from '@roe/shared';
import {
  breachableCell,
  cellCenter,
  cellIndexAt,
  isWalkableCell,
  nearestWalkableCell,
  type NavGrid,
  type Passer,
} from './navGrid.js';
import { smoothPath } from './smoothPath.js';

/** Integer step costs (×10) keep path costs exact and tie-breaking identical everywhere. */
const STRAIGHT = 10;
const DIAGONAL = 14;
/** Hard cap on expanded cells per search, so an unreachable goal can't stall a tick. */
const DEFAULT_MAX_EXPANSIONS = 30_000;

export interface PathOptions {
  /** Whose units walk the route: they may use that player's gates. */
  passer?: Passer;
  maxExpansions?: number;
  /**
   * Also plan through enemy walls, at their cells' cost, and report the first one the
   * route crosses (`PathResult.breach`).
   */
  breach?: boolean;
  /**
   * Search from the goal toward the start (the route comes out the same way round). Much
   * cheaper for a breach into a small enclosure: searched from outside, the whole map is
   * cheaper than the first wall cell and gets explored before it. A search that fails
   * this way returns no waypoints.
   */
  fromGoal?: boolean;
}

export interface PathResult {
  /** World-space waypoints from the first step to the goal (or the closest reachable point). */
  waypoints: Vec2[];
  /** False when the goal itself couldn't be reached and the route ends nearby instead. */
  reachedGoal: boolean;
  /** Cells expanded by the search (for measurements and tests). */
  expanded: number;
  /**
   * With `PathOptions.breach`: the wall segment to break first, or null when the route
   * crosses none. A route with a breach isn't walkable as it stands.
   */
  breach: EntityId | null;
}

/**
 * Reusable A* search on a nav grid. Buffers are allocated once per grid and reused via
 * generation stamps, so a search never clears or allocates per-cell arrays.
 */
export interface PathFinder {
  findPath(from: Vec2, to: Vec2, options?: PathOptions): PathResult;
}

export function createPathFinder(grid: NavGrid): PathFinder {
  const n = grid.cols * grid.rows;
  const g = new Int32Array(n);
  const parent = new Int32Array(n);
  const seen = new Uint32Array(n);
  const closed = new Uint32Array(n);
  const heap = new MinHeap(n);
  let generation = 0;
  /** Who the running search is for, and whether it may plan through enemy walls. */
  let passer: Passer = null;
  let breaching = false;

  /** Neighbour offsets: 4 straight, then 4 diagonal steps. */
  const OFFSETS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const;

  const heuristic = (a: number, goal: number) => {
    const dx = Math.abs((a % grid.cols) - (goal % grid.cols));
    const dz = Math.abs(Math.floor(a / grid.cols) - Math.floor(goal / grid.cols));
    return STRAIGHT * (dx + dz) + (DIAGONAL - 2 * STRAIGHT) * Math.min(dx, dz);
  };

  const walkableAt = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
    const i = row * grid.cols + col;
    return (
      isWalkableCell(grid, i, passer) || (breaching && breachableCell(grid, i, passer) !== null)
    );
  };

  /** The extra cost of entering a cell that has to be broken through first. */
  const wallCost = (i: number) =>
    breaching && !isWalkableCell(grid, i, passer)
      ? (breachableCell(grid, i, passer)?.cost ?? 0)
      : 0;

  /** Pushes every open neighbour of `current` that this route reaches more cheaply. */
  const expand = (current: number, goal: number) => {
    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);
    for (const [dx, dz] of OFFSETS) {
      if (!walkableAt(col + dx, row + dz)) continue;
      const diagonal = dx !== 0 && dz !== 0;
      // No corner cutting: a diagonal step needs both orthogonal neighbours free.
      if (diagonal && !(walkableAt(col + dx, row) && walkableAt(col, row + dz))) continue;
      const next = (row + dz) * grid.cols + col + dx;
      if (closed[next] === generation) continue;
      const cost = (g[current] as number) + (diagonal ? DIAGONAL : STRAIGHT) + wallCost(next);
      if (seen[next] === generation && cost >= (g[next] as number)) continue;
      seen[next] = generation;
      g[next] = cost;
      parent[next] = current;
      const h = heuristic(next, goal);
      heap.push(next, cost + h, h);
    }
  };

  /** Runs the search; returns the goal if reached, else the explored cell closest to it. */
  const search = (start: number, goal: number, maxExpansions: number) => {
    generation++;
    if (generation === 0xffffffff) {
      seen.fill(0);
      closed.fill(0);
      generation = 1;
    }
    heap.clear();
    g[start] = 0;
    parent[start] = -1;
    seen[start] = generation;
    heap.push(start, heuristic(start, goal), heuristic(start, goal));

    let best = start;
    let bestH = heuristic(start, goal);
    let expanded = 0;
    while (heap.size > 0 && expanded < maxExpansions) {
      const current = heap.pop();
      if (closed[current] === generation) continue;
      closed[current] = generation;
      expanded++;
      if (current === goal) return { end: goal, found: true, expanded };
      const h = heuristic(current, goal);
      if (h < bestH) {
        bestH = h;
        best = current;
      }
      expand(current, goal);
    }
    return { end: best, found: false, expanded };
  };

  return {
    findPath(from, to, options = {}) {
      const { maxExpansions = DEFAULT_MAX_EXPANSIONS } = options;
      passer = options.passer ?? null;
      breaching = options.breach ?? false;
      // Units standing inside an obstacle (a site placed on top of them) first step out.
      const start = nearestWalkableCell(grid, from.x, from.z, passer);
      const goalCell = cellIndexAt(grid, to.x, to.z);
      const goal = isWalkableCell(grid, goalCell, passer)
        ? goalCell
        : nearestWalkableCell(grid, to.x, to.z, passer);
      if (start < 0 || goal < 0) {
        return { waypoints: [], reachedGoal: false, expanded: 0, breach: null };
      }

      const backwards = options.fromGoal ?? false;
      const { end, found, expanded } = backwards
        ? search(goal, start, maxExpansions)
        : search(start, goal, maxExpansions);
      if (backwards && !found) {
        return { waypoints: [], reachedGoal: false, expanded, breach: null };
      }
      // The parents lead back to where the search began.
      const cells: number[] = [];
      for (let c = end; c !== -1; c = parent[c] as number) cells.push(c);
      if (!backwards) cells.reverse();
      const crossing = breaching ? cells.find((c) => !isWalkableCell(grid, c, passer)) : undefined;
      const breach =
        crossing === undefined ? null : (breachableCell(grid, crossing, passer)?.id ?? null);

      const points = cells.map((c) => cellCenter(grid, c));
      // The exact goal replaces its cell center when the goal point itself is walkable.
      const reachedGoal = found && goal === goalCell;
      if (reachedGoal) points[points.length - 1] = { x: to.x, z: to.z };
      // Start from the unit's own position; if it stands in an obstacle, the first cell
      // center (the way out) stays as a waypoint.
      if (cellIndexAt(grid, from.x, from.z) === start) points[0] = { x: from.x, z: from.z };
      else points.unshift({ x: from.x, z: from.z });
      const waypoints = smoothPath(grid, points, passer).slice(1);
      return { waypoints, reachedGoal, expanded, breach };
    },
  };
}

/**
 * Binary min-heap of cell indices ordered by f, then h (prefers cells closer to the goal),
 * then cell index, so equal-cost ties resolve the same way on every machine.
 */
class MinHeap {
  private readonly items: Int32Array;
  private readonly f: Int32Array;
  private readonly h: Int32Array;
  size = 0;

  constructor(capacity: number) {
    // Cells can be pushed more than once (lazy decrease-key), so leave room.
    this.items = new Int32Array(capacity * 4);
    this.f = new Int32Array(capacity * 4);
    this.h = new Int32Array(capacity * 4);
  }

  clear() {
    this.size = 0;
  }

  push(item: number, f: number, h: number) {
    if (this.size >= this.items.length) return;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.isBefore(f, h, item, p)) break;
      this.move(p, i);
      i = p;
    }
    this.items[i] = item;
    this.f[i] = f;
    this.h[i] = h;
  }

  pop(): number {
    const top = this.items[0] as number;
    const last = --this.size;
    if (last > 0) {
      const item = this.items[last] as number;
      const f = this.f[last] as number;
      const h = this.h[last] as number;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= last) break;
        const r = l + 1;
        const c = r < last && this.lessAt(r, l) ? r : l;
        if (!this.lessThan(c, f, h, item)) break;
        this.move(c, i);
        i = c;
      }
      this.items[i] = item;
      this.f[i] = f;
      this.h[i] = h;
    }
    return top;
  }

  /** True if (f, h, item) orders before slot `at`. */
  private isBefore(f: number, h: number, item: number, at: number) {
    const af = this.f[at] as number;
    if (f !== af) return f < af;
    const ah = this.h[at] as number;
    if (h !== ah) return h < ah;
    return item < (this.items[at] as number);
  }

  /** True if slot `at` orders before (f, h, item). */
  private lessThan(at: number, f: number, h: number, item: number) {
    const af = this.f[at] as number;
    if (af !== f) return af < f;
    const ah = this.h[at] as number;
    if (ah !== h) return ah < h;
    return (this.items[at] as number) < item;
  }

  private lessAt(a: number, b: number) {
    return this.lessThan(a, this.f[b] as number, this.h[b] as number, this.items[b] as number);
  }

  private move(from: number, to: number) {
    this.items[to] = this.items[from] as number;
    this.f[to] = this.f[from] as number;
    this.h[to] = this.h[from] as number;
  }
}
