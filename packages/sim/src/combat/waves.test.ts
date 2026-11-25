import { SIMULATION_TICK_RATE, type MapDefinition, type PlayerId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { MONSTER_PLAYER } from './hostility.js';

/** A wave 30 s in, from 35 units north of the Town Hall (at the origin). */
const WAVE_MAP: MapDefinition = {
  ...FLAT_MAP,
  id: 'test-wave',
  waves: [
    {
      at: 30,
      x: 0,
      z: -35,
      units: [
        { unit: 'skeletonWarrior', count: 1 },
        { unit: 'skeletonMinion', count: 3 },
      ],
    },
  ],
};
const world = createWorld(WAVE_MAP, TOWN);
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

function game({ dev = true } = {}) {
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial, { dev });
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
    monsters() {
      return state.units.filter((u) => u.ownerId === MONSTER_PLAYER && isAlive(u));
    },
  };
  return g;
}

describe('scripted waves', () => {
  it('arrive on time and attack-move to the Town Hall', () => {
    const g = game();
    g.run(seconds(30) - 1);
    expect(g.monsters()).toHaveLength(0);
    g.run(2);
    const wave = g.monsters();
    expect(wave.map((u) => u.type).sort()).toEqual([
      'skeletonMinion',
      'skeletonMinion',
      'skeletonMinion',
      'skeletonWarrior',
    ]);
    expect(g.state.wavesSent).toBe(1);
    for (const u of wave) {
      expect(u.task.kind).toBe('attackMove');
      expect(Math.hypot(u.x, u.z + 35)).toBeLessThan(4);
    }
    // It never comes again on its own.
    g.run(seconds(5));
    expect(g.state.wavesSent).toBe(1);
  });

  it('break into an undefended village: they hack at the Town Hall', () => {
    const g = game();
    g.run(seconds(120));
    // About a minute of blows (they arrive ~20 s after spawning, 30 s in).
    expect(g.state.buildingDamage[1] ?? 0).toBeGreaterThan(500);
    expect(g.monsters().every((u) => u.combat?.targetId === 1)).toBe(true);
  });

  it('are beaten by soldiers guarding the village', () => {
    const g = game();
    g.step('alice', { type: 'debugSpawn', unit: 'swordsman', count: 5, x: 0, z: -10 });
    g.run(seconds(90));
    expect(g.state.wavesSent).toBe(1);
    expect(g.monsters()).toHaveLength(0);
    expect(g.state.buildingDamage[1]).toBeUndefined();
  });

  it('can be called early in a dev build only', () => {
    const plain = game({ dev: false });
    expect(plain.step('alice', { type: 'debugWave' })[0]).toMatchObject({
      check: { issues: ['devOnly'] },
    });
    const g = game();
    expect(g.step('alice', { type: 'debugWave' })[0]?.ok).toBe(true);
    expect(g.monsters()).toHaveLength(4);
    expect(g.state.wavesSent).toBe(1);
    // The called wave doesn't come again at its time.
    g.run(seconds(31));
    expect(g.state.wavesSent).toBe(1);
  });

  it('are deterministic', () => {
    const play = () => {
      const g = game();
      g.run(seconds(60));
      return JSON.stringify(g.state);
    };
    expect(play()).toBe(play());
  });
});
