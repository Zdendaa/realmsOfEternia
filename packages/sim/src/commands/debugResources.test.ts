import { RESOURCE_IDS, STARTING_RESOURCES } from '@roe/game-data';
import { describe, expect, it } from 'vitest';
import { createSimContext } from '../context/simContext.js';
import { createInitialState } from '../state/gameState.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { createWorld } from '../world/createWorld.js';
import { applyCommand } from './applyCommand.js';
import { DEBUG_RESOURCES, parseCommand } from './types.js';

describe('debugResources', () => {
  const world = createWorld(FLAT_MAP, TOWN);
  const state = createInitialState(world, { owner: 'alice' });

  it('adds the same amount of every resource, iron and gold included, in a dev context', () => {
    const ctx = createSimContext(world, state, { dev: true });
    const result = applyCommand(ctx, state, 'alice', { type: 'debugResources' });
    expect(result.ok).toBe(true);
    for (const id of RESOURCE_IDS) {
      expect(result.state.stocks.alice?.[id]).toBe(STARTING_RESOURCES[id] + DEBUG_RESOURCES);
    }
  });

  it('is refused outside development, which is how the server runs', () => {
    const ctx = createSimContext(world, state);
    const result = applyCommand(ctx, state, 'alice', { type: 'debugResources' });
    expect(result).toMatchObject({ ok: false, check: { issues: ['devOnly'] } });
    expect(result.state).toBe(state);
  });

  it('parses without extra fields', () => {
    expect(parseCommand({ type: 'debugResources', amount: 1e9 })).toEqual({
      type: 'debugResources',
    });
  });
});
