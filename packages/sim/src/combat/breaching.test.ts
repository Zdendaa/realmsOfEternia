import { RESOURCE_IDS, type ResourceAmounts, type UnitKind } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command, PlaceWallCommand } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { now, report } from '../test/bench.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { findWayThrough } from './breaching.js';
import { MONSTER_PLAYER } from './hostility.js';

const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 900])) as ResourceAmounts;
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

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

/** A closed square of palisade around the Town Hall, `h` units to each side. */
const square = (h: number) => [
  wall([-h, -h], [h, -h]),
  wall([h, -h], [h, h]),
  wall([h, h], [-h, h]),
  wall([-h, h], [-h, -h]),
];
const diamond = (h: number) => [
  wall([0, -h], [h, 0]),
  wall([h, 0], [0, h]),
  wall([0, h], [-h, 0]),
  wall([-h, 0], [0, -h]),
];

/** A wave of eight from the north after 5 s, marching on the Town Hall. */
const SIEGE: MapDefinition = {
  ...FLAT_MAP,
  id: 'test-siege',
  waves: [{ at: 5, x: 0, z: -40, units: [{ unit: 'skeletonMinion', count: 8 }] }],
};

function game(map: MapDefinition = FLAT_MAP) {
  const world = createWorld(map, { ...TOWN, startingSerfs: 0 });
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    ctx,
    get state() {
      return state;
    },
    step(issuer = 'alice', ...commands: Command[]) {
      state = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      ).state;
    },
    run(ticks: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.(state)) return;
        g.step();
      }
    },
    /** Draws the lines and marks them built (construction is tested elsewhere). */
    build(...lines: Command[]) {
      g.step('alice', ...lines);
      state = {
        ...state,
        construction: {},
        buildings: state.buildings.map((b) => ({ ...b, status: 'complete' })),
      };
      g.step();
    },
    at: (x: number, z: number) => state.buildings.find((b) => b.x === x && b.z === z),
    spawn(owner: string, unit: UnitKind, x: number, z: number, count: number) {
      const first = state.nextEntityId;
      g.step('alice', { type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i): EntityId => first + i);
    },
    townHallDamage: () => state.buildingDamage[1] ?? 0,
    units: (owner: string) => state.units.filter((u) => u.ownerId === owner && isAlive(u)),
  };
  return g;
}

describe('breaching', () => {
  for (const [name, ring] of [
    ['square', square(14)],
    ['diamond', diamond(20)],
  ] as const) {
    it(`a wave breaks into a walled village (${name})`, () => {
      const g = game(SIEGE);
      g.build(...ring);
      g.run(seconds(120), () => g.townHallDamage() > 0);
      expect(g.state.ruins.length).toBeGreaterThanOrEqual(1);
      expect(g.state.ruins.every((r) => r.type === 'palisade')).toBe(true);
      // They broke only what was in the way, then went for the Town Hall.
      expect(g.state.ruins.length).toBeLessThanOrEqual(3);
      expect(g.townHallDamage()).toBeGreaterThan(0);
      report(
        `${name} ring: ${g.state.ruins.length} segment(s) broken, Town Hall reached at ` +
          `${(g.state.tick / SIMULATION_TICK_RATE).toFixed(0)} s`,
      );
    });
  }

  it('walks around instead when there is any way, and leaves the wall alone', () => {
    const g = game(SIEGE);
    // Three sides: the south stays open.
    const [north, east, , west] = square(14);
    g.build(north as Command, east as Command, west as Command);
    g.run(seconds(120), () => g.townHallDamage() > 0);
    expect(g.townHallDamage()).toBeGreaterThan(0);
    expect(g.state.ruins).toHaveLength(0);
    const hurt = Object.keys(g.state.buildingDamage).map(Number);
    expect(hurt).toEqual([1]);
  });

  it('picks the gate, the weak spot, when it is not much farther', () => {
    const g = game(SIEGE);
    g.build(...square(14));
    const segment = g.at(7, -14)?.id ?? 0;
    g.build({ type: 'makeGate', segmentId: segment });
    g.run(seconds(120), (s) => s.ruins.length > 0);
    expect(g.state.ruins[0]?.type).toBe('palisadeGate');
  });

  it('breaks through a second ring too', () => {
    const g = game(SIEGE);
    g.build(...square(12), ...square(20));
    g.run(seconds(200), () => g.townHallDamage() > 0);
    expect(g.townHallDamage()).toBeGreaterThan(0);
    const rings = new Set(
      g.state.ruins.map((r) => (Math.max(Math.abs(r.x), Math.abs(r.z)) > 16 ? 'outer' : 'inner')),
    );
    expect([...rings].sort()).toEqual(['inner', 'outer']);
  });

  it('breaches to get at an ordered target, and goes on to it', () => {
    const g = game();
    g.build(...square(14));
    const attackers = g.spawn('enemy', 'swordsman', 0, 24, 4);
    g.step('enemy', { type: 'attack', unitIds: attackers, targetId: 1 });
    g.run(seconds(90), () => g.townHallDamage() > 0);
    expect(g.state.ruins.length).toBeGreaterThanOrEqual(1);
    expect(g.townHallDamage()).toBeGreaterThan(0);
  });

  it('fights a defender standing in front of the wall before going on with it', () => {
    const g = game(SIEGE);
    g.build(...square(14));
    g.run(seconds(90), (s) => Object.keys(s.buildingDamage).length > 0);
    const [defender] = g.spawn('alice', 'swordsman', 0, -18, 1);
    const attacked = () => g.units(MONSTER_PLAYER).some((u) => u.combat?.targetId === defender);
    g.run(seconds(10), attacked);
    expect(attacked()).toBe(true);
  });

  it('never breaks your own walls, nor walls for a plain move', () => {
    const g = game();
    g.build(...square(14));
    const own = g.spawn('alice', 'swordsman', 0, 9, 3);
    g.step('alice', { type: 'attackMove', unitIds: own, x: 0, z: 26 });
    const enemy = g.spawn('enemy', 'swordsman', 20, 26, 3);
    g.step('enemy', { type: 'moveUnits', unitIds: enemy, x: 0, z: 9 });
    // While the enemy's plain move lasts, nobody breaks anything. (Once it ends they
    // stand idle, see the defenders and go for them.)
    for (let i = 0; i < seconds(20); i++) {
      g.step();
      for (const u of g.units('enemy')) {
        if (u.task.kind === 'move') expect(u.combat?.breachId).toBeNull();
      }
      expect(g.units('alice').every((u) => u.combat?.breachId === null && u.z < 14)).toBe(true);
    }
  });

  for (const order of ['moveUnits', 'stop'] as const) {
    it(`a ${order} order calls a unit off the wall it is breaking`, () => {
      const g = game();
      g.build(...square(14));
      const army = g.spawn('enemy', 'swordsman', 0, 20, 3);
      g.step('enemy', { type: 'attackMove', unitIds: army, x: 0, z: 8 });
      const breaking = () => g.units('enemy').every((u) => u.combat?.breachId !== null);
      g.run(seconds(20), breaking);
      expect(breaking()).toBe(true);
      g.step(
        'enemy',
        order === 'stop'
          ? { type: 'stop', unitIds: army }
          : { type: 'moveUnits', unitIds: army, x: 0, z: 30 },
      );
      expect(g.units('enemy').map((u) => u.combat?.breachId)).toEqual([null, null, null]);
    });
  }

  it('finds the way in or out from the smaller side, without exploring the map', () => {
    const g = game();
    g.build(...square(14));
    const [outside] = g.spawn('enemy', 'swordsman', 0, 30, 1);
    const [inside] = g.spawn('enemy', 'swordsman', 0, 9, 1);
    for (const [id, goal] of [
      [outside, { x: 0, z: 8 }],
      [inside, { x: 0, z: 30 }],
    ] as const) {
      const unit = g.state.units.find((u) => u.id === id);
      if (!unit) throw new Error('no unit');
      const route = findWayThrough(g.ctx, unit, goal);
      expect(route.reachedGoal).toBe(true);
      // The first wall on the way from the unit: the side of the square between them.
      expect(g.state.buildings.find((b) => b.id === route.breach)?.z).toBe(14);
      // Waypoints run from the unit to the goal.
      expect(route.waypoints.at(-1)).toEqual(goal);
      // The enclosure (about 700 cells) and the way on, not the 14,000-cell map.
      expect(route.expanded).toBeLessThan(1500);
    }
  });

  it('soldiers ignore walls that are not in their way', () => {
    const g = game();
    g.build(wall([-8, 20], [8, 20]));
    g.spawn('enemy', 'spearman', 0, 24, 4);
    g.run(seconds(20));
    expect(g.state.buildingDamage).toEqual({});
  });

  it('is deterministic', () => {
    const play = () => {
      const g = game(SIEGE);
      g.build(...square(14));
      g.run(seconds(60));
      return g.state;
    };
    expect(play()).toEqual(play());
  });

  it('stays affordable when many attackers have no way in', () => {
    const g = game();
    g.build(...square(14));
    const army = [0, 1, 2].flatMap((i) => g.spawn('enemy', 'swordsman', -20 + i * 20, 30, 30));
    g.step('enemy', { type: 'attackMove', unitIds: army, x: 0, z: 8 });
    let worst = 0;
    let total = 0;
    const ticks = seconds(20);
    for (let i = 0; i < ticks; i++) {
      const start = now();
      g.step();
      const ms = now() - start;
      worst = Math.max(worst, ms);
      total += ms;
    }
    report(
      `breaching with 90 attackers: ${(total / ticks).toFixed(2)} ms/tick on average, ` +
        `worst ${worst.toFixed(1)} ms (120 × 120 map)`,
    );
    expect(g.state.ruins.length).toBeGreaterThanOrEqual(1);
    expect(total / ticks).toBeLessThan(40);
  });
});
