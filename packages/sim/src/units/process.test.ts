import {
  BUILDINGS,
  PROFESSIONS,
  STARTING_RESOURCES,
  type BuildingId,
  type ResourceAmounts,
} from '@roe/game-data';
import { describe, expect, it } from 'vitest';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type BuildingInstance, type GameState } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { stepsPerTrip } from './production/process.js';

const world = createWorld(FLAT_MAP, TOWN);

/** The flat town (Town Hall at the origin) with extra stock and complete buildings. */
function town(
  stock: Partial<ResourceAmounts>,
  buildings: readonly [BuildingId, number, number][],
): GameState {
  const state = createInitialState(world, {
    owner: 'alice',
    resources: { ...STARTING_RESOURCES, ...stock },
  });
  let next = state.nextEntityId;
  const added = buildings.map(([type, x, z]): BuildingInstance => ({
    id: next++,
    type,
    x,
    z,
    rotation: 0,
    ownerId: 'alice',
    status: 'complete',
  }));
  return { ...state, buildings: [...state.buildings, ...added], nextEntityId: next };
}

function game(initial: GameState) {
  const ctx = createSimContext(world, initial);
  let state = initial;
  return {
    get state() {
      return state;
    },
    step() {
      state = stepGame(ctx, state).state;
    },
    run(ticks: number, each?: (s: GameState) => void) {
      for (let i = 0; i < ticks; i++) {
        this.step();
        each?.(state);
      }
    },
  };
}

const stockOf = (s: GameState) => s.stocks.alice ?? STARTING_RESOURCES;
const workersOf = (s: GameState, type: BuildingId) => {
  const ids = new Set(s.buildings.filter((b) => b.type === type).map((b) => b.id));
  return s.units.filter((u) => u.task.kind === 'work' && ids.has(u.task.buildingId));
};
const carried = (units: readonly UnitInstance[], resource: string) =>
  units.reduce((sum, u) => sum + (u.carrying?.resource === resource ? u.carrying.amount : 0), 0);

/** Input a worker has taken from the stock but not picked up yet (fetching) or is working on. */
function reservedGrain(s: GameState) {
  let sum = 0;
  for (const u of workersOf(s, 'mill')) {
    if (u.task.kind === 'work' && u.task.phase === 'fetching') sum += u.task.target;
  }
  return sum;
}

describe('processing (mill, bakery)', () => {
  it('a miller without grain in stock waits and changes nothing', () => {
    const g = game(town({ grain: 0 }, [['mill', 14, -4]]));
    g.run(300);
    const [miller] = workersOf(g.state, 'mill');
    expect(miller?.task.kind === 'work' && miller.task.phase).toBe('waiting');
    expect(stockOf(g.state).grain).toBe(0);
    expect(stockOf(g.state).flour).toBe(0);
  });

  it('grinds grain into flour, several units per trip', () => {
    const g = game(town({ grain: 5 }, [['mill', 14, -4]]));
    let largestLoad = 0;
    g.run(1500, (s) => {
      largestLoad = Math.max(largestLoad, carried(workersOf(s, 'mill'), 'grain'));
    });
    expect(largestLoad).toBe(stepsPerTrip(BUILDINGS.mill.production));
    expect(largestLoad).toBe(PROFESSIONS.miller.carryCapacity);
    expect(stockOf(g.state).grain).toBe(0);
    expect(stockOf(g.state).flour).toBe(5);
  });

  it('never uses one unit twice: two mills, one grain', () => {
    const g = game(
      town({ grain: 1 }, [
        ['mill', 14, -4],
        ['mill', -14, -4],
      ]),
    );
    // Every tick, the grain is in exactly one place: stock, reserved, in hand, or turned
    // into flour (in hand or in stock).
    g.run(1200, (s) => {
      const millers = workersOf(s, 'mill');
      const processing = millers.reduce(
        (sum, u) =>
          sum + (u.task.kind === 'work' && u.task.phase === 'processing' ? u.task.target : 0),
        0,
      );
      const inHand = carried(millers, 'grain') - processing; // processing keeps its input in hand
      const total =
        stockOf(s).grain +
        reservedGrain(s) +
        inHand +
        processing +
        carried(millers, 'flour') +
        stockOf(s).flour;
      expect(total).toBe(1);
    });
    expect(stockOf(g.state).flour).toBe(1);
    expect(stockOf(g.state).grain).toBe(0);
  });

  it('runs the chain end to end: grain → flour → food', () => {
    const g = game(
      town({ grain: 4, food: 0 }, [
        ['mill', 14, -4],
        ['bakery', -14, -4],
      ]),
    );
    g.run(3000);
    const stock = stockOf(g.state);
    expect(stock.grain).toBe(0);
    expect(stock.flour).toBe(0);
    expect(stock.food).toBe(4 * BUILDINGS.bakery.production.output.amount);
  });

  it('is deterministic', () => {
    const setup = () =>
      town({ grain: 7 }, [
        ['mill', 14, -4],
        ['bakery', -14, -4],
      ]);
    const a = game(setup());
    const b = game(setup());
    a.run(1200);
    b.run(1200);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });
});
