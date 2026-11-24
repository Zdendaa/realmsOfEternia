import { BUILDINGS, PROFESSIONS, STARTING_RESOURCES, type ResourceAmounts } from '@roe/game-data';
import type { MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { createSimContext } from '../context/simContext.js';
import { checkPlacement, depositAt } from '../rules/placement.js';
import { createInitialState, type BuildingInstance, type GameState } from '../state/gameState.js';
import { FLAT_MAP, place, RESOURCE_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';

/** The flat map with a gold deposit east and an iron deposit west of the Town Hall. */
const DEPOSIT_MAP: MapDefinition = {
  ...FLAT_MAP,
  id: 'test-deposits',
  deposits: [
    { kind: 'gold', x: 20, z: 0, radius: 3, amount: 100 },
    { kind: 'iron', x: -20, z: 0, radius: 3, amount: 100 },
  ],
};
const world = createWorld(DEPOSIT_MAP, TOWN);

function withMine(type: 'goldMine' | 'ironMine', x: number, stock: Partial<ResourceAmounts>) {
  const state = createInitialState(world, {
    owner: 'alice',
    resources: { ...STARTING_RESOURCES, ...stock },
  });
  const mine: BuildingInstance = {
    id: state.nextEntityId,
    type,
    x,
    z: 0,
    rotation: 0,
    ownerId: 'alice',
    status: 'complete',
  };
  return { ...state, buildings: [...state.buildings, mine], nextEntityId: mine.id + 1 };
}

function run(initial: GameState, ticks: number) {
  const ctx = createSimContext(world, initial);
  let state = initial;
  for (let i = 0; i < ticks; i++) state = stepGame(ctx, state).state;
  return state;
}

describe('mines', () => {
  const state = createInitialState(world, { owner: 'alice' });
  const check = (building: 'goldMine' | 'ironMine', x: number, z: number) =>
    checkPlacement(world, state, place(building, x, z));

  it('must be built on a deposit of their ore (the center within its radius)', () => {
    expect(check('goldMine', 20, 0).ok).toBe(true);
    expect(check('goldMine', 22, 2).ok).toBe(true); // √8 ≈ 2.8 < 3
    expect(check('goldMine', 23, 1).issues).toEqual(['deposit']); // √10 > 3
    expect(check('goldMine', -20, 0).issues).toEqual(['deposit']); // an iron deposit
    expect(check('ironMine', -20, 0).ok).toBe(true);
    expect(check('ironMine', 0, 25).issues).toEqual(['deposit']);
    expect(depositAt(world, 'gold', 21, 1)?.kind).toBe('gold');
    expect(depositAt(world, 'iron', 21, 1)).toBeUndefined();
  });

  it('other buildings ignore deposits', () => {
    expect(checkPlacement(world, state, place('house', 20, 0)).ok).toBe(true);
  });

  it('a miner turns food into ore, several per trip', () => {
    const initial = withMine('goldMine', 20, { food: 10, gold: 0 });
    // Once the first trip is done, a full load of ore has arrived.
    const first = run(initial, 600).stocks.alice as ResourceAmounts;
    expect(first.gold).toBe(PROFESSIONS.miner.carryCapacity);
    // All food used up: 1 food per ore, nothing lost.
    const stock = run(initial, 3000).stocks.alice as ResourceAmounts;
    expect(stock.gold).toBe(10);
    expect(stock.food).toBe(0);
    expect(BUILDINGS.ironMine.production.output.resource).toBe('iron');
    const iron = run(withMine('ironMine', -20, { food: 3, iron: 0 }), 3000).stocks.alice;
    expect(iron?.iron).toBe(3);
    expect(iron?.food).toBe(0);
  });

  it('without food the miner waits', () => {
    const after = run(withMine('goldMine', 20, { food: 0, gold: 0 }), 600);
    const miner = after.units.find((u) => u.type === 'worker');
    expect(miner?.task.kind === 'work' && miner.task.phase).toBe('waiting');
    expect(after.stocks.alice?.gold).toBe(0);
  });

  it('trees and rocks keep clear of deposits', () => {
    const deposit = { kind: 'gold' as const, x: 30, z: 30, radius: 3, amount: 1 };
    const without = createWorld(RESOURCE_MAP, TOWN);
    const withDeposit = createWorld({ ...RESOURCE_MAP, deposits: [deposit] }, TOWN);
    const near = (w: typeof without) =>
      w.decorations.filter(
        (d) => Math.hypot(d.x - deposit.x, d.z - deposit.z) < deposit.radius + 5,
      );
    expect(near(without).length).toBeGreaterThan(0); // the test map has some there
    expect(near(withDeposit)).toEqual([]);
  });
});
