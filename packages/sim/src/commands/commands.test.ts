import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/gameState.js';
import { createStateHeights } from '../state/stateHeights.js';
import { FLAT_MAP, place, SETTLEMENT } from '../test/fixtures.js';
import { createWorld } from '../world/createWorld.js';
import { applyCommand } from './applyCommand.js';
import { parseCommand } from './types.js';

const world = createWorld(FLAT_MAP, SETTLEMENT);
const initial = createInitialState(world);

describe('parseCommand', () => {
  it('accepts a well-formed command and copies only known fields', () => {
    const parsed = parseCommand({
      type: 'placeBuilding',
      building: 'house',
      x: 4,
      z: -6,
      quarterTurns: 1,
      playerId: 'mallory',
      issuer: 'mallory',
      extra: true,
    });
    expect(parsed).toEqual({
      type: 'placeBuilding',
      building: 'house',
      x: 4,
      z: -6,
      quarterTurns: 1,
    });
    expect(parsed).not.toHaveProperty('playerId');
    expect(parsed).not.toHaveProperty('issuer');
  });

  it.each([
    ['null', null],
    ['a string', 'placeBuilding'],
    ['an unknown type', { type: 'demolish', building: 'house', x: 0, z: 0, quarterTurns: 0 }],
    [
      'an unknown building',
      { type: 'placeBuilding', building: 'castle', x: 0, z: 0, quarterTurns: 0 },
    ],
    [
      'a non-numeric x',
      { type: 'placeBuilding', building: 'house', x: '4', z: 0, quarterTurns: 0 },
    ],
    ['NaN', { type: 'placeBuilding', building: 'house', x: Number.NaN, z: 0, quarterTurns: 0 }],
    ['a missing rotation', { type: 'placeBuilding', building: 'house', x: 0, z: 0 }],
  ])('rejects %s', (_label, input) => {
    expect(parseCommand(input)).toBeNull();
  });
});

describe('applyCommand', () => {
  it('adds a building owned by the issuer, with the next entity id', () => {
    const result = applyCommand(world, initial, 'alice', place('house', -20, -20, 1));
    expect(result.ok).toBe(true);
    expect(result.state.buildings).toHaveLength(initial.buildings.length + 1);
    expect(result.state.buildings.at(-1)).toEqual({
      id: initial.nextEntityId,
      type: 'house',
      x: -20,
      z: -20,
      rotation: Math.PI / 2,
      ownerId: 'alice',
      status: 'complete',
    });
    expect(result.state.nextEntityId).toBe(initial.nextEntityId + 1);
  });

  it('never mutates the given state', () => {
    const snapshot: unknown = JSON.parse(JSON.stringify(initial));
    applyCommand(world, initial, 'alice', place('house', -20, -20));
    expect(initial).toEqual(snapshot);
  });

  it('returns the same state and the failed rules when rejected', () => {
    const result = applyCommand(world, initial, 'alice', place('house', 35, 35));
    expect(result.ok).toBe(false);
    expect(result.state).toBe(initial);
    if (!result.ok) expect(result.check.issues).toContain('water');
  });

  it('takes the owner from the issuer, never from the payload', () => {
    const command = parseCommand({ ...place('well', -10, -20), playerId: 'mallory' });
    expect(command).not.toBeNull();
    if (!command) return;
    const result = applyCommand(world, initial, 'alice', command);
    expect(result.state.buildings.at(-1)?.ownerId).toBe('alice');
  });

  it('rejects placing a second building on the same spot', () => {
    const first = applyCommand(world, initial, 'alice', place('house', -20, -20));
    const second = applyCommand(world, first.state, 'bob', place('house', -20, -20));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.check.issues).toContain('building');
  });

  it('is deterministic', () => {
    const a = applyCommand(world, initial, 'alice', place('market', 15, -15, 2));
    const b = applyCommand(world, initial, 'alice', place('market', 15, -15, 2));
    expect(a).toEqual(b);
  });
});

describe('createStateHeights', () => {
  it('matches the world heights for the initial state', () => {
    const heights = createStateHeights(world, initial);
    for (const [x, z] of [
      [0, 0],
      [10, 3],
      [-30, 12],
      [35, 35],
      [55, -5],
    ] as const) {
      expect(heights.getHeightAt(x, z)).toBe(world.heights.getHeightAt(x, z));
    }
  });

  it('flattens the ground under newly placed buildings', () => {
    const tiltedWorld = { ...world, terrain: { getHeightAt: (x: number) => x * 0.2 } };
    const result = applyCommand(tiltedWorld, initial, 'alice', place('house', -20, -20), {
      getHeightAt: () => 0,
    });
    const heights = createStateHeights(tiltedWorld, result.state);
    const level = heights.getHeightAt(-20, -20);
    expect(heights.getHeightAt(-21.5, -19)).toBeCloseTo(level, 9);
    expect(heights.getHeightAt(-18.5, -21)).toBeCloseTo(level, 9);
  });
});
