import { SKIRMISH_MAP, SKIRMISH_SETTLEMENT } from '@roe/game-data';
import { turnPoint, type Vec2 } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { areAllies, areEnemies, MONSTER_PLAYER } from '../combat/hostility.js';
import { validateCommand } from '../commands/applyCommand.js';
import { createSimContext, ensureVision } from '../context/simContext.js';
import { createNavGrid, isWalkable, stampBuildings } from '../nav/navGrid.js';
import { decideOutcomes } from '../rules/outcome.js';
import type { GameState } from '../state/gameState.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { createUnit } from '../state/units.js';
import { stepGame } from '../tick/stepGame.js';
import { viewOf } from '../vision/view.js';
import { createWorld } from '../world/createWorld.js';
import { createMatch, matchSetupIssue, type MatchSetup, type SeatSetup } from './setup.js';

const COLORS = ['blue', 'red', 'green', 'yellow'] as const;

/** Players p1…, one per team number given, in slots 0…. */
function setupOf(teams: readonly number[]): MatchSetup {
  return {
    seed: 3,
    seats: teams.map((team, i): SeatSetup => ({
      player: `p${i + 1}`,
      slot: i,
      team,
      color: COLORS[i] ?? 'blue',
      controller: { kind: 'human' },
    })),
  };
}

function skirmishMatch(teams: readonly number[]) {
  const { world, state } = createMatch(SKIRMISH_MAP, SKIRMISH_SETTLEMENT, setupOf(teams));
  const ctx = createSimContext(world, state, {
    visions: setupOf(teams).seats.map((s) => s.player),
  });
  return { world, ctx, state };
}

const townHallOf = (state: GameState, player: string) => {
  const hall = state.buildings.find((b) => b.type === 'townHall' && b.ownerId === player);
  if (!hall) throw new Error(`no Town Hall for ${player}`);
  return hall;
};

/** `state` without `player`'s Town Hall, as if it had just fallen. */
const withoutTownHall = (state: GameState, player: string): GameState => ({
  ...state,
  buildings: state.buildings.filter((b) => b.id !== townHallOf(state, player).id),
});

describe('match setup', () => {
  it('refuses setups a map cannot play', () => {
    const [a, b] = setupOf([1, 2]).seats as [SeatSetup, SeatSetup];
    const issue = (seats: SeatSetup[]) => matchSetupIssue(SKIRMISH_MAP, { seed: 1, seats });
    expect(issue([a, b])).toBeNull();
    expect(issue([])).not.toBeNull();
    expect(issue([a, { ...b, player: a.player }])).not.toBeNull();
    expect(issue([a, { ...b, slot: a.slot }])).not.toBeNull();
    expect(issue([a, { ...b, slot: 4 }])).not.toBeNull();
    expect(issue([a, { ...b, color: a.color }])).not.toBeNull();
    expect(issue([a, { ...b, player: MONSTER_PLAYER }])).not.toBeNull();
  });

  it('gives every seat its own village, serfs, workers, heroes and stock', () => {
    const { world, state } = skirmishMatch([1, 2, 3, 4]);
    const counts = (player: string) => ({
      buildings: state.buildings.filter((b) => b.ownerId === player).length,
      serfs: state.units.filter((u) => u.ownerId === player && u.type === 'serf').length,
      workers: state.units.filter((u) => u.ownerId === player && u.type === 'worker').length,
      heroes: state.units.filter((u) => u.ownerId === player && u.hero).length,
    });
    expect(counts('p1')).toEqual({ buildings: 13, serfs: 5, workers: 4, heroes: 2 });
    for (const player of ['p2', 'p3', 'p4']) expect(counts(player)).toEqual(counts('p1'));
    expect(Object.keys(state.stocks)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state.teams).toEqual({ p1: 1, p2: 2, p3: 3, p4: 4 });
    expect(new Set(state.units.map((u) => u.id)).size).toBe(state.units.length);
    expect(world.slots).toHaveLength(4);
  });

  it('builds only the occupied slots', () => {
    const { world, state } = skirmishMatch([1, 2]);
    expect(world.slots.map((s) => s.index)).toEqual([0, 1]);
    expect(state.buildings).toHaveLength(26);
  });

  it('turns each village so that it faces the middle', () => {
    const { state } = skirmishMatch([1, 2, 3, 4]);
    const hall = townHallOf(state, 'p1');
    // Slot 0 is unturned at (-100, -100); the others are quarter turns of it.
    const local = { x: hall.x + 100, z: hall.z + 100 };
    ([2, 3, 1] as const).forEach((turn, i) => {
      const slot = SKIRMISH_MAP.startSlots[i + 1] as Vec2;
      const turned = turnPoint(local, turn);
      const other = townHallOf(state, `p${i + 2}`);
      expect(other.x).toBeCloseTo(slot.x + turned.x);
      expect(other.z).toBeCloseTo(slot.z + turned.z);
    });
  });
});

describe('the skirmish map', () => {
  const { world, state, ctx } = skirmishMatch([1, 2, 3, 4]);

  it('has trees, rocks and both ores near every start', () => {
    for (const slot of world.slots) {
      const near = (p: Vec2, r: number) => Math.hypot(p.x - slot.x, p.z - slot.z) <= r;
      const count = (kind: string) =>
        world.decorations.filter((d) => d.kind === kind && near(d, 52)).length;
      expect(count('tree')).toBeGreaterThanOrEqual(80);
      expect(count('rock')).toBeGreaterThanOrEqual(8);
      expect(
        world.deposits
          .filter((d) => near(d, 55))
          .map((d) => d.kind)
          .sort(),
      ).toEqual(['gold', 'iron']);
    }
  });

  it('keeps every deposit dry, level and walkable', () => {
    for (const deposit of world.deposits) {
      expect(world.water.isWater(deposit.x, deposit.z)).toBe(false);
      expect(isWalkable(ctx.nav, deposit.x, deposit.z)).toBe(true);
    }
  });

  it('connects every village with every other one and the middle', () => {
    const regions = ctx.regions('p1');
    const regionAt = (p: Vec2) => {
      const col = Math.floor(p.x - ctx.nav.originX);
      const row = Math.floor(p.z - ctx.nav.originZ);
      return regions.of[row * ctx.nav.cols + col];
    };
    // The spot in front of each Town Hall, where its serfs start.
    const points = state.units.filter((u) => u.type === 'serf');
    for (const serf of points) expect(regionAt(serf)).toBe(regions.main);
    for (const deposit of world.deposits) expect(regionAt(deposit)).toBe(regions.main);
  });
});

describe('allies', () => {
  it('are the same player or the same team; monsters fight everyone', () => {
    const teams = { a: 1, b: 1, c: 2 };
    expect(areAllies(teams, 'a', 'b')).toBe(true);
    expect(areEnemies(teams, 'a', 'b')).toBe(false);
    expect(areEnemies(teams, 'a', 'c')).toBe(true);
    expect(areEnemies(teams, 'a', MONSTER_PLAYER)).toBe(true);
    expect(areEnemies(teams, 'x', 'y')).toBe(true);
    expect(areAllies(teams, 'a', null)).toBe(false);
    expect(areEnemies(teams, 'a', null)).toBe(false);
  });

  it('share vision, and see each other completely', () => {
    const { world, ctx, state } = skirmishMatch([1, 2, 1, 2]);
    const view = viewOf(world, state, ensureVision(ctx, 'p1', state));
    const owners = new Set(view.units.map((u) => u.ownerId));
    expect(owners.has('p3')).toBe(true);
    expect(owners.has('p2')).toBe(false);
    expect(owners.has('p4')).toBe(false);
    expect(view.buildings.some((b) => b.ownerId === 'p3')).toBe(true);
    // Still only their own stock.
    expect(Object.keys(view.stocks)).toEqual(['p1']);
  });

  it('cannot attack each other', () => {
    const { ctx, state } = skirmishMatch([1, 1]);
    const hero = state.units.find((u) => u.ownerId === 'p1' && u.hero);
    if (!hero) throw new Error('no hero');
    const check = validateCommand(ctx, state, 'p1', {
      type: 'attack',
      unitIds: [hero.id],
      targetId: townHallOf(state, 'p2').id,
    });
    expect(check.issues).toEqual(['notEnemy']);
  });

  it('do not fight when they stand together; enemies do', () => {
    for (const [teams, fights] of [
      [[1, 1], false],
      [[1, 2], true],
    ] as const) {
      const match = skirmishMatch(teams);
      let state: GameState = {
        ...match.state,
        units: [
          ...match.state.units,
          createUnit(9001, 'swordsman', 'p1', { x: 30, z: -40 }),
          createUnit(9002, 'swordsman', 'p2', { x: 31.5, z: -40 }),
        ],
        nextEntityId: 9003,
      };
      for (let i = 0; i < 50; i++) state = stepGame(match.ctx, state).state;
      const hurt = state.units.filter((u) => u.id > 9000 && u.health < 100).length;
      expect(hurt > 0 || state.units.filter((u) => u.id > 9000).length < 2).toBe(fights);
    }
  });

  it("walk through each other's gates", () => {
    const grid = createNavGrid(createWorld(FLAT_MAP, TOWN));
    const area = { x: 0, z: -30, rotation: 0, footprint: { w: 2, d: 1 } };
    stampBuildings(grid, [{ area, gateOwner: 'a' }]);
    grid.teams = { a: 1, b: 1, c: 2 };
    expect(isWalkable(grid, 0, -30, 'a')).toBe(true);
    expect(isWalkable(grid, 0, -30, 'b')).toBe(true);
    expect(isWalkable(grid, 0, -30, 'c')).toBe(false);
    expect(isWalkable(grid, 0, -30)).toBe(false);
  });
});

describe('team victory', () => {
  const results = (outcome: GameState['outcome']) =>
    Object.fromEntries(Object.entries(outcome).map(([player, o]) => [player, o.result]));

  it('is not decided while every side has a Town Hall', () => {
    const { ctx, state } = skirmishMatch([1, 2]);
    expect(stepGame(ctx, state).state.outcome).toEqual({});
  });

  it('goes to the last player standing', () => {
    const { world, state } = skirmishMatch([1, 2]);
    const next = withoutTownHall(state, 'p2');
    expect(results(decideOutcomes(world, state, next))).toEqual({ p1: 'won', p2: 'lost' });
  });

  it('keeps a player in the game while an ally has a Town Hall', () => {
    const { world, state } = skirmishMatch([1, 2, 1, 2]);
    const next = withoutTownHall(state, 'p1');
    expect(decideOutcomes(world, state, next)).toEqual({});
  });

  it('is lost and won by whole teams', () => {
    const { world, state } = skirmishMatch([1, 2, 1, 2]);
    const first = withoutTownHall(state, 'p2');
    const second = withoutTownHall(first, 'p4');
    expect(results(decideOutcomes(world, first, second))).toEqual({
      p1: 'won',
      p2: 'lost',
      p3: 'won',
      p4: 'lost',
    });
  });

  it('goes on in a free-for-all until one side is left', () => {
    const { world, state } = skirmishMatch([1, 2, 3]);
    const next = withoutTownHall(state, 'p2');
    expect(results(decideOutcomes(world, state, next))).toEqual({ p2: 'lost' });
  });

  it('is never won alone on a map without an objective', () => {
    const { world, state } = skirmishMatch([1]);
    expect(decideOutcomes(world, state, state)).toEqual({});
  });
});
