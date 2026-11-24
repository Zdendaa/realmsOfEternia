import { RESOURCE_NODES, STARTING_RESOURCES } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type Decoration } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand.js';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { checkPlacement } from '../rules/placement.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { initialAmount, isHarvestable, remainingAmount } from '../state/resourceNodes.js';
import { RESOURCE_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';

const world = createWorld(RESOURCE_MAP, TOWN);

/** Harvestable nodes of a kind, nearest to the Town Hall (origin) first. */
const nearest = (kind: Decoration['kind']) =>
  world.decorations
    .filter((d) => d.kind === kind && isHarvestable(world, d))
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.id - b.id);

function game() {
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial);
  let state: GameState = initial;
  return {
    ctx,
    get state() {
      return state;
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

const serfIds = (state: GameState) => state.units.map((u) => u.id);

describe('resource nodes', () => {
  it('have amounts from their size, within the configured range', () => {
    for (const node of world.decorations) {
      const rule = RESOURCE_NODES[node.kind];
      const amount = initialAmount(node);
      expect(amount).toBeGreaterThanOrEqual(rule.minAmount);
      expect(amount).toBeLessThanOrEqual(rule.maxAmount);
    }
  });

  it('exist around the test Town Hall', () => {
    expect(nearest('tree').length).toBeGreaterThan(20);
    expect(nearest('rock').length).toBeGreaterThan(5);
  });
});

describe('gather command', () => {
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial);
  const tree = nearest('tree')[0] as Decoration;

  it('parses node ids, including 0', () => {
    expect(parseCommand({ type: 'gather', unitIds: [7], nodeId: 0 })).toEqual({
      type: 'gather',
      unitIds: [7],
      nodeId: 0,
    });
    expect(parseCommand({ type: 'gather', unitIds: [7], nodeId: -1 })).toBeNull();
    expect(parseCommand({ type: 'gather', unitIds: [7], nodeId: 1.5 })).toBeNull();
  });

  it('rejects unknown and depleted nodes and foreign serfs', () => {
    const unknown = applyCommand(ctx, initial, 'alice', {
      type: 'gather',
      unitIds: serfIds(initial),
      nodeId: 99999,
    });
    expect(!unknown.ok && unknown.check.issues).toEqual(['noResource']);
    const depleted = { ...initial, resourceNodes: { [tree.id]: 0 } };
    const gone = applyCommand(ctx, depleted, 'alice', {
      type: 'gather',
      unitIds: serfIds(initial),
      nodeId: tree.id,
    });
    expect(!gone.ok && gone.check.issues).toEqual(['noResource']);
    const foreign = applyCommand(ctx, initial, 'bob', {
      type: 'gather',
      unitIds: serfIds(initial),
      nodeId: tree.id,
    });
    expect(!foreign.ok && foreign.check.issues).toEqual(['noUnits']);
  });

  it('spreads a group over nearby nodes of the same kind', () => {
    const result = applyCommand(ctx, initial, 'alice', {
      type: 'gather',
      unitIds: serfIds(initial),
      nodeId: tree.id,
    });
    expect(result.ok).toBe(true);
    const targets = result.state.units.map((u) => (u.task.kind === 'gather' ? u.task.nodeId : -1));
    expect(targets).toContain(tree.id);
    expect(new Set(targets).size).toBeGreaterThan(1);
    for (const id of targets) expect(world.decorations[id]?.kind).toBe('tree');
  });
});

describe('gathering', () => {
  it('chops a tree, carries the wood to the Town Hall and repeats', () => {
    const g = game();
    const tree = nearest('tree')[0] as Decoration;
    const serf = g.state.units[0];
    if (!serf) throw new Error('no serf');
    g.step({ type: 'gather', unitIds: [serf.id], nodeId: tree.id });
    // Walk + 3 s per log + walk back, twice.
    g.run(
      120 * SIMULATION_TICK_RATE,
      (s) => (s.stocks.alice?.wood ?? 0) >= STARTING_RESOURCES.wood + 2,
    );
    expect(g.state.stocks.alice?.wood).toBe(STARTING_RESOURCES.wood + 2);
    expect(remainingAmount(world, g.state.resourceNodes, tree.id)).toBe(initialAmount(tree) - 2);
    const now = g.state.units.find((u) => u.id === serf.id);
    expect(now?.task.kind).toBe('gather');
  });

  it('depletes a node, unblocks its ground and moves on to the next one', () => {
    const g = game();
    const tree = nearest('tree')[0] as Decoration;
    expect(isWalkable(g.ctx.nav, tree.x, tree.z)).toBe(false);
    g.step({ type: 'gather', unitIds: serfIds(g.state).slice(0, 1), nodeId: tree.id });
    const amount = initialAmount(tree);
    g.run(400 * SIMULATION_TICK_RATE, (s) => s.resourceNodes[tree.id] === 0);
    expect(g.state.resourceNodes[tree.id]).toBe(0);
    expect(isWalkable(g.ctx.nav, tree.x, tree.z)).toBe(true);
    // The trunk no longer blocks a house placed right on it (on the grid next to it).
    const site = {
      type: 'placeBuilding',
      building: 'well',
      x: Math.round(tree.x),
      z: Math.round(tree.z),
      quarterTurns: 0,
    } as const;
    expect(checkPlacement(world, g.state, site).issues).not.toContain('tree');
    // The gatherer delivered everything and went on to another tree.
    g.run(
      60 * SIMULATION_TICK_RATE,
      (s) => (s.stocks.alice?.wood ?? 0) >= STARTING_RESOURCES.wood + amount,
    );
    expect(g.state.stocks.alice?.wood).toBeGreaterThanOrEqual(STARTING_RESOURCES.wood + amount);
    const task = g.state.units[0]?.task;
    expect(task?.kind === 'gather' && task.nodeId).not.toBe(tree.id);
  });

  it('quarries stone from rocks', () => {
    const g = game();
    const rock = nearest('rock')[0] as Decoration;
    g.step({ type: 'gather', unitIds: serfIds(g.state), nodeId: rock.id });
    g.run(
      150 * SIMULATION_TICK_RATE,
      (s) => (s.stocks.alice?.stone ?? 0) >= STARTING_RESOURCES.stone + 3,
    );
    expect(g.state.stocks.alice?.stone).toBeGreaterThanOrEqual(STARTING_RESOURCES.stone + 3);
  });

  it('delivers goods of another kind before switching', () => {
    const g = game();
    const serfId = serfIds(g.state)[0] as number;
    const tree = nearest('tree')[0] as Decoration;
    const rock = nearest('rock')[0] as Decoration;
    g.step({ type: 'gather', unitIds: [serfId], nodeId: tree.id });
    g.run(120 * SIMULATION_TICK_RATE, (s) => s.units[0]?.carrying !== null);
    expect(g.state.units[0]?.carrying).toEqual({ resource: 'wood', amount: 1 });
    g.step({ type: 'gather', unitIds: [serfId], nodeId: rock.id });
    const task = g.state.units[0]?.task;
    expect(task?.kind === 'gather' && task.phase).toBe('toStorage');
    g.run(120 * SIMULATION_TICK_RATE, (s) => s.units[0]?.carrying === null);
    expect(g.state.stocks.alice?.wood).toBe(STARTING_RESOURCES.wood + 1);
  });

  it('keeps state references stable while nothing is harvested', () => {
    const g = game();
    const before = g.state;
    g.step();
    expect(g.state.stocks).toBe(before.stocks);
    expect(g.state.resourceNodes).toBe(before.resourceNodes);
  });

  it('is deterministic', () => {
    const play = () => {
      const g = game();
      g.step({
        type: 'gather',
        unitIds: serfIds(g.state),
        nodeId: (nearest('tree')[0] as Decoration).id,
      });
      g.run(90 * SIMULATION_TICK_RATE);
      return g.state;
    };
    expect(play()).toEqual(play());
  });
});
