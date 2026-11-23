import type { Bounds2D, Vec2 } from '@roe/shared';

/** Uniform grid over points for fast rectangle queries (trees near a footprint, etc.). */
export interface PointGrid<T extends Vec2> {
  query(bounds: Bounds2D): T[];
}

export function createPointGrid<T extends Vec2>(
  items: readonly T[],
  cellSize: number,
): PointGrid<T> {
  const cells = new Map<string, T[]>();
  const cellOf = (v: number) => Math.floor(v / cellSize);
  for (const item of items) {
    const key = `${cellOf(item.x)},${cellOf(item.z)}`;
    const list = cells.get(key);
    if (list) list.push(item);
    else cells.set(key, [item]);
  }
  return {
    query(bounds) {
      const found: T[] = [];
      for (let cx = cellOf(bounds.minX); cx <= cellOf(bounds.maxX); cx++) {
        for (let cz = cellOf(bounds.minZ); cz <= cellOf(bounds.maxZ); cz++) {
          for (const item of cells.get(`${cx},${cz}`) ?? []) {
            if (
              item.x >= bounds.minX &&
              item.x <= bounds.maxX &&
              item.z >= bounds.minZ &&
              item.z <= bounds.maxZ
            ) {
              found.push(item);
            }
          }
        }
      }
      return found;
    },
  };
}
