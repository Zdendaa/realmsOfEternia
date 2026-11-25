import { RESOURCE_IDS, type ResourceAmounts } from '@roe/game-data';
import {
  SIMULATION_TICK_RATE,
  type EntityId,
  type MapDefinition,
  type PlayerId,
} from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { MONSTER_PLAYER } from './hostility.js';

/** The flat map with one camp 30 units west of the Town Hall. */
const CAMP_MAP: MapDefinition = {
  ...FLAT_MAP,
  id: 'test-camp',
  camps: [
    {
      x: -30,
      z: 0,
      units: [
        { unit: 'skeletonWarrior', count: 1 },
        { unit: 'skeletonMinion', count: 2 },
        { unit: 'skeletonArcher', count: 1 },
        { unit: 'dragon', count: 3 },
      ],
    },
  ],
};
const world = createWorld(CAMP_MAP, TOWN);
const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 100])) as ResourceAmounts;

function game() {
  const initial = createInitialState(world, {
    owner: 'alice',
    players: ['bob'],
    resources: RICH,
  });
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
    guards(): UnitInstance[] {
      return state.units.filter((u) => u.ownerId === MONSTER_PLAYER && isAlive(u));
    },
    spawn(unit: 'swordsman' | 'spearman' | 'archer', x: number, z: number, count = 1): EntityId[] {
      const first = state.nextEntityId;
      g.step('alice', { type: 'debugSpawn', unit, count, x, z });
      return Array.from({ length: count }, (_, i) => first + i);
    },
  };
  return g;
}

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

describe('monster camps', () => {
  it('spawn their guards at the start, around the camp, each with its home', () => {
    const g = game();
    const guards = g.guards();
    // Unknown kinds (the dragon) are skipped.
    expect(guards.map((u) => u.type).sort()).toEqual([
      'skeletonArcher',
      'skeletonMinion',
      'skeletonMinion',
      'skeletonWarrior',
    ]);
    for (const guard of guards) {
      expect(Math.hypot(guard.x + 30, guard.z)).toBeLessThan(4);
      expect(guard.combat?.home).toEqual({ x: guard.x, z: guard.z });
    }
  });

  it('stay at their camp while nobody comes near', () => {
    const g = game();
    const before = g.guards().map((u) => [u.x, u.z]);
    g.run(seconds(30));
    const after = g.guards().map((u) => [u.x, u.z]);
    expect(after).toHaveLength(before.length);
    after.forEach(([x, z], i) => {
      const [bx = 0, bz = 0] = before[i] ?? [];
      expect(Math.hypot((x ?? 0) - bx, (z ?? 0) - bz)).toBeLessThan(1);
    });
    // The village is untouched.
    expect(g.state.units.filter((u) => u.ownerId === 'alice' && !isAlive(u))).toHaveLength(0);
  });

  it('attack soldiers that come close, and pay a bounty to the killer', () => {
    const g = game();
    const gold = (g.state.stocks.alice as ResourceAmounts).gold;
    const army = g.spawn('swordsman', -14, 0, 6);
    g.step('alice', { type: 'attackMove', unitIds: army, x: -30, z: 0 });
    g.run(seconds(60), () => g.guards().length === 0);
    expect(g.guards()).toHaveLength(0);
    // Bounties: warrior 2, two minions 1 each, crossbowman 1.
    expect((g.state.stocks.alice as ResourceAmounts).gold).toBe(gold + 5);
  });

  it('chase intruders only within the leash, then walk home', () => {
    const g = game();
    const [scout] = g.spawn('archer', -21, 0);
    // The archer comes into sight, is chased, and runs back east, far away.
    g.run(seconds(2));
    g.step('alice', { type: 'moveUnits', unitIds: [scout as EntityId], x: 25, z: 0 });
    g.run(seconds(40));
    for (const guard of g.guards()) {
      const home = guard.combat?.home as { x: number; z: number };
      expect(Math.hypot(guard.x - home.x, guard.z - home.z)).toBeLessThan(1.5);
      expect(guard.activity).toBe('idle');
    }
  });

  it('pay the bounty to whoever lands the killing blow', () => {
    const g = game();
    const aliceGold = (g.state.stocks.alice as ResourceAmounts).gold;
    const bobGold = (g.state.stocks.bob as ResourceAmounts).gold;
    // Bob's spearmen clear the camp; Alice's army stays home.
    const first = g.state.nextEntityId;
    g.step('alice', { type: 'debugSpawn', unit: 'spearman', count: 6, x: -14, z: 0, owner: 'bob' });
    const army = Array.from({ length: 6 }, (_, i) => first + i);
    g.step('bob', { type: 'attackMove', unitIds: army, x: -30, z: 0 });
    g.run(seconds(60), () => g.guards().length === 0);
    expect(g.guards()).toHaveLength(0);
    expect((g.state.stocks.bob as ResourceAmounts).gold).toBe(bobGold + 5);
    expect((g.state.stocks.alice as ResourceAmounts).gold).toBe(aliceGold);
  });

  it('are deterministic', () => {
    const play = () => {
      const g = game();
      const army = g.spawn('spearman', -12, 0, 4);
      g.step('alice', { type: 'attackMove', unitIds: army, x: -30, z: 0 });
      g.run(seconds(30));
      return JSON.stringify(g.state);
    };
    expect(play()).toBe(play());
  });
});
