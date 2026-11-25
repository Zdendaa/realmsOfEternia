/**
 * The balance Phase 7 aims for, as relations between towers and walls rather than exact
 * numbers, so the numbers in game-data can still be tuned. Each fight is simulated.
 */
import {
  BUILDINGS,
  PROTOTYPE_MAP,
  PROTOTYPE_SETTLEMENT,
  RESOURCE_IDS,
  type BuildingId,
  type ResourceAmounts,
  type SettlementLayout,
  type UnitKind,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command, PlaceWallCommand } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { report } from '../test/bench.js';
import { FLAT_MAP, place, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { MONSTER_PLAYER } from './hostility.js';

const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 900])) as ResourceAmounts;
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
const TOWERS = ['woodenTower', 'stoneTower', 'crossbowTower', 'magicTower', 'fireTower'] as const;
type TowerId = (typeof TOWERS)[number];

function game(map: MapDefinition, layout: SettlementLayout) {
  const world = createWorld(map, layout);
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    get state() {
      return state;
    },
    step(...commands: Command[]) {
      state = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer: 'alice', command })),
      ).state;
    },
    set(next: GameState) {
      state = next;
      g.step();
    },
    /** Places the lines and towers, then marks everything built. */
    fortify(walls: readonly Command[], towers: readonly [number, number, BuildingId][]) {
      g.step(...walls);
      const ids = towers.map(([x, z]) => {
        const id = state.nextEntityId;
        g.step(place('woodenTower', x, z));
        return id;
      });
      g.set({
        ...state,
        construction: {},
        buildings: state.buildings.map((b) => {
          const tower = towers[ids.indexOf(b.id)]?.[2];
          return { ...b, status: 'complete', type: tower ?? b.type };
        }),
      });
    },
  };
  return g;
}

type Army = readonly [UnitKind, number][];

/** One tower alone against an army marching on it from 15 units away. */
function duel(type: TowerId, army: Army) {
  const g = game(FLAT_MAP, { ...TOWN, startingSerfs: 0 });
  g.fortify([], [[0, 25, type]]);
  const tower = g.state.buildings.at(-1)?.id ?? 0;
  const ids: EntityId[] = [];
  army.forEach(([unit, count], k) => {
    const first = g.state.nextEntityId;
    g.step({ type: 'debugSpawn', unit, count, x: 15, z: 25 + 2 * k, owner: 'enemy' });
    for (let i = 0; i < count; i++) ids.push(first + i);
  });
  // An attack-move onto the tower, as a wave marches (monsters take no player orders).
  const goal = { x: 0, z: 25 };
  const march = { goal, waypoints: null, next: 0, stuckTicks: 0, bestDistance: Infinity };
  g.set({
    ...g.state,
    units: g.state.units.map((u) =>
      ids.includes(u.id)
        ? { ...u, task: { kind: 'attackMove', ...goal }, movement: { ...march, replans: 0 } }
        : u,
    ),
  });
  const alive = () => g.state.units.filter((u) => ids.includes(u.id) && isAlive(u)).length;
  const stands = () => g.state.buildings.some((b) => b.id === tower);
  for (let t = 0; t < seconds(150) && alive() > 0 && stands(); t++) g.step();
  return { killed: ids.length - alive(), won: alive() === 0 && stands() };
}

const MATCHUPS = {
  tightGroup: [['skeletonMinion', 10]],
  bigTightGroup: [['skeletonMinion', 20]],
  warriors: [['skeletonWarrior', 6]],
  wave: [
    ['skeletonWarrior', 2],
    ['skeletonMinion', 5],
    ['skeletonArcher', 2],
  ],
  swordsmen: [['swordsman', 6]],
  spearmen: [['spearman', 5]],
} as const satisfies Record<string, Army>;
type Matchup = keyof typeof MATCHUPS;

const results = new Map<string, ReturnType<typeof duel>>();
function fight(type: TowerId, matchup: Matchup) {
  const key = `${type}:${matchup}`;
  let result = results.get(key);
  if (!result) results.set(key, (result = duel(type, MATCHUPS[matchup])));
  return result;
}

describe('tower balance', () => {
  it('prints the table', () => {
    for (const matchup of Object.keys(MATCHUPS) as Matchup[]) {
      const total = MATCHUPS[matchup].reduce((sum, [, n]) => sum + n, 0);
      const row = TOWERS.map((type) => {
        const { killed, won } = fight(type, matchup);
        return `${type.replace('Tower', '')} ${killed}/${total}${won ? ' wins' : ''}`;
      });
      report(`towers vs ${matchup}: ${row.join(', ')}`);
    }
  });

  it('the wooden tower is weak and the stone tower alone cannot hold the wave', () => {
    expect(fight('woodenTower', 'tightGroup').won).toBe(false);
    expect(fight('woodenTower', 'wave').won).toBe(false);
    expect(fight('stoneTower', 'wave').won).toBe(false);
  });

  it('every upgrade is at least as good as the stone tower where it matters', () => {
    for (const matchup of Object.keys(MATCHUPS) as Matchup[]) {
      const stone = fight('stoneTower', matchup).killed;
      expect(fight('magicTower', matchup).killed, `magic ${matchup}`).toBeGreaterThanOrEqual(stone);
      expect(fight('crossbowTower', matchup).killed, `crossbow ${matchup}`).toBeGreaterThanOrEqual(
        stone,
      );
    }
    expect(fight('fireTower', 'wave').killed).toBeGreaterThan(fight('stoneTower', 'wave').killed);
  });

  it('the crossbow is the answer to tough and armored enemies', () => {
    expect(fight('crossbowTower', 'warriors').won).toBe(true);
    for (const other of ['stoneTower', 'magicTower', 'fireTower'] as const) {
      expect(fight(other, 'warriors').won).toBe(false);
      expect(fight('crossbowTower', 'swordsmen').killed).toBeGreaterThan(
        fight(other, 'swordsmen').killed,
      );
    }
  });

  it('fire is for tight groups, and poor against soldiers', () => {
    const best = (matchup: Matchup, type: TowerId) =>
      TOWERS.filter((t) => t !== type).every(
        (t) => fight(type, matchup).killed > fight(t, matchup).killed,
      );
    expect(best('bigTightGroup', 'fireTower')).toBe(true);
    // It no longer wins everything on its own.
    expect(fight('fireTower', 'bigTightGroup').won).toBe(false);
    expect(fight('fireTower', 'swordsmen').killed).toBe(0);
    expect(fight('fireTower', 'spearmen').killed).toBe(0);
  });
});

/** The real map and its wave, with only the Town Hall, so a ring can be closed around it. */
describe('the wave against walls and towers', () => {
  const HALL_ONLY: SettlementLayout = {
    ...PROTOTYPE_SETTLEMENT,
    buildings: PROTOTYPE_SETTLEMENT.buildings.filter((b) => b.building === 'townHall'),
    startingSerfs: 0,
  };
  const ring = (building: PlaceWallCommand['building']): PlaceWallCommand[] => {
    const corners = [
      { x: -14, z: -16 },
      { x: 10, z: -16 },
      { x: 10, z: 8 },
      { x: -14, z: 8 },
    ];
    return corners.map((from, i) => ({
      type: 'placeWall',
      building,
      from,
      to: corners[(i + 1) % 4] as { x: number; z: number },
    }));
  };
  const TWO_WOODEN: [number, number, BuildingId][] = [
    [-8, -11, 'woodenTower'],
    [2, -13, 'woodenTower'],
  ];

  function assault(walls: Command[], towers: [number, number, BuildingId][]) {
    const g = game(PROTOTYPE_MAP, HALL_ONLY);
    g.fortify(walls, towers);
    const built = g.state.buildings.length - 1 - towers.length;
    const first = g.state.nextEntityId;
    g.step({ type: 'debugWave' });
    const alive = () =>
      g.state.units.filter((u) => u.id >= first && u.ownerId === MONSTER_PLAYER && isAlive(u))
        .length;
    let t = 0;
    for (; t < seconds(600) && alive() > 0 && !g.state.outcome.alice; t++) g.step();
    return {
      segments: built,
      alive: alive(),
      time: Math.round(t / SIMULATION_TICK_RATE),
      lost: g.state.outcome.alice?.result === 'lost',
      hallHealth: BUILDINGS.townHall.health - (g.state.buildingDamage[1] ?? 0),
    };
  }

  it('walls alone only delay it: stone much longer than a palisade', () => {
    const open = assault([], []);
    const palisade = assault(ring('palisade'), []);
    const stone = assault(ring('stoneWall'), []);
    report(
      `wave vs the Town Hall: undefended lost at ${open.time} s, palisade ring at ` +
        `${palisade.time} s, stone ring at ${stone.time} s`,
    );
    expect(palisade.segments).toBe(48);
    expect([open.lost, palisade.lost, stone.lost]).toEqual([true, true, true]);
    expect(palisade.time - open.time).toBeGreaterThanOrEqual(15);
    expect(stone.time - open.time).toBeGreaterThanOrEqual(60);
  });

  it('a palisade ring with two wooden towers beats it, the Town Hall untouched', () => {
    const result = assault(ring('palisade'), TWO_WOODEN);
    report(`palisade ring + 2 wooden towers: wave beaten after ${result.time} s`);
    expect(result).toMatchObject({ alive: 0, lost: false, hallHealth: BUILDINGS.townHall.health });
  });

  it('the same two towers without a wall do not', () => {
    const result = assault([], TWO_WOODEN);
    expect(result.alive).toBeGreaterThan(0);
    expect(result.hallHealth).toBeLessThan(BUILDINGS.townHall.health);
  });
});
