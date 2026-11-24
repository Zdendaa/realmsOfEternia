import { BUILDINGS, STARTING_RESOURCES } from '@roe/game-data';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState } from '../state/gameState.js';
import { FLAT_MAP, place, SETTLEMENT } from '../test/fixtures.js';
import { createWorld } from '../world/createWorld.js';
import { canAfford, EMPTY_STOCK, missingResources, pay, stockOf } from './stock.js';

const world = createWorld(FLAT_MAP, SETTLEMENT);

describe('stock helpers', () => {
  const stock = { ...EMPTY_STOCK, wood: 5, stone: 1 };

  it('lists the resources a cost can not cover, in display order', () => {
    expect(missingResources(stock, { stone: 2, wood: 6, gold: 1 })).toEqual([
      'wood',
      'stone',
      'gold',
    ]);
    expect(missingResources(stock, { wood: 5, stone: 1 })).toEqual([]);
    expect(canAfford(stock, {})).toBe(true);
  });

  it('pays without touching the given stock', () => {
    expect(pay(stock, { wood: 4, stone: 1 })).toEqual({ ...EMPTY_STOCK, wood: 1, stone: 0 });
    expect(stock.wood).toBe(5);
  });
});

describe('starting stocks', () => {
  it('gives the owner and the listed players the starting resources', () => {
    const state = createInitialState(world, { owner: 'alice', players: ['bob'] });
    expect(state.stocks).toEqual({ alice: STARTING_RESOURCES, bob: STARTING_RESOURCES });
  });

  it('gives a neutral settlement no stock', () => {
    const state = createInitialState(world);
    expect(state.stocks).toEqual({});
    expect(stockOf(state, 'mallory')).toEqual(EMPTY_STOCK);
    expect(stockOf(state, null)).toEqual(EMPTY_STOCK);
  });
});

describe('paying for construction', () => {
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial);

  it('deducts the cost from the issuer when the site is placed', () => {
    const result = applyCommand(ctx, initial, 'alice', place('house', -20, -20));
    expect(result.ok).toBe(true);
    const { wood, stone } = BUILDINGS.house.cost;
    expect(result.state.stocks.alice).toEqual({
      ...STARTING_RESOURCES,
      wood: STARTING_RESOURCES.wood - wood,
      stone: STARTING_RESOURCES.stone - stone,
    });
  });

  it('rejects a site the issuer can not afford and leaves the state unchanged', () => {
    const poor = createInitialState(world, {
      owner: 'alice',
      resources: { ...STARTING_RESOURCES, wood: 3 },
    });
    const result = applyCommand(ctx, poor, 'alice', place('house', -20, -20));
    expect(result.ok).toBe(false);
    expect(result.state).toBe(poor);
    if (!result.ok) expect(result.check.issues).toEqual(['notEnoughResources']);
  });

  it('reports the cost together with the placement rules', () => {
    const broke = createInitialState(world, { owner: 'alice', resources: EMPTY_STOCK });
    const result = applyCommand(ctx, broke, 'alice', place('house', 35, 35));
    if (!result.ok) expect(result.check.issues).toEqual(['water', 'notEnoughResources']);
    expect(result.ok).toBe(false);
  });

  it('lets a player without a stock place nothing', () => {
    const result = applyCommand(ctx, initial, 'mallory', place('well', -10, -20));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.check.issues).toEqual(['notEnoughResources']);
  });

  it('runs out after repeated placements', () => {
    // A market costs 6 wood, 6 stone and 2 gold: the starting stock pays for two.
    let state = initial;
    const spots = [
      [-20, -20],
      [-20, -30],
      [-30, -20],
    ] as const;
    const results = spots.map(([x, z]) => {
      const result = applyCommand(ctx, state, 'alice', place('market', x, z));
      state = result.state;
      return result.ok;
    });
    expect(results).toEqual([true, true, false]);
    expect(state.stocks.alice?.gold).toBe(1);
  });
});
