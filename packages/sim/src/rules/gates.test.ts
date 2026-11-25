import { BUILDINGS, RESOURCE_IDS, type ResourceAmounts } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type PlayerId, type Vec2 } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { parseCommand, type Command, type PlaceWallCommand } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { findCutOff } from './enclosure.js';
import { planWall } from './walls.js';

const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 500])) as ResourceAmounts;

const wall = (from: [number, number], to: [number, number]): PlaceWallCommand => ({
  type: 'placeWall',
  building: 'palisade',
  from: { x: from[0], z: from[1] },
  to: { x: to[0], z: to[1] },
});

/** A closed square around the Town Hall, 14 units to each side. */
const SQUARE = [
  wall([-14, -14], [14, -14]),
  wall([14, -14], [14, 14]),
  wall([14, 14], [-14, 14]),
  wall([-14, 14], [-14, -14]),
];
/** A diamond around the Town Hall: all its segments are diagonal. */
const DIAMOND = [
  wall([0, -20], [20, 0]),
  wall([20, 0], [0, 20]),
  wall([0, 20], [-20, 0]),
  wall([-20, 0], [0, -20]),
];

function game() {
  const world = createWorld(FLAT_MAP, TOWN);
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
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
    run(seconds: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < seconds * SIMULATION_TICK_RATE; i++) {
        if (until?.(state)) return;
        g.step();
      }
    },
    /** The wall segment or gate centered at (x, z). */
    at: (x: number, z: number) => state.buildings.find((b) => b.x === x && b.z === z),
    /** Marks every site complete (the construction itself is tested elsewhere). */
    finish() {
      state = {
        ...state,
        construction: {},
        buildings: state.buildings.map((b) => ({ ...b, status: 'complete' })),
      };
      g.step();
    },
    gate(x: number, z: number) {
      return g.step({ type: 'makeGate', segmentId: g.at(x, z)?.id ?? 0 })[0];
    },
    serfs: () => state.units.filter((u) => u.type === 'serf'),
  };
  return g;
}

/** Whether `passer` can get from `from` to farther than `limit` from the center. */
function escapes(g: ReturnType<typeof game>, passer: PlayerId | null, from: Vec2, limit: number) {
  const { waypoints } = g.ctx.paths.findPath(from, { x: 0, z: limit + 8 }, { passer });
  const end = waypoints.at(-1);
  return end !== undefined && Math.hypot(end.x, end.z - (limit + 8)) < 1;
}

describe('gates', () => {
  it('replace a wall segment with a gate site, at the gate cost', () => {
    const g = game();
    g.step(...SQUARE);
    g.finish();
    const wood = g.state.stocks.alice?.wood ?? 0;
    const segment = g.at(1, 14);
    expect(g.gate(1, 14)?.ok).toBe(true);
    const gate = g.at(1, 14);
    expect(gate).toMatchObject({ type: 'palisadeGate', status: 'construction' });
    expect(gate?.id).not.toBe(segment?.id);
    expect(gate?.rotation).toBe(segment?.rotation);
    expect(g.state.stocks.alice?.wood).toBe(wood - (BUILDINGS.palisadeGate.cost.wood ?? 0));
    expect(g.state.ruins).toHaveLength(0);
  });

  it('refund a segment that was still being built', () => {
    const g = game();
    g.step(wall([-8, 14], [0, 14]));
    const wood = g.state.stocks.alice?.wood ?? 0;
    g.gate(-7, 14);
    expect(g.state.stocks.alice?.wood).toBe(
      wood + (BUILDINGS.palisade.cost.wood ?? 0) - (BUILDINGS.palisadeGate.cost.wood ?? 0),
    );
  });

  it('are refused for what is not an undamaged, own wall segment', () => {
    const g = game();
    g.step(wall([-8, 14], [0, 14]));
    g.finish();
    const refusal = (segmentId: number) => {
      const result = g.step({ type: 'makeGate', segmentId })[0];
      return result && !result.ok ? result.check.issues : [];
    };
    expect(refusal(1)).toEqual(['notWallSegment']); // the Town Hall
    expect(refusal(999)).toEqual(['noBuilding']);
    g.gate(-7, 14);
    expect(refusal(g.at(-7, 14)?.id ?? 0)).toEqual(['notWallSegment']);
    expect(parseCommand({ type: 'makeGate', segmentId: 3, playerId: 'bob' })).toEqual({
      type: 'makeGate',
      segmentId: 3,
    });
  });

  for (const [name, ring, spot, limit] of [
    ['straight', SQUARE, [1, 14], 16],
    ['diagonal', DIAMOND, [11, 9], 22],
  ] as const) {
    it(`let their owner through a closed ring, nobody else (${name} segment)`, () => {
      const g = game();
      g.step(...ring);
      g.finish();
      const inside = { x: 0.5, z: 9.5 };
      expect(escapes(g, 'alice', inside, limit)).toBe(false);
      expect(g.gate(spot[0], spot[1])?.ok).toBe(true);
      // Under construction the gate is still a wall.
      expect(escapes(g, 'alice', inside, limit)).toBe(false);
      g.finish();
      expect(escapes(g, 'alice', inside, limit)).toBe(true);
      expect(escapes(g, 'enemy', inside, limit)).toBe(false);
      expect(escapes(g, null, inside, limit)).toBe(false);
      expect(isWalkable(g.ctx.nav, spot[0] + 0.5, spot[1] + 0.5)).toBe(false);
    });
  }

  it('serfs build the gate from inside and then walk out through it', () => {
    const g = game();
    g.step(...SQUARE);
    g.finish();
    g.gate(1, 14);
    const ids = g.serfs().map((u) => u.id);
    g.step({ type: 'assignBuilders', unitIds: ids, siteId: g.at(1, 14)?.id ?? 0 });
    g.run(120, (s) => s.buildings.every((b) => b.status === 'complete'));
    expect(g.at(1, 14)?.status).toBe('complete');
    g.step({ type: 'moveUnits', unitIds: ids, x: 0, z: 24 });
    g.run(30);
    for (const serf of g.serfs()) expect(serf.z).toBeGreaterThan(18);
  });

  it('keep enemies out until broken, and then let everyone through', () => {
    const g = game();
    g.step(...SQUARE);
    g.finish();
    g.gate(1, 14);
    g.finish();
    const gate = g.at(1, 14)?.id ?? 0;
    g.step({ type: 'debugSpawn', unit: 'spearman', count: 8, x: 1, z: 20, owner: 'enemy' });
    expect(escapes(g, 'enemy', { x: 0.5, z: 9.5 }, 16)).toBe(false);
    const enemies = g.state.units.filter((u) => u.ownerId === 'enemy').map((u) => u.id);
    let state = g.state;
    const attack = { type: 'attack', unitIds: enemies, targetId: gate } as const;
    state = stepGame(g.ctx, state, [{ issuer: 'enemy', command: attack }]).state;
    for (let i = 0; i < 900 && state.buildings.some((b) => b.id === gate); i++) {
      state = stepGame(g.ctx, state).state;
    }
    expect(state.ruins.map((r) => r.type)).toEqual(['palisadeGate']);
    expect(escapes(g, 'enemy', { x: 0.5, z: 9.5 }, 16)).toBe(true);
  });

  it('count as a way out for the cut-off warning, even while being built', () => {
    const g = game();
    const [north, east, south, west] = SQUARE as [
      PlaceWallCommand,
      PlaceWallCommand,
      PlaceWallCommand,
      PlaceWallCommand,
    ];
    g.step(north, east, south);
    const cutOff = () => {
      const plan = planWall(g.world, g.state, 'palisade', west.from, west.to);
      return findCutOff(g.ctx, g.state, 'alice', 'palisade', plan.segments);
    };
    expect(cutOff().units).toBe(5);
    g.gate(1, 14);
    expect(cutOff()).toEqual({ units: 0, sites: 0 });
  });
});
