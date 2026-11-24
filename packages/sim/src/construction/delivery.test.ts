import { BUILDINGS, STARTING_RESOURCES } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type Decoration } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isHarvestable } from '../state/resourceNodes.js';
import { FLAT_MAP, place, RESOURCE_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { allowedWork } from './delivery.js';

function game(map = FLAT_MAP, serfCount = 5) {
  const world = createWorld(map, TOWN);
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial);
  let state: GameState = { ...initial, units: initial.units.slice(0, serfCount) };
  return {
    world,
    get state() {
      return state;
    },
    step(...commands: Command[]) {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer: 'alice', command })),
      );
      state = result.state;
      return result.results;
    },
    /** Runs until `until` holds (or `ticks` pass), checking `each` after every tick. */
    run(ticks: number, until?: (s: GameState) => boolean, each?: (s: GameState) => void) {
      for (let i = 0; i < ticks; i++) {
        if (until?.(state)) return i;
        this.step();
        each?.(state);
      }
      return ticks;
    },
  };
}

const complete = (siteId: number) => (s: GameState) =>
  s.buildings.some((b) => b.id === siteId && b.status === 'complete');

describe('material delivery', () => {
  it('builders carry the materials over before the work can finish', () => {
    const g = game(FLAT_MAP, 1);
    g.step(place('house', 14, 6));
    const siteId = g.state.buildings.at(-1)?.id as number;
    const paid = g.state.stocks.alice;
    let sawReservedLoad = false;
    g.run(400 * SIMULATION_TICK_RATE, complete(siteId), (s) => {
      const progress = s.construction[siteId];
      const site = s.buildings.find((b) => b.id === siteId);
      if (progress && site)
        expect(progress.workDone).toBeLessThanOrEqual(allowedWork(site, progress));
      if (s.units[0]?.carrying?.siteId === siteId) sawReservedLoad = true;
    });
    expect(complete(siteId)(g.state)).toBe(true);
    expect(sawReservedLoad).toBe(true);
    // The cost was paid once, at placement: deliveries don't touch the stock.
    expect(g.state.stocks.alice).toBe(paid);
  });

  it('takes longer than the bare work, and more builders deliver faster', () => {
    const ticks = (serfs: number) => {
      const g = game(FLAT_MAP, serfs);
      g.step(place('house', 14, 6));
      const siteId = g.state.buildings.at(-1)?.id as number;
      return g.run(400 * SIMULATION_TICK_RATE, complete(siteId));
    };
    const one = ticks(1);
    const three = ticks(3);
    expect(one).toBeGreaterThan(BUILDINGS.house.buildTime * SIMULATION_TICK_RATE);
    expect(three).toBeLessThan(one / 2);
  });

  it('supplies two sites at once without starving either', () => {
    const g = game(FLAT_MAP, 5);
    g.step(place('house', 14, 6));
    const first = g.state.buildings.at(-1)?.id as number;
    g.step(place('well', -12, 8));
    const second = g.state.buildings.at(-1)?.id as number;
    g.run(400 * SIMULATION_TICK_RATE, (s) => complete(first)(s) && complete(second)(s));
    expect(complete(first)(g.state) && complete(second)(g.state)).toBe(true);
  });

  it('returns interrupted material to the site instead of adding it to the stock', () => {
    const g = game(RESOURCE_MAP, 1);
    g.step(place('house', 14, 6));
    const siteId = g.state.buildings.at(-1)?.id as number;
    g.run(120 * SIMULATION_TICK_RATE, (s) => s.units[0]?.carrying?.siteId === siteId);
    expect(g.state.units[0]?.carrying).toEqual({ resource: 'wood', amount: 1, siteId });
    const woodBefore = g.state.stocks.alice?.wood ?? 0;

    // Sent to chop instead: the reserved log goes back first, then real wood arrives.
    const tree = g.world.decorations
      .filter((d) => d.kind === 'tree' && isHarvestable(g.world, d))
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0] as Decoration;
    g.step({ type: 'gather', unitIds: [g.state.units[0]?.id as number], nodeId: tree.id });
    g.run(120 * SIMULATION_TICK_RATE, (s) => s.units[0]?.carrying === null);
    expect(g.state.stocks.alice?.wood).toBe(woodBefore);
    g.run(200 * SIMULATION_TICK_RATE, (s) => (s.stocks.alice?.wood ?? 0) > woodBefore);
    expect(g.state.stocks.alice?.wood).toBe(woodBefore + 1);
    expect(woodBefore).toBe(STARTING_RESOURCES.wood - BUILDINGS.house.cost.wood);
  });

  it('is deterministic', () => {
    const play = () => {
      const g = game(FLAT_MAP, 5);
      g.step(place('house', 14, 6));
      g.step(place('well', -12, 8));
      g.run(90 * SIMULATION_TICK_RATE);
      return g.state;
    };
    expect(play()).toEqual(play());
  });
});
