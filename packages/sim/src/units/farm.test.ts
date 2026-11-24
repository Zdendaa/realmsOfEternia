import {
  BUILDINGS,
  PROFESSIONS,
  PROTOTYPE_MAP,
  PROTOTYPE_SETTLEMENT,
  type FarmProduction,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { createSimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { fieldOf, plotCount, plotWorkPoint, type FieldState } from '../state/fields.js';
import { createInitialState, type BuildingInstance, type GameState } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld, type SimWorld } from '../world/createWorld.js';

const world = createWorld(FLAT_MAP, TOWN);
const FARM = BUILDINGS.field.production as FarmProduction;
const PLOTS = plotCount('field');

/** The flat town with one complete, fresh field east of the Town Hall. */
function withField(x = 18, z = 0): GameState {
  const state = createInitialState(world, { owner: 'alice' });
  const field: BuildingInstance = {
    id: state.nextEntityId,
    type: 'field',
    x,
    z,
    rotation: 0,
    ownerId: 'alice',
    status: 'complete',
  };
  return { ...state, buildings: [...state.buildings, field], nextEntityId: field.id + 1 };
}

function game(initial: GameState, w: SimWorld = world) {
  const ctx = createSimContext(w, initial);
  let state = initial;
  return {
    ctx,
    get state() {
      return state;
    },
    step() {
      state = stepGame(ctx, state).state;
    },
    /** Steps until `until` holds (returns the ticks taken) or `max` ticks pass (-1). */
    runUntil(until: (s: GameState) => boolean, max: number) {
      for (let i = 0; i < max; i++) {
        if (until(state)) return i;
        this.step();
      }
      return until(state) ? max : -1;
    },
  };
}

const farmer = (s: GameState) =>
  s.units.find((u) => u.type === 'worker' && u.task.kind === 'work') as UnitInstance | undefined;
const fieldIn = (s: GameState): FieldState =>
  fieldOf(s.fields, (s.buildings.find((b) => b.type === 'field') as BuildingInstance).id);
const grain = (s: GameState) => s.stocks.alice?.grain ?? 0;

describe('farming', () => {
  it('gives a finished field a farmer, who sows every plot and then waits for the crop', () => {
    const g = game(withField());
    g.step();
    expect(farmer(g.state)).toBeDefined();
    expect(fieldIn(g.state).phase).toBe('sowing');

    const sown = g.runUntil((s) => fieldIn(s).phase === 'growing', 2000);
    expect(sown).toBeGreaterThan(PLOTS * FARM.sowSeconds * SIMULATION_TICK_RATE);
    const field = fieldIn(g.state);
    expect(field.plotsDone).toBe(0);
    expect(field.ripeAt).toBe(g.state.tick - 1 + FARM.growSeconds * SIMULATION_TICK_RATE);

    // While the crop grows the farmer waits at the field; nothing is harvested early.
    g.runUntil((s) => s.tick >= field.ripeAt - 1, 2000);
    expect(fieldIn(g.state).phase).toBe('growing');
    const task = farmer(g.state)?.task;
    expect(task?.kind === 'work' && task.phase).toBe('waiting');
    expect(grain(g.state)).toBe(0);
  });

  it('a full cycle yields one grain per plot, then the field is sown again', () => {
    const g = game(withField());
    const ticks = g.runUntil((s) => grain(s) === PLOTS, 6000);
    expect(ticks).toBeGreaterThan(0);
    expect(fieldIn(g.state).phase).toBe('sowing');
    expect(fieldIn(g.state).plotsDone).toBe(0);
    // No grain is created beyond the six plots before the next harvest.
    g.runUntil((s) => fieldIn(s).phase === 'growing', 2000);
    expect(grain(g.state)).toBe(PLOTS);
  });

  it('the farmer carries the crop of several plots per trip (its carry capacity)', () => {
    const g = game(withField());
    const capacity = PROFESSIONS.farmer.carryCapacity;
    const stocks: number[] = [];
    let largest = 0;
    g.runUntil((s) => {
      const amount = farmer(s)?.carrying?.amount ?? 0;
      largest = Math.max(largest, amount);
      if (stocks.at(-1) !== grain(s)) stocks.push(grain(s));
      return grain(s) === PLOTS;
    }, 6000);
    expect(largest).toBe(capacity);
    // Grain arrives in full loads: 0 → 3 → 6.
    expect(stocks).toEqual([0, capacity, PLOTS]);
  });

  it('the farmer works each plot from its work point in the furrow', () => {
    const g = game(withField());
    const field = g.state.buildings.at(-1) as BuildingInstance;
    g.runUntil((s) => {
      const task = farmer(s)?.task;
      return task?.kind === 'work' && task.phase === 'sowing' && task.target === 2;
    }, 2000);
    const unit = farmer(g.state) as UnitInstance;
    const at = plotWorkPoint(field, 2);
    expect(Math.hypot(unit.x - at.x, unit.z - at.z)).toBeLessThan(1);
    expect(unit.activity).toBe('working');
  });

  it('fields are walkable, other buildings block', () => {
    const g = game(withField());
    expect(isWalkable(g.ctx.nav, 18, 0)).toBe(true);
    expect(isWalkable(g.ctx.nav, 18 + 2.3, 4.1)).toBe(true);
    expect(isWalkable(g.ctx.nav, 0, 0)).toBe(false); // the Town Hall
  });

  it('is deterministic', () => {
    const a = game(withField());
    const b = game(withField());
    for (let i = 0; i < 1500; i++) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(a.state.fields).not.toEqual({});
  });

  it('the starting fields are ripe: their farmers bring in grain right away', () => {
    const prototype = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
    const g = game(createInitialState(prototype, { owner: 'alice' }), prototype);
    const fields = g.state.buildings.filter((b) => b.type === 'field');
    expect(fields).toHaveLength(2);
    for (const f of fields) expect(fieldOf(g.state.fields, f.id).phase).toBe('growing');
    const ticks = g.runUntil((s) => grain(s) >= 2, 60 * SIMULATION_TICK_RATE);
    expect(ticks).toBeGreaterThan(0);
  });
});
