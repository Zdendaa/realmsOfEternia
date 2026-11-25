import {
  combatOf,
  RESOURCE_IDS,
  UNITS,
  type ResourceAmounts,
  type SettlementLayout,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../commands/applyCommand.js';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { populationOf } from '../economy/population.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { FLAT_MAP, place } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { TRAINING_QUEUE_LIMIT, trainingProgress, trainTicks } from './training.js';

/** A Town Hall (housing 10) with five serfs, a barracks and an archery range. */
const CAMP: SettlementLayout = {
  buildings: [
    { building: 'townHall', x: 0, z: 0, rotation: 0 },
    { building: 'barracks', x: 16, z: 0, rotation: 0 },
    { building: 'archeryRange', x: -16, z: 0, rotation: 0 },
  ],
  paths: [],
  pathWidth: 2,
  squares: [],
  props: { around: [], models: [], perBuilding: { min: 0, max: 0 } },
  startingSerfs: 5,
};
const BARRACKS = 2;
const RANGE = 3;

const world = createWorld(FLAT_MAP, CAMP);
const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 100])) as ResourceAmounts;

function camp(resources: ResourceAmounts = RICH) {
  const initial = createInitialState(world, { owner: 'alice', players: ['bob'], resources });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const game = {
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
    step(issuer: PlayerId = 'alice', ...commands: Command[]): CommandResult[] {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      );
      state = result.state;
      return result.results;
    },
    run(ticks: number) {
      for (let i = 0; i < ticks; i++) game.step();
    },
    train(unit: 'swordsman' | 'spearman' | 'archer', buildingId: EntityId = BARRACKS) {
      return game.step('alice', { type: 'trainUnit', buildingId, unit })[0];
    },
    count(kind: string) {
      return state.units.filter((u) => u.type === kind && isAlive(u)).length;
    },
  };
  return game;
}

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

describe('training', () => {
  it('pays when queued and brings the unit out at the door after its training time', () => {
    const game = camp();
    const stock = game.state.stocks.alice as ResourceAmounts;
    expect(game.train('swordsman')?.ok).toBe(true);
    const paid = game.state.stocks.alice as ResourceAmounts;
    expect(paid.iron).toBe(stock.iron - (UNITS.swordsman.cost.iron ?? 0));
    expect(paid.food).toBe(stock.food - (UNITS.swordsman.cost.food ?? 0));
    expect(game.state.training[BARRACKS]?.queue).toEqual(['swordsman']);

    game.run(trainTicks('swordsman') - 2);
    expect(game.count('swordsman')).toBe(0);
    game.run(2);
    expect(game.count('swordsman')).toBe(1);
    expect(game.state.training[BARRACKS]).toBeUndefined();
    const soldier = game.state.units.find((u) => u.type === 'swordsman');
    // In front of the barracks (its entrance faces +Z), owned, at full health.
    expect(soldier).toMatchObject({ ownerId: 'alice', health: combatOf('swordsman').health });
    expect(Math.abs((soldier?.x ?? 0) - 16)).toBeLessThan(3);
    expect(soldier?.z ?? 0).toBeGreaterThan(3);
  });

  it('trains a queue one after another, in order', () => {
    const game = camp();
    game.train('spearman');
    game.train('swordsman');
    game.train('spearman');
    game.run(trainTicks('spearman'));
    expect([game.count('spearman'), game.count('swordsman')]).toEqual([1, 0]);
    game.run(trainTicks('swordsman'));
    expect([game.count('spearman'), game.count('swordsman')]).toEqual([1, 1]);
    game.run(trainTicks('spearman'));
    expect([game.count('spearman'), game.count('swordsman')]).toEqual([2, 1]);
  });

  it('reports progress of the unit in training', () => {
    const game = camp();
    game.train('archer', RANGE);
    game.run(seconds(9));
    const progress = trainingProgress(
      game.state.training[RANGE] as NonNullable<GameState['training'][number]>,
      game.state.tick,
    );
    expect(progress?.total).toBe(seconds(UNITS.archer.trainTime));
    expect(progress?.done).toBeGreaterThan(seconds(8));
    expect(progress?.done).toBeLessThan(seconds(10));
  });

  it('is validated: the right building, a free place in the queue, the cost, the owner', () => {
    const game = camp();
    expect(game.train('archer')).toMatchObject({ check: { issues: ['cannotTrain'] } });
    expect(game.train('swordsman', RANGE)).toMatchObject({ check: { issues: ['cannotTrain'] } });
    expect(game.train('swordsman', 1)).toMatchObject({ check: { issues: ['cannotTrain'] } });
    expect(game.train('swordsman', 999)).toMatchObject({ check: { issues: ['noBuilding'] } });
    for (let i = 0; i < TRAINING_QUEUE_LIMIT; i++) expect(game.train('spearman')?.ok).toBe(true);
    expect(game.train('spearman')).toMatchObject({ check: { issues: ['queueFull'] } });
    const [stolen] = game.step('bob', { type: 'trainUnit', buildingId: RANGE, unit: 'archer' });
    expect(stolen).toMatchObject({ check: { issues: ['notOwner'] } });

    const poor = camp({ ...RICH, iron: 0 });
    expect(poor.train('swordsman')).toMatchObject({ check: { issues: ['notEnoughResources'] } });
    expect(poor.train('archer', RANGE)?.ok).toBe(true);
  });

  it('cannot train at a barracks that is still a construction site', () => {
    const game = camp();
    const [placed] = game.step('alice', place('barracks', 0, 20));
    expect(placed?.ok).toBe(true);
    const site = game.state.buildings.at(-1)?.id as EntityId;
    expect(game.train('swordsman', site)).toMatchObject({
      check: { issues: ['underConstruction'] },
    });
  });

  it('cancelling refunds the cost; cancelling the unit in training starts the next anew', () => {
    const game = camp();
    const before = game.state.stocks.alice as ResourceAmounts;
    game.train('swordsman');
    game.train('spearman');
    game.run(seconds(10));
    const [cancel] = game.step('alice', { type: 'cancelTraining', buildingId: BARRACKS, index: 0 });
    expect(cancel?.ok).toBe(true);
    const queue = game.state.training[BARRACKS];
    expect(queue?.queue).toEqual(['spearman']);
    expect(queue?.readyAt).toBe(game.state.tick - 1 + trainTicks('spearman'));
    game.step('alice', { type: 'cancelTraining', buildingId: BARRACKS, index: 0 });
    expect(game.state.training[BARRACKS]).toBeUndefined();
    expect(game.state.stocks.alice).toEqual(before);
    const [nothing] = game.step('alice', {
      type: 'cancelTraining',
      buildingId: BARRACKS,
      index: 0,
    });
    expect(nothing).toMatchObject({ check: { issues: ['notQueued'] } });
  });

  it('a finished unit waits for free housing, then comes out', () => {
    const game = camp();
    // Fill the Town Hall’s 10 places (5 serfs + 5 more).
    game.step('alice', { type: 'debugSpawn', unit: 'serf', count: 5, x: 0, z: 10 });
    expect(populationOf(game.state, 'alice')).toEqual({ used: 10, capacity: 10 });
    game.train('spearman');
    game.run(trainTicks('spearman') + seconds(5));
    expect(game.count('spearman')).toBe(0);
    expect(game.state.training[BARRACKS]?.queue).toEqual(['spearman']);
    // A serf leaves (dies): the spearman comes out on the next tick.
    const serf = game.state.units.find((u) => u.type === 'serf') as { id: EntityId };
    game.state = {
      ...game.state,
      units: game.state.units.filter((u) => u.id !== serf.id),
    };
    game.run(1);
    expect(game.count('spearman')).toBe(1);
  });

  it('parses only well-formed training commands', () => {
    expect(parseCommand({ type: 'trainUnit', buildingId: 2, unit: 'archer' })).toEqual({
      type: 'trainUnit',
      buildingId: 2,
      unit: 'archer',
    });
    expect(parseCommand({ type: 'trainUnit', buildingId: 2, unit: 'dragon' })).toBeNull();
    expect(parseCommand({ type: 'trainUnit', buildingId: -1, unit: 'archer' })).toBeNull();
    expect(parseCommand({ type: 'cancelTraining', buildingId: 2, index: 0 })).toEqual({
      type: 'cancelTraining',
      buildingId: 2,
      index: 0,
    });
    expect(parseCommand({ type: 'cancelTraining', buildingId: 2, index: 1.5 })).toBeNull();
  });

  it('trained soldiers fight: they engage an enemy that comes near', () => {
    const game = camp();
    game.train('swordsman');
    game.run(trainTicks('swordsman') + 1);
    const soldier = game.state.units.find((u) => u.type === 'swordsman') as {
      x: number;
      z: number;
    };
    game.step('alice', {
      type: 'debugSpawn',
      unit: 'serf',
      count: 1,
      x: Math.round(soldier.x + 5),
      z: Math.round(soldier.z + 2),
      owner: 'bob',
    });
    game.run(seconds(15));
    expect(game.state.units.some((u) => u.ownerId === 'bob' && isAlive(u))).toBe(false);
  });
});
