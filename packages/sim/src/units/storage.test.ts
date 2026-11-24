import { STARTING_RESOURCES } from '@roe/game-data';
import { distanceToFootprint, type Decoration } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { checkPlacement } from '../rules/placement.js';
import {
  createInitialState,
  toPlacedFootprint,
  type BuildingInstance,
  type GameState,
} from '../state/gameState.js';
import { isHarvestable } from '../state/resourceNodes.js';
import { place, RESOURCE_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { nearestStorage, STORAGE_RULES } from './gathering.js';

const world = createWorld(RESOURCE_MAP, TOWN);
const TOWN_HALL = 1;

/** A tree 30–45 units from the Town Hall with room for a storehouse next to it. */
function farTreeWithStorehouse(state: GameState) {
  const trees = world.decorations
    .filter((d) => d.kind === 'tree' && isHarvestable(world, d))
    .map((d) => ({ d, r: Math.hypot(d.x, d.z) }))
    .filter(({ r }) => r > 30 && r < 45)
    .sort((a, b) => a.r - b.r);
  for (const { d } of trees) {
    for (let a = 0; a < 16; a++) {
      const x = Math.round(d.x + 7 * Math.cos((a / 16) * Math.PI * 2));
      const z = Math.round(d.z + 7 * Math.sin((a / 16) * Math.PI * 2));
      if (checkPlacement(world, state, place('storehouse', x, z)).ok) return { tree: d, x, z };
    }
  }
  throw new Error('no spot');
}

function withStorehouse(
  state: GameState,
  x: number,
  z: number,
  status: BuildingInstance['status'] = 'complete',
): GameState {
  const storehouse: BuildingInstance = {
    id: state.nextEntityId,
    type: 'storehouse',
    x,
    z,
    rotation: 0,
    ownerId: 'alice',
    status,
  };
  return {
    ...state,
    buildings: [...state.buildings, storehouse],
    nextEntityId: storehouse.id + 1,
  };
}

function run(initial: GameState, ticks: number, commands: Command[], each: (s: GameState) => void) {
  const ctx = createSimContext(world, initial);
  let state = initial;
  for (let i = 0; i < ticks; i++) {
    const issued = i === 0 ? commands.map((command) => ({ issuer: 'alice', command })) : [];
    state = stepGame(ctx, state, issued).state;
    each(state);
  }
  return state;
}

const distanceTo = (building: BuildingInstance, p: { x: number; z: number }) =>
  distanceToFootprint(toPlacedFootprint(building), p.x, p.z);

describe('storehouse', () => {
  const initial = createInitialState(world, { owner: 'alice' });
  const spot = farTreeWithStorehouse(initial);
  const state = withStorehouse(initial, spot.x, spot.z);
  const townHall = state.buildings.find((b) => b.id === TOWN_HALL) as BuildingInstance;
  const storehouse = state.buildings.at(-1) as BuildingInstance;

  it('is the nearest storage only once complete', () => {
    const near = { x: spot.x, z: spot.z + 5 };
    expect(nearestStorage(state.buildings, 'alice', near)?.type).toBe('storehouse');
    const site = withStorehouse(initial, spot.x, spot.z, 'construction');
    expect(nearestStorage(site.buildings, 'alice', near)?.type).toBe('townHall');
    expect(nearestStorage(state.buildings, 'bob', near)).toBeNull();
  });

  it('takes the goods of gatherers working nearby, who never walk to the Town Hall', () => {
    const serf = state.units.find((u) => u.type === 'serf') as (typeof state.units)[number];
    const tree = spot.tree as Decoration;
    let wood: number = STARTING_RESOURCES.wood;
    const depositedAt: number[] = [];
    let carriedSince = -1;
    let closestToHall = Infinity;
    run(state, 1500, [{ type: 'gather', unitIds: [serf.id], nodeId: tree.id }], (s) => {
      const unit = s.units.find((u) => u.id === serf.id);
      if (!unit) return;
      if (unit.carrying && carriedSince < 0) carriedSince = s.tick;
      if (carriedSince >= 0) closestToHall = Math.min(closestToHall, distanceTo(townHall, unit));
      const now = s.stocks.alice?.wood ?? 0;
      if (now > wood) depositedAt.push(distanceTo(storehouse, unit));
      wood = now;
    });
    expect(depositedAt.length).toBeGreaterThan(0);
    for (const d of depositedAt) expect(d).toBeLessThanOrEqual(STORAGE_RULES.depositReach);
    expect(closestToHall).toBeGreaterThan(15);
  });

  it('hands out building materials to builders nearby', () => {
    // A house site next to the storehouse; serfs start next to it.
    let site: { x: number; z: number } | null = null;
    for (let a = 0; a < 16 && !site; a++) {
      const x = Math.round(spot.x + 9 * Math.cos((a / 16) * Math.PI * 2));
      const z = Math.round(spot.z + 9 * Math.sin((a / 16) * Math.PI * 2));
      if (checkPlacement(world, state, place('house', x, z)).ok) site = { x, z };
    }
    if (!site) throw new Error('no house spot');
    const moved: GameState = {
      ...state,
      units: state.units.map((u, i) => ({ ...u, x: spot.x + i - 2, z: spot.z + 5 })),
    };
    let closestToHall = Infinity;
    const after = run(moved, 600, [place('house', site.x, site.z)], (st) => {
      for (const u of st.units) {
        if (u.task.kind === 'deliver')
          closestToHall = Math.min(closestToHall, distanceTo(townHall, u));
      }
    });
    const house = after.buildings.find((b) => b.type === 'house' && b.id > storehouse.id);
    const delivered = house ? (after.construction[house.id]?.delivered ?? {}) : {};
    const arrived = Object.values(delivered).reduce((sum, n) => sum + (n ?? 0), 0);
    // Materials arrived (or the house is already finished), all fetched at the storehouse.
    expect(arrived > 0 || house?.status === 'complete').toBe(true);
    expect(closestToHall).toBeGreaterThan(15);
  });
});
