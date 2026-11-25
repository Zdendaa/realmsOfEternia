import { BUILDINGS, RESOURCE_IDS } from '@roe/game-data';
import type { ResourceAmounts, UnitKind } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command, PlaceWallCommand } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { FLAT_MAP, place, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { MONSTER_PLAYER } from './hostility.js';

const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 500])) as ResourceAmounts;
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
const RANGE = BUILDINGS.woodenTower.tower.attack.range;
/** Where the tests' tower stands. */
const TOWER = { x: 0, z: 25 };

function game(map: MapDefinition = FLAT_MAP) {
  const world = createWorld(map, { ...TOWN, startingSerfs: 0 });
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    get state() {
      return state;
    },
    towerId: 0,
    step(issuer = 'alice', ...commands: Command[]) {
      state = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      ).state;
    },
    run(ticks: number, until?: () => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.()) return;
        g.step();
      }
    },
    set(change: (s: GameState) => GameState) {
      state = change(state);
      g.step();
    },
    finish() {
      g.set((s) => ({
        ...s,
        construction: {},
        buildings: s.buildings.map((b) => ({ ...b, status: 'complete' })),
      }));
    },
    tower() {
      g.step('alice', place('woodenTower', TOWER.x, TOWER.z));
      g.towerId = state.buildings.at(-1)?.id ?? 0;
      g.finish();
    },
    spawn(owner: string, unit: UnitKind, x: number, z: number, count = 1) {
      const first = state.nextEntityId;
      g.step('alice', { type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i): EntityId => first + i);
    },
    units: (ids: readonly EntityId[]) =>
      state.units.filter((u) => ids.includes(u.id) && isAlive(u)),
    fromTower: (u: { x: number; z: number }) => Math.hypot(u.x - TOWER.x, u.z - TOWER.z),
    towerDamage: () => state.buildingDamage[g.towerId] ?? 0,
  };
  return g;
}

const ring = (from: [number, number], to: [number, number]): PlaceWallCommand => ({
  type: 'placeWall',
  building: 'palisade',
  from: { x: from[0], z: from[1] },
  to: { x: to[0], z: to[1] },
});
/** A closed square of palisade around the tower, 6 units to each side. */
const AROUND_TOWER = [
  ring([-6, 19], [6, 19]),
  ring([6, 19], [6, 31]),
  ring([6, 31], [-6, 31]),
  ring([-6, 31], [-6, 19]),
];

describe('units shot by a tower', () => {
  it('go for it, although it is beyond their sight', () => {
    const g = game();
    g.tower();
    // 10.5 away: in the tower's range, out of a skeleton's sight (8).
    const [skeleton] = g.spawn('enemy', 'skeletonMinion', RANGE - 0.5, TOWER.z);
    g.run(seconds(15), () => g.towerDamage() > 0);
    expect(g.towerDamage()).toBeGreaterThan(0);
    expect(g.units([skeleton as EntityId])[0]?.combat?.provokedBy ?? g.towerId).toBe(g.towerId);
  });

  it('bring the idle comrades standing close by', () => {
    const g = game();
    g.tower();
    const group = g.spawn('enemy', 'swordsman', RANGE + 0.5, TOWER.z, 6);
    g.run(seconds(3));
    const after = g.units(group);
    expect(after).toHaveLength(6);
    // Some spot it themselves; none is left standing around.
    expect(after.map((u) => u.combat?.targetId)).toEqual(Array(6).fill(g.towerId));
  });

  it('camp guards leave their camp for it, and go home once it falls', () => {
    const camp = { x: RANGE - 0.5, z: TOWER.z };
    const g = game({
      ...FLAT_MAP,
      id: 'test-camp-tower',
      camps: [{ ...camp, units: [{ unit: 'skeletonWarrior', count: 5 }] }],
    });
    const guards = g.state.units.filter((u) => u.ownerId === MONSTER_PLAYER).map((u) => u.id);
    g.tower();
    const standing = () => g.state.buildings.some((b) => b.id === g.towerId);
    g.run(seconds(90), () => !standing());
    expect(standing()).toBe(false);
    g.run(seconds(20));
    for (const u of g.units(guards)) {
      expect(Math.hypot(u.x - camp.x, u.z - camp.z)).toBeLessThan(2.5);
      expect(u.combat).toMatchObject({ provokedBy: null, targetId: null });
    }
    expect(g.units(guards).length).toBeGreaterThan(0);
  });

  it('turn from an attack-move to the tower, then march on', () => {
    const g = game();
    g.tower();
    const army = g.spawn('enemy', 'swordsman', -30, TOWER.z - 9.5, 8);
    g.step('enemy', { type: 'attackMove', unitIds: army, x: 30, z: TOWER.z - 9.5 });
    const standing = () => g.state.buildings.some((b) => b.id === g.towerId);
    g.run(seconds(60), () => !standing());
    expect(standing()).toBe(false);
    g.run(seconds(30));
    for (const u of g.units(army)) expect(u.x).toBeGreaterThan(20);
  });

  it('keep to a plain move', () => {
    const g = game();
    g.tower();
    const army = g.spawn('enemy', 'swordsman', -20, TOWER.z - 9, 4);
    g.step('enemy', { type: 'moveUnits', unitIds: army, x: 20, z: TOWER.z - 9 });
    for (let i = 0; i < seconds(25); i++) {
      g.step();
      for (const u of g.units(army)) {
        if (u.task.kind === 'move') expect(u.combat?.provokedBy).toBeNull();
      }
    }
    expect(g.towerDamage()).toBe(0);
  });

  it('retreat out of range when there is no getting at it', () => {
    const g = game();
    g.tower();
    g.step('alice', ...AROUND_TOWER);
    g.finish();
    // Neutral walls can't be breached: the tower is truly out of reach. (New ids, so the
    // nav grid is restamped: ownership never changes in a game.)
    g.set((s) => ({
      ...s,
      buildings: s.buildings.map((b) =>
        b.type === 'palisade' ? { ...b, id: b.id + 1000, ownerId: null } : b,
      ),
    }));
    const army = g.spawn('enemy', 'swordsman', RANGE - 1, TOWER.z, 4);
    g.run(seconds(15));
    const survivors = g.units(army);
    expect(survivors).toHaveLength(4);
    for (const u of survivors) expect(g.fromTower(u)).toBeGreaterThan(RANGE);
    const health = survivors.map((u) => u.health);
    g.run(seconds(10));
    expect(g.units(army).map((u) => u.health)).toEqual(health);
  });

  it('breach the wall around it to get there', () => {
    const g = game();
    g.tower();
    g.step('alice', ...AROUND_TOWER);
    g.finish();
    g.spawn('enemy', 'spearman', RANGE - 1, TOWER.z, 8);
    g.run(seconds(90), () => g.towerDamage() > 0 || g.state.ruins.length > 1);
    expect(g.state.ruins.some((r) => r.type === 'palisade')).toBe(true);
    g.run(seconds(30), () => g.towerDamage() > 0);
    expect(g.towerDamage()).toBeGreaterThan(0);
  });

  it('obey the next order', () => {
    const g = game();
    g.tower();
    const army = g.spawn('enemy', 'swordsman', RANGE - 0.5, TOWER.z, 3);
    g.run(seconds(2));
    g.step('enemy', { type: 'moveUnits', unitIds: army, x: 35, z: 0 });
    for (const u of g.units(army)) expect(u.combat?.provokedBy).toBeNull();
    g.run(seconds(12));
    for (const u of g.units(army)) expect(g.fromTower(u)).toBeGreaterThan(RANGE);
  });
});
