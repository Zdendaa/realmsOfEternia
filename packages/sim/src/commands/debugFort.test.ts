import { SIMULATION_TICK_RATE } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { createSimContext, syncContext } from '../context/simContext.js';
import { createInitialState } from '../state/gameState.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { applyCommand } from './applyCommand.js';
import { DEBUG_FORT } from './debugFort.js';
import { parseCommand } from './types.js';

const setup = (dev = true) => {
  const world = createWorld(FLAT_MAP, { ...TOWN, startingSerfs: 0 });
  const state = createInitialState(world, { owner: 'alice' });
  return { ctx: createSimContext(world, state, { dev }), state };
};
const fort = { type: 'debugFort', x: 0, z: 28, owner: 'enemy' } as const;

describe('debugFort', () => {
  it('raises a finished walled base with a gate and towers, for the given owner', () => {
    const { ctx, state } = setup();
    const result = applyCommand(ctx, state, 'alice', fort);
    expect(result.ok).toBe(true);
    syncContext(ctx, result.state);
    const raised = result.state.buildings.filter((b) => b.ownerId === 'enemy');
    expect(raised.every((b) => b.status === 'complete')).toBe(true);
    const count = (type: string) => raised.filter((b) => b.type === type).length;
    // 4 sides of 10 segments, one of them the gate.
    expect(count('stoneWall')).toBe(DEBUG_FORT.half * 4 - 1);
    expect(count('stoneGate')).toBe(1);
    expect(count('stoneTower')).toBe(2);
    expect(count('crossbowTower')).toBe(1);
    expect(count('woodenTower')).toBe(1);
    expect(count('house')).toBe(1);
  });

  it('its towers shoot at the other side', () => {
    const { ctx, state } = setup();
    let current = stepGame(ctx, state, [{ issuer: 'alice', command: fort }]).state;
    current = stepGame(ctx, current, [
      { issuer: 'alice', command: { type: 'debugSpawn', unit: 'ram', count: 1, x: 0, z: 44 } },
    ]).state;
    for (let i = 0; i < 20 * SIMULATION_TICK_RATE; i++) current = stepGame(ctx, current).state;
    const ram = current.units.find((u) => u.type === 'ram');
    expect(ram?.health ?? 0).toBeLessThan(500);
  });

  it('is refused outside development, and parsed from untrusted input', () => {
    const { ctx, state } = setup(false);
    const result = applyCommand(ctx, state, 'alice', fort);
    expect(result.ok ? [] : result.check.issues).toEqual(['devOnly']);
    expect(parseCommand({ ...fort, extra: 1 })).toEqual(fort);
    expect(parseCommand({ type: 'debugFort', x: 'a', z: 0 })).toBeNull();
  });
});
