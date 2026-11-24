import { PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT } from '@roe/game-data';
import type { Vec2 } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { now, report } from '../test/bench.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState } from '../state/gameState.js';
import { FLAT_MAP, FOREST_MAP, TOWN } from '../test/fixtures.js';
import { createWorld } from '../world/createWorld.js';
import { isWalkable, nearestWalkablePoint } from './navGrid.js';
import { hasLineOfSight } from './smoothPath.js';

const world = createWorld(FLAT_MAP, TOWN);
const ctx = createSimContext(world, createInitialState(world));

const routeLength = (from: Vec2, waypoints: readonly Vec2[]) => {
  let total = 0;
  let p = from;
  for (const w of waypoints) {
    total += Math.hypot(w.x - p.x, w.z - p.z);
    p = w;
  }
  return total;
};

describe('nav grid', () => {
  it('blocks water, buildings and the area outside the playable square', () => {
    expect(isWalkable(ctx.nav, 35, 35)).toBe(false);
    expect(isWalkable(ctx.nav, 0, 0)).toBe(false);
    expect(isWalkable(ctx.nav, 3.9, 3.9)).toBe(false);
    expect(isWalkable(ctx.nav, 70, 0)).toBe(false);
    expect(isWalkable(ctx.nav, -20, -20)).toBe(true);
    expect(isWalkable(ctx.nav, 0, 6)).toBe(true);
  });

  it('blocks trees', () => {
    const forest = createWorld(FOREST_MAP, TOWN);
    const forestCtx = createSimContext(forest, createInitialState(forest));
    const trees = forest.decorations.filter((d) => d.kind === 'tree');
    expect(trees.length).toBeGreaterThan(20);
    for (const tree of trees) expect(isWalkable(forestCtx.nav, tree.x, tree.z)).toBe(false);
  });

  it('resolves move targets to the nearest walkable point, or null', () => {
    expect(nearestWalkablePoint(ctx.nav, -20, -20)).toEqual({ x: -20, z: -20 });
    // Inside the lake (radius 8 at 35, 35): the nearest shore cell.
    const shore = nearestWalkablePoint(ctx.nav, 30, 35) ?? { x: NaN, z: NaN };
    expect(isWalkable(ctx.nav, shore.x, shore.z)).toBe(true);
    expect(Math.hypot(shore.x - 30, shore.z - 35)).toBeLessThan(6);
    // Far outside the map: nothing within reach.
    expect(nearestWalkablePoint(ctx.nav, 500, 500)).toBeNull();
  });
});

describe('findPath', () => {
  it('walks a straight line over open ground', () => {
    const result = ctx.paths.findPath({ x: -20, z: -20 }, { x: -10, z: -25 });
    expect(result.reachedGoal).toBe(true);
    expect(result.waypoints).toEqual([{ x: -10, z: -25 }]);
  });

  it('goes around a building, with every segment clear', () => {
    const from = { x: 0.3, z: -10 };
    const to = { x: -0.4, z: 10 };
    const result = ctx.paths.findPath(from, to);
    expect(result.reachedGoal).toBe(true);
    expect(result.waypoints.at(-1)).toEqual(to);
    expect(routeLength(from, result.waypoints)).toBeGreaterThan(22);
    let p: Vec2 = from;
    for (const w of result.waypoints) {
      expect(hasLineOfSight(ctx.nav, p, w)).toBe(true);
      p = w;
    }
  });

  it('ends next to a goal that is blocked', () => {
    const result = ctx.paths.findPath({ x: -20, z: 0 }, { x: 0, z: 0 });
    expect(result.reachedGoal).toBe(false);
    const end = result.waypoints.at(-1) as Vec2;
    expect(isWalkable(ctx.nav, end.x, end.z)).toBe(true);
    expect(Math.hypot(end.x, end.z)).toBeLessThan(8);
  });

  it('ends at the shore when the goal is in a lake', () => {
    const result = ctx.paths.findPath({ x: 10, z: 10 }, { x: 35, z: 35 });
    const end = result.waypoints.at(-1) as Vec2;
    expect(isWalkable(ctx.nav, end.x, end.z)).toBe(true);
    expect(Math.hypot(end.x - 35, end.z - 35)).toBeLessThan(11);
  });

  it('steps out of an obstacle when starting inside one', () => {
    const result = ctx.paths.findPath({ x: 1, z: 1 }, { x: 0, z: 20 });
    expect(result.reachedGoal).toBe(true);
    const first = result.waypoints[0] as Vec2;
    expect(isWalkable(ctx.nav, first.x, first.z)).toBe(true);
  });

  it('is deterministic', () => {
    const a = ctx.paths.findPath({ x: 0.3, z: -10 }, { x: -0.4, z: 10 });
    const b = ctx.paths.findPath({ x: 0.3, z: -10 }, { x: -0.4, z: 10 });
    expect(a).toEqual(b);
  });

  it('plans across the prototype map within a few milliseconds', () => {
    const proto = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
    const protoCtx = createSimContext(proto, createInitialState(proto));
    const pairs: [Vec2, Vec2][] = [
      [
        { x: 4, z: 2 },
        { x: 100, z: 100 },
      ],
      [
        { x: -100, z: 100 },
        { x: 100, z: -100 },
      ],
      [
        { x: 4, z: 2 },
        { x: -15, z: -20 },
      ],
    ];
    for (const [from, to] of pairs) protoCtx.paths.findPath(from, to); // warm up
    const start = now();
    const results = pairs.map(([from, to]) => protoCtx.paths.findPath(from, to));
    const ms = (now() - start) / pairs.length;
    report(
      `prototype A*: ${ms.toFixed(2)} ms/path, expanded ${results.map((r) => r.expanded).join(', ')}`,
    );
    expect(results.every((r) => r.waypoints.length > 0)).toBe(true);
    expect(ms).toBeLessThan(50);
  });
});
