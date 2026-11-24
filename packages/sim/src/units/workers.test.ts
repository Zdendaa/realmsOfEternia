import { BUILDINGS, STARTING_RESOURCES, type BuildingId } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type Decoration } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand.js';
import type { Command, PlaceBuildingCommand } from '../commands/types.js';
import { createSimContext, type SimContext } from '../context/simContext.js';
import { checkPlacement } from '../rules/placement.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isHarvestable } from '../state/resourceNodes.js';
import { RESOURCE_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';

const world = createWorld(RESOURCE_MAP, TOWN);

/** A valid spot for `building` close to the node of `kind` nearest the Town Hall. */
function spotNear(kind: Decoration['kind'], building: BuildingId, state: GameState) {
  const node = world.decorations
    .filter((d) => d.kind === kind && isHarvestable(world, d))
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0] as Decoration;
  for (let r = 4; r < 20; r++) {
    for (let a = 0; a < 16; a++) {
      const command: PlaceBuildingCommand = {
        type: 'placeBuilding',
        building,
        x: Math.round(node.x + r * Math.cos((a / 16) * Math.PI * 2)),
        z: Math.round(node.z + r * Math.sin((a / 16) * Math.PI * 2)),
        quarterTurns: 0,
      };
      if (checkPlacement(world, state, command).ok) return command;
    }
  }
  throw new Error('no spot');
}

function game() {
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx: SimContext = createSimContext(world, initial);
  let state: GameState = initial;
  return {
    ctx,
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
    run(ticks: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.(state)) return i;
        this.step();
      }
      return ticks;
    },
  };
}

/** Places `building` near `kind` and completes it (materials supplied, serfs build). */
function withProduction(kind: Decoration['kind'], building: BuildingId) {
  const g = game();
  g.step(spotNear(kind, building, g.state));
  const site = g.state.buildings.at(-1);
  if (!site) throw new Error('not placed');
  const progress = g.state.construction[site.id];
  if (!progress) throw new Error('no site');
  g.state = {
    ...g.state,
    construction: {
      ...g.state.construction,
      [site.id]: { ...progress, delivered: { ...BUILDINGS[building].cost } },
    },
  };
  g.run(200 * SIMULATION_TICK_RATE, (s) =>
    s.buildings.some((b) => b.id === site.id && b.status === 'complete'),
  );
  return { g, siteId: site.id };
}

const workers = (state: GameState) => state.units.filter((u) => u.type === 'worker');

describe('workers', () => {
  it('a finished lumbermill gets one worker, linked to it', () => {
    const { g, siteId } = withProduction('tree', 'lumbermill');
    g.step();
    expect(workers(g.state)).toHaveLength(1);
    const task = workers(g.state)[0]?.task;
    expect(task?.kind === 'work' && task.buildingId).toBe(siteId);
    g.run(10 * SIMULATION_TICK_RATE);
    expect(workers(g.state)).toHaveLength(1);
  });

  it('the woodcutter brings wood to the Town Hall on its own', () => {
    const { g } = withProduction('tree', 'lumbermill');
    const wood = g.state.stocks.alice?.wood ?? 0;
    // Serfs are kept out of it: send them away from the forest.
    g.state = { ...g.state, units: g.state.units.filter((u) => u.type === 'worker') };
    g.run(200 * SIMULATION_TICK_RATE, (s) => (s.stocks.alice?.wood ?? 0) >= wood + 3);
    expect(g.state.stocks.alice?.wood).toBeGreaterThanOrEqual(wood + 3);
  });

  it('the stonecutter of a quarry brings stone', () => {
    const { g } = withProduction('rock', 'quarry');
    const stone = g.state.stocks.alice?.stone ?? 0;
    g.state = { ...g.state, units: g.state.units.filter((u) => u.type === 'worker') };
    g.run(250 * SIMULATION_TICK_RATE, (s) => (s.stocks.alice?.stone ?? 0) >= stone + 2);
    expect(g.state.stocks.alice?.stone).toBeGreaterThanOrEqual(stone + 2);
  });

  it("can't be commanded", () => {
    const { g } = withProduction('tree', 'lumbermill');
    const worker = workers(g.state)[0];
    if (!worker) throw new Error('no worker');
    const result = applyCommand(g.ctx, g.state, 'alice', {
      type: 'moveUnits',
      unitIds: [worker.id],
      x: 5,
      z: 5,
    });
    expect(!result.ok && result.check.issues).toContain('noUnits');
  });

  it('come with the production buildings of an owned starting settlement', () => {
    const town = {
      ...TOWN,
      buildings: [...TOWN.buildings, { building: 'lumbermill' as const, x: 14, z: 0, rotation: 0 }],
    };
    const withMill = createWorld(RESOURCE_MAP, town);
    expect(workers(createInitialState(withMill, { owner: 'alice' }))).toHaveLength(1);
    expect(workers(createInitialState(withMill))).toHaveLength(0);
    expect(STARTING_RESOURCES.wood).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const play = () => {
      const { g } = withProduction('tree', 'lumbermill');
      g.run(60 * SIMULATION_TICK_RATE);
      return g.state;
    };
    expect(play()).toEqual(play());
  });
});
