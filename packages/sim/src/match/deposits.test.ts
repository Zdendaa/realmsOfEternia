import {
  PROTOTYPE_MAP,
  PROTOTYPE_SETTLEMENT,
  SKIRMISH_MAP,
  SKIRMISH_SETTLEMENT,
} from '@roe/game-data';
import { describe, expect, it } from 'vitest';
import { checkPlacement } from '../rules/placement.js';
import { createInitialState } from '../state/gameState.js';
import { createWorld } from '../world/createWorld.js';

/** How many placements (position on the deposit × rotation) take a mine. */
function mineSpots(
  world: ReturnType<typeof createWorld>,
  deposit: ReturnType<typeof createWorld>['deposits'][number],
) {
  const state = createInitialState(world, { owner: 'alice' });
  const building = deposit.kind === 'gold' ? 'goldMine' : 'ironMine';
  let spots = 0;
  const reach = Math.ceil(deposit.radius);
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
        const x = Math.round(deposit.x) + dx;
        const z = Math.round(deposit.z) + dz;
        const command = { type: 'placeBuilding', building, x, z, quarterTurns } as const;
        if (checkPlacement(world, state, command).ok) spots++;
      }
    }
  }
  return spots;
}

describe('every ore deposit takes a mine', () => {
  for (const [map, settlement] of [
    [PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT],
    [SKIRMISH_MAP, SKIRMISH_SETTLEMENT],
  ] as const) {
    it(`on ${map.name}, with room to choose`, () => {
      const world = createWorld(map, settlement);
      const counts = world.deposits.map((d) => ({
        deposit: `${d.kind} ${d.x},${d.z}`,
        spots: mineSpots(world, d),
      }));
      expect(counts.filter((c) => c.spots < 20)).toEqual([]);
    }, 60_000);
  }
});
