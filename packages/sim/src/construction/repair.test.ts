import {
  buildingHealthOf,
  REPAIR_RULES,
  RESOURCE_IDS,
  type BuildingId,
  type ResourceAmounts,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type BuildingInstance, type GameState } from '../state/gameState.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { repairCost } from './repair.js';

const world = createWorld(FLAT_MAP, TOWN);
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
const stockWith = (amount: number) =>
  Object.fromEntries(RESOURCE_IDS.map((id) => [id, amount])) as ResourceAmounts;

/** Alice's town with five serfs and one more finished building east of it, id `targetId`. */
function game(type: BuildingId = 'barracks', damage = 600, stock = 50) {
  const initial = createInitialState(world, { owner: 'alice', players: ['bob'] });
  const targetId = initial.nextEntityId;
  const target: BuildingInstance = {
    id: targetId,
    type,
    x: 16,
    z: 0,
    rotation: 0,
    ownerId: 'alice',
    status: 'complete',
  };
  let state: GameState = {
    ...initial,
    buildings: [...initial.buildings, target],
    nextEntityId: targetId + 1,
    buildingDamage: damage > 0 ? { [targetId]: damage } : {},
    stocks: { ...initial.stocks, alice: stockWith(stock) },
  };
  const ctx = createSimContext(world, state);
  const serfs = () => state.units.filter((u) => u.type === 'serf').map((u) => u.id);
  const g = {
    targetId,
    serfs,
    get state() {
      return state;
    },
    set(change: (s: GameState) => GameState) {
      state = change(state);
    },
    damage: () => state.buildingDamage[targetId] ?? 0,
    repairers: () => state.units.filter((u) => u.task.kind === 'repair'),
    step(issuer: PlayerId = 'alice', ...commands: Command[]) {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      );
      state = result.state;
      return result.results;
    },
    repair(unitIds: EntityId[] = serfs(), issuer: PlayerId = 'alice') {
      const [result] = g.step(issuer, { type: 'repair', unitIds, buildingId: targetId });
      return result?.ok ? [] : (result?.check.issues ?? []);
    },
    run(ticks: number, until?: () => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.()) return i;
        g.step();
      }
      return ticks;
    },
  };
  return g;
}

describe('repair cost', () => {
  it('is a share of the build cost, by the damage, rounded per resource', () => {
    const full = buildingHealthOf('barracks'); // costs 8 wood, 6 stone
    expect(repairCost('barracks', full)).toEqual({ wood: 2, stone: 2 });
    expect(repairCost('barracks', full / 2)).toEqual({ wood: 1, stone: 1 });
    expect(repairCost('barracks', 20)).toEqual({});
  });

  it('is nothing for wall segments and the Town Hall', () => {
    for (const type of ['palisade', 'stoneWall', 'townHall'] as const) {
      expect(repairCost(type, buildingHealthOf(type) - 1)).toEqual({});
    }
  });
});

describe('repairing', () => {
  it('sends serfs to the work slots, restores health and pays as it goes', () => {
    const g = game('barracks', 1000);
    expect(g.repair()).toEqual([]);
    expect(g.repairers()).toHaveLength(4); // the barracks' maxBuilders; one waits at the door
    expect(new Set(g.repairers().map((u) => u.task.kind === 'repair' && u.task.slot)).size).toBe(4);
    expect(g.state.stocks.alice).toEqual(stockWith(50)); // nothing paid up front
    g.run(seconds(120), () => g.damage() === 0);
    expect(g.damage()).toBe(0);
    expect(g.state.buildingDamage).toEqual({});
    const cost = repairCost('barracks', 1000);
    expect(g.state.stocks.alice).toMatchObject({
      wood: 50 - (cost.wood ?? 0),
      stone: 50 - (cost.stone ?? 0),
      food: 50,
    });
    g.step();
    expect(g.repairers()).toHaveLength(0);
    expect(g.state.units.every((u) => u.task.kind !== 'repair')).toBe(true);
  });

  it('restores its rate of health per serf and second', () => {
    const g = game('townHall', 2000);
    g.repair(g.serfs().slice(0, 2));
    g.run(seconds(30), () => g.repairers().every((u) => u.activity === 'working'));
    const before = g.damage();
    g.run(seconds(10));
    expect(before - g.damage()).toBe(2 * REPAIR_RULES.healthPerSecond * 10);
  });

  it('works on walls, gates and towers, free for walls', () => {
    for (const type of ['palisade', 'stoneWall', 'stoneGate', 'woodenTower'] as const) {
      const g = game(type, 100);
      expect(g.repair()).toEqual([]);
      g.run(seconds(90), () => g.damage() === 0);
      expect(g.damage()).toBe(0);
    }
    const wall = game('stoneWall', 1000, 0);
    wall.repair();
    wall.run(seconds(150), () => wall.damage() === 0);
    expect(wall.damage()).toBe(0);
  });

  it('waits, idle, while the stock cannot pay, and goes on once it can', () => {
    const g = game('barracks', 1200, 0);
    expect(g.repair()).toEqual([]);
    g.run(seconds(60));
    const stuck = g.damage();
    expect(stuck).toBeGreaterThan(0);
    expect(g.repairers().every((u) => u.activity === 'idle')).toBe(true);
    g.run(seconds(5));
    expect(g.damage()).toBe(stuck);
    expect(g.state.stocks.alice).toEqual(stockWith(0));
    g.set((s) => ({ ...s, stocks: { ...s.stocks, alice: stockWith(10) } }));
    g.run(seconds(90), () => g.damage() === 0);
    expect(g.damage()).toBe(0);
  });

  it('stops on another order, and when the building falls', () => {
    const g = game();
    g.repair();
    const [first] = g.repairers();
    g.step('alice', { type: 'stop', unitIds: [first?.id as number] });
    expect(g.repairers().map((u) => u.id)).not.toContain(first?.id);
    g.set((s) => ({ ...s, buildings: s.buildings.filter((b) => b.id !== g.targetId) }));
    g.step();
    expect(g.repairers()).toHaveLength(0);
  });

  it('is refused when undamaged, unfinished, someone else’s, or without serfs', () => {
    expect(game('barracks', 0).repair()).toEqual(['notDamaged']);
    const site = game();
    site.set((s) => ({
      ...s,
      buildings: s.buildings.map((b) =>
        b.id === site.targetId ? { ...b, status: 'construction' } : b,
      ),
    }));
    expect(site.repair()).toEqual(['underConstruction']);
    expect(game().repair(game().serfs(), 'bob')).toEqual(['notOwner']);
    expect(game().repair([9999])).toEqual(['noUnits']);
  });

  it('parses only well-formed commands', () => {
    const command = { type: 'repair', unitIds: [1, 2], buildingId: 3 };
    expect(parseCommand({ ...command, issuer: 'bob' })).toEqual(command);
    expect(parseCommand({ ...command, unitIds: [] })).toBeNull();
    expect(parseCommand({ ...command, buildingId: -1 })).toBeNull();
  });
});
