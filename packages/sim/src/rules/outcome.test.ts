import { RESOURCE_IDS, type ResourceAmounts, type SettlementLayout } from '@roe/game-data';
import {
  SIMULATION_TICK_RATE,
  type EntityId,
  type MapDefinition,
  type PlayerId,
} from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { MONSTER_PLAYER } from '../combat/hostility.js';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { FLAT_MAP } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { decideOutcomes } from './outcome.js';

/** Alice: a Town Hall and a barracks, no serfs. */
const LAYOUT: SettlementLayout = {
  buildings: [
    { building: 'townHall', x: 0, z: 0, rotation: 0 },
    { building: 'barracks', x: 16, z: 0, rotation: 0 },
  ],
  paths: [],
  pathWidth: 2,
  squares: [],
  props: { around: [], models: [], perBuilding: { min: 0, max: 0 } },
  startingSerfs: 0,
};
/** A small camp west and a wave from the north at 20 s; victory by clearing the monsters. */
const SCENARIO: MapDefinition = {
  ...FLAT_MAP,
  id: 'test-scenario',
  objective: 'clearMonsters',
  camps: [{ x: -30, z: 0, units: [{ unit: 'skeletonMinion', count: 2 }] }],
  waves: [{ at: 20, x: 0, z: -35, units: [{ unit: 'skeletonMinion', count: 2 }] }],
};
const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 100])) as ResourceAmounts;
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

function game(map: MapDefinition = SCENARIO) {
  const world = createWorld(map, LAYOUT);
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    get state() {
      return state;
    },
    step(issuer: PlayerId = 'alice', ...commands: Command[]) {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      );
      state = result.state;
      return result.results;
    },
    run(ticks: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.(state)) return;
        g.step();
      }
    },
    spawn(
      owner: PlayerId | null,
      unit: 'swordsman' | 'spearman',
      x: number,
      z: number,
      count: number,
    ) {
      const first = state.nextEntityId;
      g.step('alice', { type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i): EntityId => first + i);
    },
  };
  return g;
}

describe('win and lose', () => {
  it('losing the Town Hall is a defeat; orders are refused afterwards, the game goes on', () => {
    const g = game({ ...FLAT_MAP, id: 'test-defeat' });
    g.spawn('enemy', 'spearman', 0, 10, 10);
    g.run(seconds(120), (s) => s.outcome.alice !== undefined);
    expect(g.state.outcome.alice?.result).toBe('lost');
    expect(g.state.buildings.some((b) => b.type === 'townHall')).toBe(false);
    expect(g.state.stats.alice?.buildingsLost).toBeGreaterThanOrEqual(1);
    const [order] = g.step('alice', { type: 'trainUnit', buildingId: 2, unit: 'swordsman' });
    expect(order).toMatchObject({ ok: false, check: { issues: ['gameOver'] } });
    const tick = g.state.tick;
    g.run(5);
    expect(g.state.tick).toBe(tick + 5);
    expect(g.state.outcome.alice?.result).toBe('lost');
  });

  it('clearing the camps is not enough while a wave is still to come', () => {
    const g = game();
    const army = g.spawn('alice', 'swordsman', -15, 0, 4);
    g.step('alice', { type: 'attackMove', unitIds: army, x: -30, z: 0 });
    g.run(seconds(18));
    const monsters = g.state.units.filter((u) => u.ownerId === MONSTER_PLAYER && isAlive(u));
    expect(monsters).toHaveLength(0);
    expect(g.state.wavesSent).toBe(0);
    expect(g.state.outcome.alice).toBeUndefined();
  });

  it('beating the camps and the wave is a victory, with the numbers counted', () => {
    const g = game();
    const army = g.spawn('alice', 'swordsman', -15, 0, 4);
    g.step('alice', { type: 'attackMove', unitIds: army, x: -30, z: 0 });
    g.run(seconds(18));
    // Back to the Town Hall's north side for the wave.
    g.step('alice', { type: 'attackMove', unitIds: army, x: 0, z: -12 });
    g.run(seconds(60), (s) => s.outcome.alice !== undefined);
    expect(g.state.outcome.alice?.result).toBe('won');
    expect(g.state.stats.alice).toMatchObject({ enemiesKilled: 4, buildingsLost: 0 });
  });

  it('a clearMonsters map with no camps and no waves is not won on the first tick', () => {
    const g = game({ ...FLAT_MAP, id: 'test-empty', objective: 'clearMonsters' });
    g.step();
    expect(g.state.outcome).toEqual({});
    g.run(seconds(5));
    expect(g.state.outcome).toEqual({});
  });

  it('only a player with a Town Hall can win', () => {
    const world = createWorld(SCENARIO, LAYOUT);
    const initial = createInitialState(world, { owner: 'alice', resources: RICH });
    // The camp and the wave are beaten; bob has a stock but no Town Hall.
    const cleared: GameState = {
      ...initial,
      units: [],
      wavesSent: 1,
      stocks: { ...initial.stocks, bob: RICH },
    };
    const outcome = decideOutcomes(world, initial, cleared);
    expect(outcome.alice?.result).toBe('won');
    expect(outcome.bob).toBeUndefined();
  });

  it('counts trained soldiers', () => {
    const g = game();
    g.step('alice', { type: 'trainUnit', buildingId: 2, unit: 'spearman' });
    g.run(seconds(16));
    expect(g.state.stats.alice?.soldiersTrained).toBe(1);
  });

  it('a map without an objective has no victory', () => {
    const g = game({ ...FLAT_MAP, id: 'test-open' });
    g.run(seconds(5));
    expect(g.state.outcome).toEqual({});
  });
});
