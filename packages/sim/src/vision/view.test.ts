import { RESOURCE_IDS, type ResourceAmounts, type SettlementLayout } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext, dropVision, ensureVision } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { FLAT_MAP } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { viewOf } from './view.js';
import { isVisible, type Vision } from './vision.js';

/** Alice's Town Hall at the origin and a barracks; Bob owns nothing at the start. */
const LAYOUT: SettlementLayout = {
  buildings: [
    { building: 'townHall', x: 0, z: 0, rotation: 0 },
    { building: 'barracks', x: 16, z: 0, rotation: 0 },
  ],
  paths: [],
  pathWidth: 2,
  squares: [],
  props: { around: [], models: [], perBuilding: { min: 0, max: 0 } },
  startingSerfs: 3,
};
const world = createWorld(FLAT_MAP, LAYOUT);
const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 50])) as ResourceAmounts;

function game() {
  const initial = createInitialState(world, {
    owner: 'alice',
    players: ['bob'],
    resources: RICH,
  });
  const ctx = createSimContext(world, initial, { dev: true, visions: ['alice', 'bob'] });
  let state: GameState = initial;
  const g = {
    ctx,
    get state() {
      return state;
    },
    vision(player: PlayerId) {
      return ctx.visions.get(player) as Vision;
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
    spawn(owner: PlayerId, unit: 'swordsman' | 'archer', x: number, z: number, count = 1) {
      const first = state.nextEntityId;
      g.step('alice', { type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i) => first + i);
    },
  };
  return g;
}

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

describe('attacks need sight', () => {
  it('an attack on an enemy out of sight is rejected; in sight it is accepted', () => {
    const g = game();
    const [sword] = g.spawn('alice', 'swordsman', 0, 10);
    const [far] = g.spawn('bob', 'swordsman', -45, -45);
    const [near] = g.spawn('bob', 'swordsman', 6, 14);
    const attack = (targetId: EntityId) =>
      g.step('alice', { type: 'attack', unitIds: [sword as EntityId], targetId })[0];
    expect(attack(far as EntityId)).toMatchObject({ check: { issues: ['notVisible'] } });
    expect(attack(near as EntityId)?.ok).toBe(true);
  });

  it('a building is attackable when any of its footprint is in sight, not as a ghost', () => {
    const g = game();
    const [scout] = g.spawn('bob', 'archer', 16, 14);
    // Bob sees Alice's barracks (id 2).
    expect(
      g.step('bob', { type: 'attack', unitIds: [scout as EntityId], targetId: 2 })[0]?.ok,
    ).toBe(true);
    g.step('bob', { type: 'moveUnits', unitIds: [scout as EntityId], x: 16, z: 45 });
    for (let i = 0; i < seconds(20); i++) g.step();
    expect(g.vision('bob').lastSeen.has(2)).toBe(true);
    expect(
      g.step('bob', { type: 'attack', unitIds: [scout as EntityId], targetId: 2 })[0],
    ).toMatchObject({
      check: { issues: ['notVisible'] },
    });
  });
});

describe('player views (anti-cheat)', () => {
  it('never contain another player’s unit outside the viewer’s sight, on any tick', () => {
    const g = game();
    // Two armies on the move: both sides keep entering and leaving each other's sight.
    const red = g.spawn('alice', 'swordsman', -20, 30, 6);
    const blue = g.spawn('bob', 'archer', 30, 40, 6);
    g.step('alice', { type: 'attackMove', unitIds: red, x: 30, z: 40 });
    g.step('bob', { type: 'moveUnits', unitIds: blue, x: -30, z: 45 });
    let seenEnemies = 0;
    for (let i = 0; i < seconds(40); i++) {
      g.step();
      for (const player of ['alice', 'bob'] as const) {
        const vision = g.vision(player);
        const view = viewOf(world, g.state, vision);
        for (const unit of view.units) {
          if (unit.ownerId === player) continue;
          seenEnemies++;
          expect(isVisible(vision, unit.x, unit.z)).toBe(true);
          // No route or destination of enemies.
          expect(unit.movement).toBeNull();
          expect(['move', 'attackMove']).not.toContain(unit.task.kind);
        }
      }
    }
    // The check had something to check.
    expect(seenEnemies).toBeGreaterThan(0);
  });

  it('contain only the viewer’s own stock, training, construction and fields', () => {
    const g = game();
    g.step('alice', { type: 'trainUnit', buildingId: 2, unit: 'swordsman' });
    const bobView = viewOf(world, g.state, g.vision('bob'));
    expect(Object.keys(bobView.stocks)).toEqual(['bob']);
    expect(bobView.training).toEqual({});
    const aliceView = viewOf(world, g.state, g.vision('alice'));
    expect(Object.keys(aliceView.stocks)).toEqual(['alice']);
    expect(Object.keys(aliceView.training)).toEqual(['2']);
    // Bob has seen nothing of Alice's buildings yet.
    expect(bobView.buildings).toEqual([]);
    expect(aliceView.buildings.map((b) => b.id)).toEqual([1, 2]);
  });

  it('show other players’ buildings as last seen', () => {
    const g = game();
    g.spawn('bob', 'archer', 16, 12);
    const view = viewOf(world, g.state, g.vision('bob'));
    expect(view.buildings.map((b) => b.id)).toContain(2);
    expect(view.buildings.map((b) => b.id)).not.toContain(1);
  });
});

describe('server visions', () => {
  it('can be added when a player joins and dropped when they leave', () => {
    const g = game();
    const vision = ensureVision(g.ctx, 'carol', g.state);
    expect(g.ctx.visions.get('carol')).toBe(vision);
    expect(ensureVision(g.ctx, 'carol', g.state)).toBe(vision);
    dropVision(g.ctx, 'carol');
    expect(g.ctx.visions.has('carol')).toBe(false);
  });
});
