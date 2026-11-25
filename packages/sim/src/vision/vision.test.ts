import type { SettlementLayout } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext, type SimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { now, report } from '../test/bench.js';
import { FLAT_MAP } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import {
  cellAt,
  createVision,
  isExplored,
  isVisible,
  updateVision,
  type Vision,
} from './vision.js';

/** Alice's Town Hall at the origin (sight 14) and a house 30 units east (sight 8), no serfs. */
const LAYOUT: SettlementLayout = {
  buildings: [
    { building: 'townHall', x: 0, z: 0, rotation: 0 },
    { building: 'house', x: 30, z: 0, rotation: 0 },
  ],
  paths: [],
  pathWidth: 2,
  squares: [],
  props: { around: [], models: [], perBuilding: { min: 0, max: 0 } },
  startingSerfs: 0,
};
const world = createWorld(FLAT_MAP, LAYOUT);

function game() {
  const initial = createInitialState(world, { owner: 'alice', players: ['bob'] });
  const ctx: SimContext = createSimContext(world, initial, {
    dev: true,
    visions: ['alice', 'bob'],
  });
  let state: GameState = initial;
  const g = {
    ctx,
    get state() {
      return state;
    },
    get alice() {
      return ctx.visions.get('alice') as Vision;
    },
    get bob() {
      return ctx.visions.get('bob') as Vision;
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
    run(ticks: number) {
      for (let i = 0; i < ticks; i++) g.step();
    },
    spawn(owner: PlayerId, unit: 'swordsman' | 'archer' | 'serf', x: number, z: number): EntityId {
      const id = state.nextEntityId;
      g.step('alice', { type: 'debugSpawn', unit, count: 1, x, z, owner });
      return id;
    },
  };
  return g;
}

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

describe('vision', () => {
  it('starts with the own buildings’ sight visible and explored, the rest unknown', () => {
    const g = game();
    expect(isVisible(g.alice, 0, 0)).toBe(true);
    expect(isVisible(g.alice, 0, 13)).toBe(true);
    expect(isVisible(g.alice, 0, 18)).toBe(false);
    expect(isVisible(g.alice, 30, 6)).toBe(true);
    expect(isExplored(g.alice, -40, -40)).toBe(false);
    // Bob owns nothing yet: he sees nothing, but remembers nothing either.
    expect(g.bob.counts.every((c) => c === 0)).toBe(true);
    expect(g.bob.lastSeen.size).toBe(0);
  });

  it('follows moving units; cells left behind stay explored but not visible', () => {
    const g = game();
    const scout = g.spawn('alice', 'archer', 0, 20);
    g.step('alice', { type: 'moveUnits', unitIds: [scout], x: 0, z: 45 });
    g.run(seconds(15));
    expect(isVisible(g.alice, 0, 45)).toBe(true);
    g.step('alice', { type: 'moveUnits', unitIds: [scout], x: -40, z: 20 });
    g.run(seconds(25));
    expect(isVisible(g.alice, 0, 45)).toBe(false);
    expect(isExplored(g.alice, 0, 45)).toBe(true);
    expect(isVisible(g.alice, -40, 20)).toBe(true);
  });

  it('loses the sight of units that die', () => {
    const g = game();
    const scout = g.spawn('alice', 'serf', -40, -40);
    expect(isVisible(g.alice, -40, -40)).toBe(true);
    g.spawn('bob', 'swordsman', -40, -36);
    g.run(seconds(20));
    // Dead, and by now removed.
    expect(g.state.units.some((u) => u.id === scout && u.diedAt === null)).toBe(false);
    g.run(1);
    expect(isVisible(g.alice, -40, -40)).toBe(false);
    expect(g.alice.stamps.has(scout)).toBe(false);
  });

  it('remembers other players’ buildings as last seen, until their spot is seen again', () => {
    const g = game();
    // Bob sees Alice's house with a scout, remembers it, then walks away.
    const scout = g.spawn('bob', 'archer', 30, 12);
    expect(g.bob.lastSeen.get(2)?.type).toBe('house');
    g.step('bob', { type: 'moveUnits', unitIds: [scout], x: 30, z: 45 });
    g.run(seconds(20));
    expect(isVisible(g.bob, 30, 0)).toBe(false);
    // The house is destroyed out of Bob's sight: he still remembers it.
    const state = g.state;
    const without = { ...state, buildings: state.buildings.filter((b) => b.id !== 2) };
    updateVision(g.bob, without);
    expect(g.bob.lastSeen.has(2)).toBe(true);
    // Seeing the spot again clears the ghost.
    const fresh = createVision(world.map, 'bob');
    fresh.lastSeen.set(
      2,
      state.buildings.find((b) => b.id === 2) as GameState['buildings'][number],
    );
    updateVision(fresh, {
      ...without,
      units: without.units.map((u) => (u.id === scout ? { ...u, x: 30, z: 8 } : u)),
    });
    expect(fresh.lastSeen.has(2)).toBe(false);
  });

  it('incremental updates match a vision built from scratch', () => {
    const g = game();
    for (let i = 0; i < 6; i++) g.spawn('alice', 'swordsman', -10 + i * 4, 20);
    const ids = g.state.units.filter((u) => u.ownerId === 'alice').map((u) => u.id);
    g.step('alice', { type: 'moveUnits', unitIds: ids, x: -30, z: 40 });
    g.run(seconds(12));
    const fresh = createVision(world.map, 'alice');
    updateVision(fresh, g.state);
    expect(Array.from(g.alice.counts)).toEqual(Array.from(fresh.counts));
    // Explored is history: everything visible now is explored, and more.
    for (let i = 0; i < fresh.counts.length; i++) {
      if ((fresh.counts[i] ?? 0) > 0) expect(g.alice.explored[i]).toBe(1);
    }
    expect(g.alice.explored.reduce((a, b) => a + b, 0)).toBeGreaterThan(
      fresh.explored.reduce((a, b) => a + b, 0),
    );
  });

  it('clamps positions outside the map to the edge cells', () => {
    const vision = createVision(world.map, 'alice');
    expect(cellAt(vision, -1000, -1000)).toBe(0);
    expect(cellAt(vision, 1000, 1000)).toBe(vision.columns * vision.rows - 1);
  });

  it('keeps 200 moving units up to date within a fraction of a millisecond', () => {
    const g = game();
    for (let i = 0; i < 10; i++) {
      g.step('alice', { type: 'debugSpawn', unit: 'swordsman', count: 20, x: -40 + i * 8, z: 30 });
    }
    const ids = g.state.units.filter((u) => u.ownerId === 'alice').map((u) => u.id);
    g.step('alice', { type: 'moveUnits', unitIds: ids, x: 0, z: -40 });
    const vision = createVision(world.map, 'alice');
    updateVision(vision, g.state);
    const times: number[] = [];
    for (let i = 0; i < seconds(20); i++) {
      g.step();
      const start = now();
      updateVision(vision, g.state);
      times.push(now() - start);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    report(
      `vision, 200 moving units: mean ${mean.toFixed(3)} ms/tick, max ${(times.at(-1) as number).toFixed(3)} ms`,
    );
    expect(mean).toBeLessThan(1);
  });
});
