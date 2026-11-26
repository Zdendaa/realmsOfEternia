import { gateFor, type BuildingId } from '@roe/game-data';
import type { PlayerId, Vec2 } from '@roe/shared';
import type { SimContext } from '../context/simContext.js';
import { checkPlacement } from '../rules/placement.js';
import { planWall } from '../rules/walls.js';
import type { BuildingInstance, GameState } from '../state/gameState.js';

/**
 * The dev fort: a finished walled base to try sieges against. A square of stone wall
 * with a gate in its south side (+Z), towers in the corners and a house in the middle.
 */
export const DEBUG_FORT = {
  /** Half the side of the square. */
  half: 10,
  wall: 'stoneWall',
  /** Tower types and where they stand, from the center. */
  towers: [
    { type: 'stoneTower', x: -6, z: 6 },
    { type: 'stoneTower', x: 6, z: 6 },
    { type: 'woodenTower', x: -6, z: -6 },
    { type: 'crossbowTower', x: 6, z: -6 },
  ],
  house: { type: 'house', x: 0, z: -2 },
} as const;

/**
 * Raises the fort around `at` for `owner`, complete at once and for free. It obeys the
 * same ground rules as building: wall segments and buildings that don't fit (trees,
 * water, slopes, other buildings) are left out.
 */
export function raiseDebugFort(
  ctx: SimContext,
  state: GameState,
  owner: PlayerId,
  at: Vec2,
): GameState {
  const { half, wall, towers, house } = DEBUG_FORT;
  const center = { x: Math.round(at.x), z: Math.round(at.z) };
  const corner = (x: number, z: number) => ({ x: center.x + x * half, z: center.z + z * half });
  const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  let current = state;
  const add = (type: BuildingId, x: number, z: number, rotation: number) => {
    const building: BuildingInstance = {
      id: current.nextEntityId,
      type,
      x,
      z,
      rotation,
      ownerId: owner,
      status: 'complete',
    };
    current = {
      ...current,
      buildings: [...current.buildings, building],
      nextEntityId: current.nextEntityId + 1,
    };
  };
  corners.forEach((from, i) => {
    const to = corners[(i + 1) % corners.length] as Vec2;
    const plan = planWall(ctx.world, current, wall, from, to, ctx.heights);
    for (const segment of plan.segments) {
      if (segment.status !== 'ok') continue;
      // The gate: the segment just east of the middle of the south side.
      const gate = segment.z === center.z + half && segment.x === center.x + 1;
      add(gate ? (gateFor(wall) ?? wall) : wall, segment.x, segment.z, segment.rotation);
    }
  });
  for (const spec of [...towers, house]) {
    const x = center.x + spec.x;
    const z = center.z + spec.z;
    // Towers above the first are upgrades: the ground rules are the wooden tower's.
    const ground: BuildingId = spec.type === 'house' ? 'house' : 'woodenTower';
    const placing = { type: 'placeBuilding' as const, building: ground, x, z, quarterTurns: 0 };
    if (checkPlacement(ctx.world, current, placing, ctx.heights).ok) add(spec.type, x, z, 0);
  }
  return current;
}
