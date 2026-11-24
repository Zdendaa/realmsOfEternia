import { BUILDINGS, PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT, UNITS } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type Vec2 } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { now, report } from '../test/bench.js';
import type { Command, IssuedCommand } from '../commands/types.js';
import { parseCommand } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';
import { FLAT_MAP, place, TOWN } from '../test/fixtures.js';
import { SERF_RULES } from '../units/serfBehavior.js';
import { createWorld } from '../world/createWorld.js';
import { stepGame } from './stepGame.js';

const world = createWorld(FLAT_MAP, TOWN);
/** Ticks a serf needs to walk `distance` units (plus a little for routing and turning). */
const walkTicks = (distance: number) =>
  Math.ceil((distance / UNITS.serf.speed + 2) * SIMULATION_TICK_RATE);
const TOWN_HALL = 1;

/** A fresh game owned by alice (bob also has a stock), with a synced context and a tiny driver. */
function game(
  initial: GameState = createInitialState(world, { owner: 'alice', players: ['bob'] }),
) {
  const ctx = createSimContext(world, initial);
  let state = initial;
  return {
    ctx,
    get state() {
      return state;
    },
    /** Runs one tick with the given commands (issued by alice unless stated). */
    step(...commands: (Command | IssuedCommand)[]) {
      const issued = commands.map((c) => ('issuer' in c ? c : { issuer: 'alice', command: c }));
      const result = stepGame(ctx, state, issued);
      state = result.state;
      return result.results;
    },
    run(ticks: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.(state)) return i;
        this.step();
      }
      return ticks;
    },
  };
}

/** Builders of any site, including those fetching material for it. */
const isBuilder = (u: UnitInstance) => u.task.kind === 'build' || u.task.kind === 'deliver';
const serfs = (state: GameState) => state.units.filter((u) => u.type === 'serf');
const ids = (units: readonly UnitInstance[]) => units.map((u) => u.id);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const minPairDistance = (units: readonly UnitInstance[]) => {
  let min = Infinity;
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      min = Math.min(min, dist(units[i] as Vec2, units[j] as Vec2));
    }
  }
  return min;
};

describe('initial state', () => {
  it('starts five serfs in front of the Town Hall, owned by the settlement owner', () => {
    const state = createInitialState(world, { owner: 'alice' });
    expect(serfs(state)).toHaveLength(5);
    for (const serf of serfs(state)) {
      expect(serf.ownerId).toBe('alice');
      expect(serf.z).toBeGreaterThan(4.25);
      expect(isWalkable(createSimContext(world, state).nav, serf.x, serf.z)).toBe(true);
    }
    expect(state.buildings[0]?.ownerId).toBe('alice');
  });

  it('keeps the settlement neutral without an owner (the server, for now)', () => {
    const state = createInitialState(world);
    expect(state.buildings[0]?.ownerId).toBeNull();
    expect(serfs(state).every((s) => s.ownerId === null)).toBe(true);
  });
});

describe('parseCommand (units)', () => {
  it('parses unit commands and drops duplicates and unknown fields', () => {
    expect(
      parseCommand({ type: 'moveUnits', unitIds: [3, 3, 4], x: 1, z: 2, issuer: 'm' }),
    ).toEqual({ type: 'moveUnits', unitIds: [3, 4], x: 1, z: 2 });
    expect(parseCommand({ type: 'recruitSerf', buildingId: 1 })).toEqual({
      type: 'recruitSerf',
      buildingId: 1,
    });
    expect(parseCommand({ type: 'assignBuilders', unitIds: [7], siteId: 2 })).toEqual({
      type: 'assignBuilders',
      unitIds: [7],
      siteId: 2,
    });
  });

  it.each([
    ['empty unit ids', { type: 'moveUnits', unitIds: [], x: 0, z: 0 }],
    ['fractional ids', { type: 'moveUnits', unitIds: [1.5], x: 0, z: 0 }],
    [
      'too many ids',
      { type: 'moveUnits', unitIds: [...Array(300).keys()].map((i) => i + 1), x: 0, z: 0 },
    ],
    ['a NaN target', { type: 'moveUnits', unitIds: [1], x: Number.NaN, z: 0 }],
    ['a string building id', { type: 'recruitSerf', buildingId: '1' }],
    ['a missing site', { type: 'assignBuilders', unitIds: [1] }],
  ])('rejects %s', (_label, input) => {
    expect(parseCommand(input)).toBeNull();
  });
});

describe('recruitSerf', () => {
  it('adds a serf at the Town Hall entrance', () => {
    const g = game();
    const [result] = g.step({ type: 'recruitSerf', buildingId: TOWN_HALL });
    expect(result?.ok).toBe(true);
    expect(serfs(g.state)).toHaveLength(6);
    const recruit = g.state.units.at(-1) as UnitInstance;
    expect(recruit.ownerId).toBe('alice');
    expect(recruit.z).toBeGreaterThan(4.25);
  });

  it('rejects other players, other buildings and sites', () => {
    const g = game();
    const [notOwner] = g.step({ issuer: 'bob', command: { type: 'recruitSerf', buildingId: 1 } });
    expect(notOwner?.ok === false && notOwner.check.issues).toEqual(['notOwner']);
    const [missing] = g.step({ type: 'recruitSerf', buildingId: 999 });
    expect(missing?.ok === false && missing.check.issues).toEqual(['noBuilding']);
    g.step(place('house', -20, -20));
    const siteId = g.state.buildings.at(-1)?.id as number;
    const [site] = g.step({ type: 'recruitSerf', buildingId: siteId });
    expect(site?.ok === false && site.check.issues).toEqual(['notTownHall']);
  });

  it('stops at the per-player serf limit', () => {
    const initial = createInitialState(world, { owner: 'alice' });
    const template = initial.units[0] as UnitInstance;
    const many = Array.from({ length: UNITS.serf.maxPerPlayer }, (_, i) => ({
      ...template,
      id: 100 + i,
    }));
    const g = game({ ...initial, units: many, nextEntityId: 1000 });
    const [result] = g.step({ type: 'recruitSerf', buildingId: TOWN_HALL });
    expect(result?.ok === false && result.check.issues).toEqual(['unitLimit']);
  });
});

describe('moveUnits', () => {
  it('walks a group to the target, spread out instead of stacked', () => {
    const g = game();
    const target = { x: -20, z: 15 };
    g.step({ type: 'moveUnits', unitIds: ids(serfs(g.state)), ...target });
    const ticks = g.run(40 * SIMULATION_TICK_RATE, (s) => s.units.every((u) => !u.movement));
    expect(ticks).toBeLessThan(walkTicks(30));
    g.step(); // finished moves turn idle on the next tick
    for (const serf of serfs(g.state)) {
      expect(dist(serf, target)).toBeLessThan(3);
      expect(serf.task.kind).toBe('idle');
    }
    expect(minPairDistance(serfs(g.state))).toBeGreaterThan(0.6);
  });

  it('walks around the Town Hall instead of through it', () => {
    const g = game();
    const serf = serfs(g.state)[0] as UnitInstance;
    g.step({ type: 'moveUnits', unitIds: [serf.id], x: 0, z: -12 });
    for (let i = 0; i < walkTicks(35); i++) {
      g.step();
      const now = g.state.units.find((u) => u.id === serf.id) as UnitInstance;
      expect(isWalkable(g.ctx.nav, now.x, now.z)).toBe(true);
    }
    const end = g.state.units.find((u) => u.id === serf.id) as UnitInstance;
    expect(dist(end, { x: 0, z: -12 })).toBeLessThan(1);
  });

  it('only moves the issuer’s own units and rejects targets off the map', () => {
    const g = game();
    const [theirs] = g.step({
      issuer: 'bob',
      command: { type: 'moveUnits', unitIds: ids(serfs(g.state)), x: 10, z: 10 },
    });
    expect(theirs?.ok === false && theirs.check.issues).toEqual(['noUnits']);
    const [far] = g.step({ type: 'moveUnits', unitIds: ids(serfs(g.state)), x: 500, z: 0 });
    expect(far?.ok === false && far.check.issues).toEqual(['outOfBounds']);
  });
});

/**
 * The state with every material of site `siteId` already delivered, for tests about
 * the building work itself (deliveries are tested in construction/delivery.test.ts).
 */
const supplied = (state: GameState, siteId: number): GameState => {
  const site = state.buildings.find((b) => b.id === siteId);
  const progress = state.construction[siteId];
  if (!site || !progress) throw new Error('no site');
  return {
    ...state,
    construction: {
      ...state.construction,
      [siteId]: { ...progress, delivered: { ...BUILDINGS[site.type].cost } },
    },
  };
};

describe('construction', () => {
  /** Ticks until a supplied house is complete. */
  const ticksToBuild = (serfCount: number) => {
    const initial = createInitialState(world, { owner: 'alice' });
    const placed = game({ ...initial, units: initial.units.slice(0, serfCount) });
    placed.step(place('house', 14, 6));
    const siteId = placed.state.buildings.at(-1)?.id as number;
    const g = game(supplied(placed.state, siteId));
    return g.run(200 * SIMULATION_TICK_RATE, (s) =>
      s.buildings.some((b) => b.id === siteId && b.status === 'complete'),
    );
  };

  it('idle serfs build a nearby site on their own; more builders work linearly faster', () => {
    const one = ticksToBuild(1);
    const three = ticksToBuild(3);
    const work = 30 * SIMULATION_TICK_RATE; // house: 30 s for one serf
    expect(one).toBeGreaterThanOrEqual(work);
    expect(one).toBeLessThan(work + walkTicks(20));
    expect(three).toBeGreaterThanOrEqual(work / 3);
    expect(three).toBeLessThan(work / 3 + walkTicks(20));
  });

  it('caps builders at maxBuilders; the others stay idle', () => {
    const g = game();
    g.step(place('house', 14, 6));
    g.run(5 * SIMULATION_TICK_RATE);
    const builders = g.state.units.filter((u) => isBuilder(u));
    expect(builders).toHaveLength(3);
  });

  it('completes the site, clears its progress and frees the builders', () => {
    const g = game();
    g.step(place('well', 10, 8));
    const siteId = g.state.buildings.at(-1)?.id as number;
    expect(g.state.buildings.at(-1)?.status).toBe('construction');
    // Three trips for the stone, then 15 s of work.
    g.run(120 * SIMULATION_TICK_RATE, (s) => s.buildings.at(-1)?.status === 'complete');
    expect(g.state.buildings.at(-1)?.status).toBe('complete');
    expect(g.state.construction[siteId]).toBeUndefined();
    g.step();
    expect(g.state.units.every((u) => u.task.kind !== 'build')).toBe(true);
  });

  it('ignores sites beyond the auto-assign radius until serfs are assigned by hand', () => {
    const g = game();
    const [placed] = g.step(place('house', -28, -30));
    expect(placed?.ok).toBe(true);
    const siteId = g.state.buildings.at(-1)?.id as number;
    g.run(3 * SIMULATION_TICK_RATE);
    expect(g.state.units.some((u) => isBuilder(u))).toBe(false);

    const [result] = g.step({ type: 'assignBuilders', unitIds: ids(serfs(g.state)), siteId });
    expect(result?.ok).toBe(true);
    expect(g.state.units.filter((u) => isBuilder(u))).toHaveLength(3);
    // With the materials there, all three start working when they arrive.
    const h = game(supplied(g.state, siteId));
    h.run(walkTicks(60), (st) => st.units.filter((u) => u.activity === 'working').length === 3);
    h.step();
    const working = h.state.units.filter((u) => u.activity === 'working');
    expect(working).toHaveLength(3);
    expect(h.state.construction[siteId]?.workDone).toBeGreaterThan(0);
    expect(SERF_RULES.autoAssignRadius).toBe(30);
  });

  it('rejects assigning to finished buildings and foreign sites', () => {
    const g = game();
    const [complete] = g.step({ type: 'assignBuilders', unitIds: ids(serfs(g.state)), siteId: 1 });
    expect(complete?.ok === false && complete.check.issues).toEqual(['notConstructionSite']);
    g.step({ issuer: 'bob', command: place('house', -35, 30) });
    const siteId = g.state.buildings.at(-1)?.id as number;
    const [foreign] = g.step({ type: 'assignBuilders', unitIds: ids(serfs(g.state)), siteId });
    expect(foreign?.ok === false && foreign.check.issues).toEqual(['notOwner']);
  });

  it('serfs standing where a site is placed step out of it', () => {
    const g = game();
    const serf = serfs(g.state)[0] as UnitInstance;
    g.step({ type: 'moveUnits', unitIds: [serf.id], x: -20, z: 20 });
    g.run(walkTicks(35), (s) => s.units.every((u) => !u.movement));
    g.step(place('house', -20, 20));
    g.run(5 * SIMULATION_TICK_RATE);
    const now = g.state.units.find((u) => u.id === serf.id) as UnitInstance;
    expect(isWalkable(g.ctx.nav, now.x, now.z)).toBe(true);
  });
});

describe('stepGame', () => {
  const script = (tick: number, state: GameState): Command[] => {
    if (tick === 0) return [place('house', 14, 6), place('well', -12, 10)];
    if (tick === 5) return [{ type: 'recruitSerf', buildingId: TOWN_HALL }];
    if (tick === 20)
      return [{ type: 'moveUnits', unitIds: ids(serfs(state)).slice(0, 2), x: -25, z: -5 }];
    return [];
  };
  const playScript = () => {
    const g = game();
    for (let t = 0; t < 400; t++) g.step(...script(t, g.state));
    return g.state;
  };

  it('is deterministic: the same commands give exactly the same state', () => {
    expect(playScript()).toEqual(playScript());
  });

  it('never mutates the given state and keeps unchanged buildings by reference', () => {
    const initial = createInitialState(world, { owner: 'alice' });
    const snapshot: unknown = JSON.parse(JSON.stringify(initial));
    const ctx = createSimContext(world, initial);
    const { state } = stepGame(ctx, initial, [{ issuer: 'alice', command: place('house', 14, 6) }]);
    const { state: after } = stepGame(ctx, state);
    expect(initial).toEqual(snapshot);
    expect(after.buildings).toBe(state.buildings);
    expect(after.tick).toBe(2);
  });

  it('ticks 300 serfs on the prototype map quickly', () => {
    const proto = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
    const initial = createInitialState(proto, { owner: 'alice' });
    const template = initial.units[0] as UnitInstance;
    const units = Array.from({ length: 300 }, (_, i) => ({
      ...template,
      id: 1000 + i,
      x: template.x + (i % 20) * 0.9,
      z: template.z + Math.floor(i / 20) * 0.9,
    }));
    const ctx = createSimContext(proto, initial);
    let state: GameState = { ...initial, units, nextEntityId: 2000 };
    const half = units.slice(0, 150).map((u) => u.id);
    const rest = units.slice(150).map((u) => u.id);
    state = stepGame(ctx, state, [
      { issuer: 'alice', command: { type: 'moveUnits', unitIds: half, x: 60, z: 40 } },
      { issuer: 'alice', command: { type: 'moveUnits', unitIds: rest, x: -50, z: -60 } },
    ]).state;
    const times: number[] = [];
    for (let t = 0; t < 300; t++) {
      const start = now();
      state = stepGame(ctx, state).state;
      times.push(now() - start);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p99 = times[Math.floor(times.length * 0.99)] as number;
    report(
      `300 serfs: mean ${mean.toFixed(2)} ms/tick, p99 ${p99.toFixed(2)} ms, max ${(times.at(-1) as number).toFixed(2)} ms`,
    );
    expect(mean).toBeLessThan(10);
  });
});
