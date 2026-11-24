import { BUILDINGS } from '@roe/game-data';
import { footprintsOverlap, type HeightField } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/gameState.js';
import { FLAT_MAP, FOREST_MAP, place, SETTLEMENT } from '../test/fixtures.js';
import { createWorld } from '../world/createWorld.js';
import { checkPlacement, PLACEMENT_RULES } from './placement.js';

const world = createWorld(FLAT_MAP, SETTLEMENT);
const state = createInitialState(world);
const check = (command: ReturnType<typeof place>, heights?: HeightField) =>
  checkPlacement(world, state, command, heights);

describe('checkPlacement', () => {
  it('accepts a house on open, flat ground', () => {
    expect(check(place('house', -20, -20))).toEqual({ ok: true, issues: [] });
  });

  it('rejects buildings that are not player-buildable', () => {
    expect(check(place('townHall', -20, -20)).issues).toContain('notBuildable');
  });

  it('rejects unknown building types', () => {
    const command = { ...place('house', -20, -20), building: 'castle' } as unknown as ReturnType<
      typeof place
    >;
    expect(check(command)).toEqual({ ok: false, issues: ['unknownBuilding'] });
  });

  it('rejects positions off the 1-unit grid', () => {
    expect(check(place('house', -20.5, -20)).issues).toContain('offGrid');
    expect(check(place('house', -20, -19.25)).issues).toContain('offGrid');
  });

  it('only allows 0–3 quarter turns', () => {
    expect(check(place('house', -20, -20, 4)).issues).toContain('badRotation');
    expect(check(place('house', -20, -20, 1.5)).issues).toContain('badRotation');
    expect(check(place('house', -20, -20, -1)).issues).toContain('badRotation');
    expect(check(place('house', -20, -20, 3)).ok).toBe(true);
  });

  it('rejects footprints that leave the playable area', () => {
    // The playable area ends at x = 60; a house reaching past it is out.
    const halfWidth = BUILDINGS.house.footprint.w / 2;
    expect(check(place('house', Math.ceil(60 - halfWidth), 0)).issues).toContain('outOfBounds');
  });

  it('rejects building in water', () => {
    expect(check(place('house', 35, 35)).issues).toContain('water');
  });

  it('enforces a gap to existing buildings', () => {
    // Two houses side by side (the starting one at x = 0): the gap between their edges is
    // x − w. Up to 1 (the minimum gap, inclusive) is too close.
    const w = BUILDINGS.house.footprint.w;
    const closest = Math.floor(w + 1); // the last grid position with a gap ≤ 1
    expect(check(place('house', 1, 0)).issues).toContain('building'); // overlapping
    expect(check(place('house', closest, 0)).issues).toContain('building');
    expect(check(place('house', closest + 1, 0)).ok).toBe(true);
  });

  it('keeps buildings off paths', () => {
    // The path runs along x = 0 (half-width 1, plus a 0.5 gap).
    expect(check(place('house', 3, 12)).issues).toContain('path');
    expect(check(place('house', 4, 12)).ok).toBe(true);
  });

  it('applies the rotation to the footprint', () => {
    // A field is 9.5 wide and 12.5 deep; turned 90° it reaches 1.5 units closer to the path.
    expect(check(place('field', 7, 12, 0)).ok).toBe(true);
    expect(check(place('field', 7, 12, 1)).issues).toContain('path');
  });

  it('rejects slopes steeper than the limit', () => {
    const tilted = (slope: number): HeightField => ({ getHeightAt: (x) => x * slope });
    // A house is 5 wide: 0.5/unit → 2.5 difference, 0.25/unit → 1.25.
    expect(check(place('house', -20, -20), tilted(0.5)).issues).toContain('slope');
    expect(check(place('house', -20, -20), tilted(0.25)).ok).toBe(true);
    expect(PLACEMENT_RULES.maxHeightDifference).toBe(1.5);
  });

  it('is blocked by trees', () => {
    const forest = createWorld(FOREST_MAP, SETTLEMENT);
    const forestState = createInitialState(forest);
    const tree = forest.decorations.find(
      (d) => d.kind === 'tree' && Math.abs(d.x) < 40 && Math.abs(d.z) < 25 && Math.abs(d.x) > 8,
    );
    expect(tree).toBeDefined();
    if (!tree) return;
    const result = checkPlacement(
      forest,
      forestState,
      place('house', Math.round(tree.x), Math.round(tree.z)),
    );
    expect(result.issues).toContain('tree');
  });

  it('reports every failed rule', () => {
    expect(check(place('townHall', 35.5, 35, 7)).issues).toEqual(
      expect.arrayContaining(['notBuildable', 'offGrid', 'badRotation', 'water']),
    );
  });
});

describe('footprintsOverlap', () => {
  const house = (x: number, z: number, rotation = 0) => ({
    x,
    z,
    rotation,
    footprint: { w: 5, d: 5 },
  });

  it('detects overlap and separation of axis-aligned footprints', () => {
    expect(footprintsOverlap(house(0, 0), house(4, 0))).toBe(true);
    expect(footprintsOverlap(house(0, 0), house(6, 0))).toBe(false);
  });

  it('accounts for rotation', () => {
    // A 45° house reaches 3.54 units along x; at distance 5.8 it touches an axis-aligned one.
    expect(footprintsOverlap(house(0, 0), house(5.8, 0, Math.PI / 4))).toBe(true);
    expect(footprintsOverlap(house(0, 0), house(6.2, 0, Math.PI / 4))).toBe(false);
  });
});
