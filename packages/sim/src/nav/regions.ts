import { isWalkableCell, type NavGrid, type Passer } from './navGrid.js';

/** The connected areas of the grid for one passer. */
export interface Regions {
  /** The region of every cell (1, 2, …), 0 where the passer can't walk. */
  of: Int32Array;
  /** The largest region: "the rest of the map". */
  main: number;
}

/**
 * Labels the connected regions `passer` can walk (a flood fill, about a millisecond on a
 * 240 × 240 grid). 4-neighbours are enough: paths never cut corners.
 */
export function findRegions(grid: NavGrid, passer: Passer): Regions {
  const { cols, rows } = grid;
  const of = new Int32Array(cols * rows);
  const stack = new Int32Array(cols * rows);
  let id = 0;
  let main = 0;
  let largest = 0;
  for (let start = 0; start < of.length; start++) {
    if (of[start] !== 0 || !isWalkableCell(grid, start, passer)) continue;
    id++;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    of[start] = id;
    const visit = (next: number) => {
      if (of[next] === 0 && isWalkableCell(grid, next, passer)) {
        of[next] = id;
        stack[top++] = next;
      }
    };
    while (top > 0) {
      const cell = stack[--top] as number;
      size++;
      const col = cell % cols;
      if (col > 0) visit(cell - 1);
      if (col < cols - 1) visit(cell + 1);
      if (cell >= cols) visit(cell - cols);
      if (cell < cols * (rows - 1)) visit(cell + cols);
    }
    if (size > largest) {
      largest = size;
      main = id;
    }
  }
  return { of, main };
}

/**
 * Regions per passer, recomputed only after the grid changed. A cache of the grid alone,
 * so every machine gets the same answers whenever it fills it.
 */
export function createRegionCache(grid: NavGrid): (passer: Passer) => Regions {
  const cache = new Map<Passer, { version: number; regions: Regions }>();
  return (passer) => {
    let entry = cache.get(passer);
    if (entry?.version !== grid.version) {
      entry = { version: grid.version, regions: findRegions(grid, passer) };
      cache.set(passer, entry);
    }
    return entry.regions;
  };
}
