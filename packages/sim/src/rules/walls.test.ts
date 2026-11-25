import { BUILDINGS, RESOURCE_IDS, WALL_RULES, type ResourceAmounts } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type PlayerId, type Vec2 } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { parseCommand, type Command, type PlaceWallCommand } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { createInitialState, footprintOf, type GameState } from '../state/gameState.js';
import { now, report } from '../test/bench.js';
import { FLAT_MAP, place, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { findCutOff } from './enclosure.js';
import { planWall, snapWallLine, wallSegments, type WallSegment } from './walls.js';

const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 500])) as ResourceAmounts;

const wall = (
  from: [number, number],
  to: [number, number],
  building: PlaceWallCommand['building'] = 'palisade',
): PlaceWallCommand => ({
  type: 'placeWall',
  building,
  from: { x: from[0], z: from[1] },
  to: { x: to[0], z: to[1] },
});

function game(resources: ResourceAmounts = RICH) {
  const world = createWorld(FLAT_MAP, TOWN);
  const initial = createInitialState(world, { owner: 'alice', resources });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    world,
    ctx,
    get state() {
      return state;
    },
    step(...commands: Command[]) {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer: 'alice' as PlayerId, command })),
      );
      state = result.state;
      return result.results;
    },
    walls: () => state.buildings.filter((b) => b.type !== 'townHall'),
    run(seconds: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < seconds * SIMULATION_TICK_RATE; i++) {
        if (until?.(state)) return;
        g.step();
      }
    },
  };
  return g;
}

/** A closed square ring of wall, `half` units from the center to each side. */
const ring = (half: number) => [
  wall([-half, -half], [half, -half]),
  wall([half, -half], [half, half]),
  wall([half, half], [-half, half]),
  wall([-half, half], [-half, -half]),
];

/** True when no walkable point inside the ring connects to the outside (4-neighbour fill). */
function sealed(ctx: ReturnType<typeof game>['ctx'], from: Vec2, limit: number) {
  const seen = new Set<string>();
  const stack = [{ x: Math.floor(from.x) + 0.5, z: Math.floor(from.z) + 0.5 }];
  while (stack.length > 0) {
    const p = stack.pop() as Vec2;
    const key = `${p.x},${p.z}`;
    if (seen.has(key) || !isWalkable(ctx.nav, p.x, p.z)) continue;
    seen.add(key);
    if (Math.max(Math.abs(p.x), Math.abs(p.z)) > limit) return false;
    stack.push(
      { x: p.x + 1, z: p.z },
      { x: p.x - 1, z: p.z },
      { x: p.x, z: p.z + 1 },
      { x: p.x, z: p.z - 1 },
    );
  }
  return true;
}

describe('wall lines', () => {
  it('snaps a drag to the 8 directions and whole segments', () => {
    const from = { x: 0.2, z: -0.3 };
    expect(snapWallLine(from, { x: 9.4, z: 1.5 }).to).toEqual({ x: 10, z: 0 });
    expect(snapWallLine(from, { x: 7, z: -6 }).to).toEqual({ x: 6, z: -6 });
    expect(snapWallLine(from, { x: -0.5, z: 8.7 }).to).toEqual({ x: 0, z: 8 });
    // Never shorter than one segment, never longer than the limit.
    expect(snapWallLine(from, from).to).toEqual({ x: 2, z: 0 });
    expect(snapWallLine(from, { x: 1000, z: 0 }).to.x).toBe(
      WALL_RULES.maxSegments * WALL_RULES.segmentLength,
    );
  });

  it('splits a line into segments with centers on the grid, the same from both ends', () => {
    const forward = wallSegments({ x: 0, z: 0 }, { x: 6, z: -6 }) as WallSegment[];
    expect(forward.map((s) => [s.x, s.z])).toEqual([
      [1, -1],
      [3, -3],
      [5, -5],
    ]);
    const back = wallSegments({ x: 6, z: -6 }, { x: 0, z: 0 }) as WallSegment[];
    expect(back.map((s) => s.rotation)).toEqual(forward.map((s) => s.rotation));
  });

  it('refuses lines that are off the grid, off the 8 directions or too long', () => {
    for (const [x, z] of [
      [5, 0],
      [4, 2],
      [0, 0],
      [2.5, 0],
    ]) {
      expect(wallSegments({ x: 0, z: 0 }, { x: x as number, z: z as number })).toBe('badWall');
    }
    expect(wallSegments({ x: 0, z: 0 }, { x: 200, z: 0 })).toBe('wallTooLong');
  });

  it('makes diagonal segments √2 longer', () => {
    expect(footprintOf('palisade', 0).w).toBe(2);
    expect(footprintOf('palisade', Math.PI / 4).w).toBeCloseTo(2 * Math.SQRT2);
    expect(footprintOf('house', Math.PI / 4)).toEqual(BUILDINGS.house.footprint);
  });
});

describe('placeWall', () => {
  it('creates one construction site per segment and charges for each', () => {
    const g = game();
    const [result] = g.step(wall([-8, 14], [4, 14]));
    expect(result?.ok).toBe(true);
    expect(g.walls()).toHaveLength(6);
    expect(g.walls().every((b) => b.status === 'construction' && b.ownerId === 'alice')).toBe(true);
    expect(g.state.stocks.alice?.wood).toBe(494);
    expect(new Set(g.walls().map((b) => b.id)).size).toBe(6);
  });

  it('skips standing and blocked segments, charging only for what it builds', () => {
    const g = game();
    g.step(wall([-8, 14], [0, 14]));
    // Extending the line over the old one: only the two new pieces count.
    g.step(wall([-8, 14], [4, 14]));
    expect(g.walls()).toHaveLength(6);
    expect(g.state.stocks.alice?.wood).toBe(494);
    expect(g.step(wall([-8, 14], [4, 14]))[0]).toMatchObject({
      ok: false,
      check: { issues: ['wallExists'] },
    });
    // A line through the Town Hall is built on both sides of it.
    const plan = planWall(g.world, g.state, 'palisade', { x: -12, z: 0 }, { x: 12, z: 0 });
    const blocked = plan.segments.filter((s) => s.status === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]?.issues).toContain('building');
    g.step(wall([-12, 0], [12, 0]));
    expect(g.walls()).toHaveLength(6 + 12 - blocked.length);
  });

  it('connects at corners and may cross other walls', () => {
    const g = game();
    for (const command of ring(12)) expect(g.step(command)[0]?.ok).toBe(true);
    expect(g.walls()).toHaveLength(48);
    expect(g.step(wall([0, 8], [0, 16]))[0]?.ok).toBe(true);
  });

  it('is refused as a whole when the stock cannot pay for it', () => {
    const g = game({ ...RICH, wood: 3 });
    expect(g.step(wall([-8, 14], [0, 14]))[0]).toMatchObject({
      ok: false,
      check: { issues: ['notEnoughResources'] },
    });
    expect(g.walls()).toHaveLength(0);
  });

  it('only walls are drawn, and walls are only drawn', () => {
    const g = game();
    expect(g.step(wall([-8, 14], [0, 14], 'house'))[0]).toMatchObject({
      ok: false,
      check: { issues: ['badWall'] },
    });
    expect(g.step(place('palisade', 0, 20))[0]?.ok).toBe(false);
  });

  it('keeps other buildings off the wall, but needs no gap to them', () => {
    const g = game();
    g.step(wall([-8, 14], [8, 14]));
    expect(g.step(place('house', 0, 14))[0]?.ok).toBe(false);
    expect(g.step(place('house', 0, 18))[0]?.ok).toBe(true);
  });

  it('keeps the same terrain heights when only walls change', () => {
    const g = game();
    const heights = g.ctx.heights;
    g.step(wall([-8, 14], [8, 14]));
    expect(g.ctx.heights).toBe(heights);
  });

  it('parses only well-formed commands', () => {
    const command = wall([0, 14], [8, 14]);
    expect(parseCommand({ ...command, playerId: 'bob', from: { x: 0, z: 14, y: 1 } })).toEqual(
      command,
    );
    expect(parseCommand({ ...command, from: null })).toBeNull();
    expect(parseCommand({ ...command, to: { x: Number.NaN, z: 0 } })).toBeNull();
  });
});

describe('walls block the way', () => {
  it('blocks a solid strip, also along diagonals and around a diamond', () => {
    const g = game();
    g.step(
      wall([0, -20], [20, 0]),
      wall([20, 0], [0, 20]),
      wall([0, 20], [-20, 0]),
      wall([-20, 0], [0, -20]),
    );
    expect(sealed(g.ctx, { x: 0, z: 10 }, 25)).toBe(true);
  });

  it('a square ring keeps units in', () => {
    const g = game();
    g.step(...ring(14));
    expect(sealed(g.ctx, { x: 0, z: 10 }, 18)).toBe(true);
    const serfs = g.state.units.filter((u) => u.ownerId === 'alice').map((u) => u.id);
    g.step({ type: 'moveUnits', unitIds: serfs, x: 0, z: 30 });
    g.run(20);
    for (const u of g.state.units.filter((u) => serfs.includes(u.id))) {
      expect(Math.abs(u.z)).toBeLessThan(14);
    }
  });

  it('serfs carry the material over and build the segments, which then have their health', () => {
    const g = game();
    g.step(wall([-4, 12], [4, 12]));
    g.run(90, (s) => s.buildings.every((b) => b.status === 'complete'));
    expect(g.walls()).toHaveLength(4);
    expect(g.walls().every((b) => b.status === 'complete')).toBe(true);
  });
});

describe('building rings', () => {
  const left = (s: GameState) => s.buildings.filter((b) => b.status === 'construction').length;

  it('serfs finish a whole ring, corners and diagonals included', () => {
    for (const lines of [
      ring(12),
      [
        wall([0, -16], [16, 0]),
        wall([16, 0], [0, 16]),
        wall([0, 16], [-16, 0]),
        wall([-16, 0], [0, -16]),
      ],
    ]) {
      const g = game();
      g.step(...lines);
      // Idle serfs only look for work nearby; send all five to the first site.
      const serfs = g.state.units.map((u) => u.id);
      g.step({ type: 'assignBuilders', unitIds: serfs, siteId: g.walls()[0]?.id ?? 0 });
      g.run(900, (s) => left(s) === 0);
      report(
        `ring of ${g.walls().length} segments: ${left(g.state)} unfinished at tick ${g.state.tick}`,
      );
      expect(left(g.state)).toBe(0);
    }
  });
});

describe('falling walls', () => {
  it('leaves a ruin, opens the way and is not counted as a lost building', () => {
    const g = game();
    g.step(wall([-2, 14], [0, 14]));
    expect(isWalkable(g.ctx.nav, -1, 14)).toBe(false);
    g.step({ type: 'debugSpawn', unit: 'spearman', count: 8, x: -1, z: 17, owner: 'enemy' });
    g.run(60, (s) => s.ruins.length > 0);
    expect(g.state.ruins.map((r) => r.type)).toEqual(['palisade']);
    expect(isWalkable(g.ctx.nav, -1, 14)).toBe(true);
    expect(g.state.stats.alice?.buildingsLost ?? 0).toBe(0);
  });
});

describe('cut-off warning', () => {
  const cutOff = (g: ReturnType<typeof game>, command: PlaceWallCommand) => {
    const plan = planWall(g.world, g.state, command.building, command.from, command.to);
    const fresh = plan.segments.filter((s) => s.status === 'ok');
    return findCutOff(g.ctx, g.state, 'alice', command.building, fresh);
  };

  it('is silent while a way out remains, and warns when the ring closes', () => {
    const g = game();
    const [north, east, south, west] = ring(14) as [
      PlaceWallCommand,
      PlaceWallCommand,
      PlaceWallCommand,
      PlaceWallCommand,
    ];
    for (const side of [north, east, south]) {
      expect(cutOff(g, side)).toEqual({ units: 0, sites: 0 });
      g.step(side);
    }
    const closing = cutOff(g, west);
    expect(closing.units).toBe(5);
  });

  it('ignores a ring that shuts nothing of the player in', () => {
    const g = game();
    g.step(wall([20, -40], [30, -40]), wall([30, -40], [30, -30]), wall([30, -30], [20, -30]));
    expect(cutOff(g, wall([20, -30], [20, -40])).units).toBe(0);
  });

  it('counts a construction site that gets shut in', () => {
    const g = game();
    g.step(place('house', -30, -30));
    const house = g.state.buildings.find((b) => b.type === 'house');
    expect(house).toBeDefined();
    g.step(wall([-38, -38], [-22, -38]), wall([-22, -38], [-22, -22]));
    g.step(wall([-22, -22], [-38, -22]));
    expect(cutOff(g, wall([-38, -22], [-38, -38])).sites).toBeGreaterThanOrEqual(1);
  });

  it('is cheap enough to run whenever the previewed line changes', () => {
    const g = game();
    const plan = planWall(g.world, g.state, 'palisade', { x: -40, z: 20 }, { x: 40, z: 20 });
    const runs = 20;
    const start = now();
    for (let i = 0; i < runs; i++) {
      findCutOff(g.ctx, g.state, 'alice', 'palisade', plan.segments);
    }
    const ms = (now() - start) / runs;
    report(`cut-off check, 40 segments on a 120 × 120 map: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(50);
  });
});
