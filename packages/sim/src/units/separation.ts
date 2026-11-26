import { combatOf, UNITS } from '@roe/game-data';
import type { SimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { isAlive, type UnitInstance } from '../state/units.js';

export const SEPARATION_RULES = {
  /** Fraction of the overlap resolved per tick (soft, so groups settle without jitter). */
  strength: 0.5,
  /** Largest push per tick, in world units. */
  maxPush: 0.25,
  /** Working units hold their spot: they take only this share of a push. */
  workingWeight: 0.15,
  /** Siege engines are heavy: they take only this share of a push from lighter units. */
  siegeWeight: 0.25,
  /** Spatial hash cell size. Larger units widen the neighbour search as needed. */
  cellSize: 1,
} as const;

/** Directions for units standing on exactly the same point, picked by their ids. */
const S = Math.SQRT1_2;
const TIE_DIRECTIONS = [
  [1, 0],
  [S, S],
  [0, 1],
  [-S, S],
  [-1, 0],
  [-S, -S],
  [0, -1],
  [S, -S],
] as const;

const cellKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

/**
 * Soft separation: overlapping units push each other apart, never into blocked cells.
 * Units aren't obstacles for path planning; this keeps them from merging into one spot.
 * Deterministic: pairs are visited in state order and pushes are applied afterwards.
 */
export function separateUnits(ctx: SimContext, units: UnitInstance[]): void {
  const size = SEPARATION_RULES.cellSize;
  const cells = new Map<number, number[]>();
  let largest = 0;
  units.forEach((u, i) => {
    // The dead lie where they fell: they neither push nor get pushed.
    if (!isAlive(u)) return;
    largest = Math.max(largest, UNITS[u.type].radius);
    const key = cellKey(Math.floor(u.x / size), Math.floor(u.z / size));
    const list = cells.get(key);
    if (list) list.push(i);
    else cells.set(key, [i]);
  });

  const pushX = new Float64Array(units.length);
  const pushZ = new Float64Array(units.length);
  const weight = (u: UnitInstance) => {
    if (u.activity === 'working') return SEPARATION_RULES.workingWeight;
    return combatOf(u.type).armorClass === 'siege' ? SEPARATION_RULES.siegeWeight : 1;
  };

  units.forEach((a, i) => {
    if (!isAlive(a)) return;
    const cx = Math.floor(a.x / size);
    const cz = Math.floor(a.z / size);
    // Every cell that can hold a unit overlapping this one.
    const reach = Math.ceil((UNITS[a.type].radius + largest) / size);
    for (let ox = -reach; ox <= reach; ox++) {
      for (let oz = -reach; oz <= reach; oz++) {
        for (const j of cells.get(cellKey(cx + ox, cz + oz)) ?? []) {
          if (j <= i) continue;
          const b = units[j] as UnitInstance;
          const minDistance = UNITS[a.type].radius + UNITS[b.type].radius;
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          const distSq = dx * dx + dz * dz;
          if (distSq >= minDistance * minDistance) continue;
          const d = Math.sqrt(distSq);
          let nx: number;
          let nz: number;
          if (d > 1e-6) {
            nx = dx / d;
            nz = dz / d;
          } else {
            const dir = TIE_DIRECTIONS[(a.id * 7 + b.id) % TIE_DIRECTIONS.length] as readonly [
              number,
              number,
            ];
            [nx, nz] = dir;
          }
          const overlap = (minDistance - d) * SEPARATION_RULES.strength;
          const wa = weight(a);
          const wb = weight(b);
          const shareA = wa / (wa + wb);
          pushX[i] = (pushX[i] as number) + nx * overlap * shareA;
          pushZ[i] = (pushZ[i] as number) + nz * overlap * shareA;
          pushX[j] = (pushX[j] as number) - nx * overlap * (1 - shareA);
          pushZ[j] = (pushZ[j] as number) - nz * overlap * (1 - shareA);
        }
      }
    }
  });

  units.forEach((u, i) => {
    let px = pushX[i] as number;
    let pz = pushZ[i] as number;
    if (px === 0 && pz === 0) return;
    const length = Math.sqrt(px * px + pz * pz);
    if (length > SEPARATION_RULES.maxPush) {
      px = (px / length) * SEPARATION_RULES.maxPush;
      pz = (pz / length) * SEPARATION_RULES.maxPush;
    }
    // A unit already inside an obstacle may move anywhere (it's on its way out).
    const free = (x: number, z: number) =>
      isWalkable(ctx.nav, x, z, u.ownerId) || !isWalkable(ctx.nav, u.x, u.z, u.ownerId);
    if (free(u.x + px, u.z + pz)) {
      u.x += px;
      u.z += pz;
    } else if (free(u.x + px, u.z)) {
      u.x += px;
    } else if (free(u.x, u.z + pz)) {
      u.z += pz;
    }
  });
}
