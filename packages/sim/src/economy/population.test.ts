import {
  BUILDINGS,
  PROTOTYPE_MAP,
  PROTOTYPE_SETTLEMENT,
  STARTING_RESOURCES,
  UNITS,
} from '@roe/game-data';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type BuildingInstance, type GameState } from '../state/gameState.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { awaitsWorker } from '../units/workers.js';
import { createWorld } from '../world/createWorld.js';
import { populationOf } from './population.js';

const world = createWorld(FLAT_MAP, TOWN);
const TOWN_HALL = 1;
const RECRUIT: Command = { type: 'recruitSerf', buildingId: TOWN_HALL };

function game(initial: GameState = createInitialState(world, { owner: 'alice' })) {
  const ctx = createSimContext(world, initial);
  let state = initial;
  return {
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
    step(...commands: Command[]) {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer: 'alice', command })),
      );
      state = result.state;
      return result.results;
    },
  };
}

/** A complete (or under-construction) building added straight to the state. */
function withBuilding(
  state: GameState,
  type: BuildingInstance['type'],
  x: number,
  z: number,
  status: BuildingInstance['status'] = 'complete',
): GameState {
  const building: BuildingInstance = {
    id: state.nextEntityId,
    type,
    x,
    z,
    rotation: 0,
    ownerId: 'alice',
    status,
  };
  return {
    ...state,
    buildings: [...state.buildings, building],
    nextEntityId: state.nextEntityId + 1,
  };
}

const workers = (state: GameState) => state.units.filter((u) => u.type === 'worker');
const issuesOf = (result: ReturnType<ReturnType<typeof game>['step']>[number] | undefined) =>
  result?.ok === false ? result.check.issues : [];

describe('population', () => {
  it('counts every own unit against the housing of complete buildings', () => {
    let state = createInitialState(world, { owner: 'alice' });
    expect(populationOf(state, 'alice')).toEqual({ used: 5, capacity: 10 });
    state = withBuilding(state, 'house', -20, -20);
    expect(populationOf(state, 'alice').capacity).toBe(14);
    // A house still under construction houses nobody.
    state = withBuilding(state, 'house', 20, -20, 'construction');
    expect(populationOf(state, 'alice').capacity).toBe(14);
    expect(populationOf(state, 'bob')).toEqual({ used: 0, capacity: 0 });
    expect(populationOf(state, null)).toEqual({ used: 0, capacity: 0 });
  });
});

describe('recruiting', () => {
  it('costs food', () => {
    const g = game();
    const [result] = g.step(RECRUIT);
    expect(result?.ok).toBe(true);
    expect(g.state.stocks.alice?.food).toBe(STARTING_RESOURCES.food - (UNITS.serf.cost.food ?? 0));
  });

  it('needs enough food', () => {
    const initial = createInitialState(world, {
      owner: 'alice',
      resources: { ...STARTING_RESOURCES, food: 1 },
    });
    const g = game(initial);
    expect(issuesOf(g.step(RECRUIT)[0])).toEqual(['notEnoughResources']);
    expect(g.state.units).toHaveLength(5);
  });

  it('needs free housing', () => {
    const g = game();
    // The Town Hall houses 10: five starting serfs plus five recruits.
    for (let i = 0; i < 5; i++) expect(g.step(RECRUIT)[0]?.ok).toBe(true);
    expect(populationOf(g.state, 'alice')).toEqual({ used: 10, capacity: 10 });
    expect(issuesOf(g.step(RECRUIT)[0])).toEqual(['noHousing']);
    // A finished house makes room again.
    g.state = withBuilding(g.state, 'house', -20, -20);
    expect(g.step(RECRUIT)[0]?.ok).toBe(true);
  });

  it('reports every missing requirement', () => {
    const initial = createInitialState(world, {
      owner: 'alice',
      resources: { ...STARTING_RESOURCES, food: 0 },
    });
    // Five more serfs fill the Town Hall's 10 places.
    const extra = initial.units.map((u) => ({ ...u, id: u.id + 100 }));
    const g = game({ ...initial, units: [...initial.units, ...extra] });
    expect(issuesOf(g.step(RECRUIT)[0])).toEqual(['noHousing', 'notEnoughResources']);
  });
});

describe('workers and housing', () => {
  /** Alice's population filled to the Town Hall's 10, plus a finished lumbermill. */
  function fullTownWithLumbermill() {
    const g = game();
    for (let i = 0; i < 5; i++) g.step(RECRUIT);
    g.state = withBuilding(g.state, 'lumbermill', -20, 20);
    return g;
  }

  it('a finished production building waits for its worker while housing is full', () => {
    const g = fullTownWithLumbermill();
    g.step();
    g.step();
    expect(workers(g.state)).toHaveLength(0);
    const mill = g.state.buildings.at(-1) as BuildingInstance;
    expect(awaitsWorker(mill, g.state.units)).toBe(true);
  });

  it('the worker arrives once a house is finished', () => {
    const g = fullTownWithLumbermill();
    g.step();
    g.state = withBuilding(g.state, 'house', -20, -20);
    g.step();
    expect(workers(g.state)).toHaveLength(1);
    const mill = g.state.buildings.find((b) => b.type === 'lumbermill') as BuildingInstance;
    expect(awaitsWorker(mill, g.state.units)).toBe(false);
    expect(populationOf(g.state, 'alice')).toEqual({ used: 11, capacity: 14 });
    // Only one worker per building, however long it runs.
    for (let i = 0; i < 20; i++) g.step();
    expect(workers(g.state)).toHaveLength(1);
  });

  it('with one free place, the building with the lower id gets the worker', () => {
    const g = game();
    for (let i = 0; i < 4; i++) g.step(RECRUIT); // 9 of 10
    g.state = withBuilding(g.state, 'lumbermill', -20, 20);
    g.state = withBuilding(g.state, 'quarry', 20, 20);
    const [first, second] = g.state.buildings.slice(-2) as [BuildingInstance, BuildingInstance];
    g.step();
    expect(workers(g.state)).toHaveLength(1);
    const task = workers(g.state)[0]?.task;
    expect(task?.kind === 'work' && task.buildingId).toBe(first.id);
    expect(awaitsWorker(second, g.state.units)).toBe(true);
  });

  it('the starting settlement comes with its woodcutter and two farmers', () => {
    const prototype = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
    const state = createInitialState(prototype, { owner: 'alice' });
    const staffed = state.buildings.filter((b) => b.type === 'lumbermill' || b.type === 'field');
    expect(staffed).toHaveLength(3);
    for (const b of staffed) expect(awaitsWorker(b, state.units)).toBe(false);
    const population = populationOf(state, 'alice');
    expect(population.used).toBe(prototype.startingSerfs + 3);
    expect(population.capacity).toBe(BUILDINGS.townHall.housing + BUILDINGS.house.housing * 6);
  });
});
