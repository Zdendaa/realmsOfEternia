import {
  AI_DIFFICULTIES,
  BUILDINGS,
  RESOURCE_IDS,
  SKIRMISH_MAP,
  SKIRMISH_SETTLEMENT,
  UNITS,
  type ResourceAmounts,
  type ResourceCost,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type PlayerId } from '@roe/shared';
import { describe, expect, it, vi } from 'vitest';
import { applyCommand } from '../commands/applyCommand.js';
import type { IssuedCommand } from '../commands/types.js';
import { createSimContext, syncContext } from '../context/simContext.js';
import { createMatch, type MatchSetup, type SeatSetup } from '../match/setup.js';
import type { GameState } from '../state/gameState.js';
import { createUnit } from '../state/units.js';
import { stepGame } from '../tick/stepGame.js';
import { viewOf } from '../vision/view.js';
import { findBuildingSpot } from './buildingSpot.js';
import { aiKnowledge, HOME_RADIUS } from './knowledge.js';
import { isThinkTick, thinkInterval } from './schedule.js';
import { AI_LOG_LENGTH } from './state.js';
import { thinkAi } from './think.js';

// Whole matches are played headless here.
vi.setConfig({ testTimeout: 60_000 });

const minutes = (m: number) => m * 60 * SIMULATION_TICK_RATE;

/** Three computer players of different strength against a human who does nothing. */
const SETUP: MatchSetup = {
  seed: 11,
  seats: [
    { player: 'human', slot: 0, team: 1, color: 'blue', controller: { kind: 'human' } },
    ...(
      [
        ['ai-1', 1, 'red', 'easy', 'balanced'],
        ['ai-2', 2, 'green', 'normal', 'aggressive'],
        ['ai-3', 3, 'yellow', 'hard', 'defensive'],
      ] as const
    ).map(([player, slot, color, difficulty, personality]): SeatSetup => ({
      player,
      slot,
      team: slot + 1,
      color,
      controller: { kind: 'ai', difficulty, personality },
    })),
  ],
};
const AI_PLAYERS: PlayerId[] = ['ai-1', 'ai-2', 'ai-3'];

function match(setup: MatchSetup = SETUP) {
  const { world, state } = createMatch(SKIRMISH_MAP, SKIRMISH_SETTLEMENT, setup);
  return { world, state, ctx: createSimContext(world, state) };
}

/** Runs `ticks` ticks, keeping every command the computer players gave. */
function run(ctx: ReturnType<typeof match>['ctx'], from: GameState, ticks: number) {
  let state = from;
  const given: { tick: number; issuer: PlayerId; ok: boolean; command: IssuedCommand }[] = [];
  for (let i = 0; i < ticks; i++) {
    const tick = state.tick;
    const result = stepGame(ctx, state);
    for (const { issuer, command, result: outcome } of result.ai) {
      given.push({ tick, issuer, ok: outcome.ok, command: { issuer, command } });
    }
    state = result.state;
  }
  return { state, given };
}

const serfs = (state: GameState, player: PlayerId) =>
  state.units.filter((u) => u.ownerId === player && u.type === 'serf');

describe('computer player setup', () => {
  it('gives every computer seat a memory, and no human one', () => {
    const { state } = match();
    expect(Object.keys(state.ai)).toEqual(AI_PLAYERS);
    expect(Object.values(state.ai).map((ai) => ai.order)).toEqual([0, 1, 2]);
    expect(new Set(Object.values(state.ai).map((ai) => ai.seed)).size).toBe(3);
  });

  it('never lets two of them think on the same tick', () => {
    const difficulties = ['easy', 'normal', 'hard'] as const;
    for (const a of difficulties) {
      for (const b of difficulties) {
        for (const c of difficulties) {
          const players = [a, b, c, a].map((difficulty, order) => ({ difficulty, order }));
          for (let tick = 0; tick < 300; tick++) {
            expect(players.filter((p) => isThinkTick(p, tick)).length).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    expect(thinkInterval({ difficulty: 'easy' })).toBe(30);
    expect(thinkInterval({ difficulty: 'hard' })).toBe(5);
  });

  it('is left out of every player view', () => {
    const { world, state, ctx } = match();
    const knowledge = stepGame(ctx, state).state;
    const vision = ctx.visions.get('ai-1');
    if (!vision) throw new Error('no vision');
    expect(Object.keys(viewOf(world, knowledge, vision))).not.toContain('ai');
  });
});

describe('what a computer player knows', () => {
  it('is only what its side sees now', () => {
    const { ctx, state } = match();
    const knowledge = aiKnowledge(ctx, state, 'ai-1');
    expect(knowledge.units.length).toBeGreaterThan(0);
    expect(knowledge.units.every((u) => u.ownerId === 'ai-1')).toBe(true);
    expect(knowledge.buildings.every((b) => b.ownerId === 'ai-1')).toBe(true);
    // The other villages and the camps are far outside its sight.
    expect(knowledge.enemyUnits).toEqual([]);
    expect(knowledge.otherBuildings).toEqual([]);
    expect(knowledge.townHall?.type).toBe('townHall');
  });

  it('forgets what leaves its sight, whatever the context saw before', () => {
    const { ctx, state, world } = match();
    const scout = createUnit(9001, 'swordsman', 'ai-1', { x: -100, z: 100 });
    const near: GameState = { ...state, units: [...state.units, scout] };
    expect(aiKnowledge(ctx, near, 'ai-1').otherBuildings.length).toBeGreaterThan(0);
    const warm = aiKnowledge(ctx, state, 'ai-1');
    const cold = aiKnowledge(createSimContext(world, state), state, 'ai-1');
    expect(warm.otherBuildings).toEqual([]);
    expect(warm.enemyUnits).toEqual(cold.enemyUnits);
    expect(warm.otherBuildings).toEqual(cold.otherBuildings);
  });

  it('includes reachable trees and rocks of its home ground', () => {
    const { ctx, state } = match();
    for (const player of AI_PLAYERS) {
      const knowledge = aiKnowledge(ctx, state, player);
      const hall = knowledge.townHall;
      if (!hall) throw new Error('no Town Hall');
      for (const kind of ['tree', 'rock'] as const) {
        const nodes = knowledge.nodesAround(kind, hall, HOME_RADIUS, 4);
        expect(nodes.length).toBeGreaterThan(0);
        for (const node of nodes) {
          expect(Math.hypot(node.x - hall.x, node.z - hall.z)).toBeLessThanOrEqual(HOME_RADIUS);
        }
      }
    }
  });
});

describe('finding a building spot', () => {
  const BUILDINGS_TO_PLACE = [
    'house',
    'barracks',
    'archeryRange',
    'field',
    'house',
    'storehouse',
    'woodenTower',
    'house',
  ] as const;

  it('finds spots the placement rules accept, one after another, on every start', () => {
    const start = match();
    for (const player of ['human', ...AI_PLAYERS]) {
      const rich = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 999])) as ResourceAmounts;
      let state: GameState = { ...start.state, stocks: { ...start.state.stocks, [player]: rich } };
      syncContext(start.ctx, state);
      for (const building of BUILDINGS_TO_PLACE) {
        const spot = findBuildingSpot(start.ctx, state, player, building);
        expect(spot, `${player} ${building}`).not.toBeNull();
        if (!spot) continue;
        const result = applyCommand(start.ctx, state, player, spot);
        expect(result.ok).toBe(true);
        state = result.state;
        syncContext(start.ctx, state);
      }
    }
  });

  it('puts mines on their own deposit', () => {
    const { ctx, state, world } = match();
    for (const building of ['ironMine', 'goldMine'] as const) {
      const spot = findBuildingSpot(ctx, state, 'ai-1', building, { radius: 60 });
      expect(spot).not.toBeNull();
      const kind = building === 'ironMine' ? 'iron' : 'gold';
      expect(
        world.deposits.some(
          (d) =>
            d.kind === kind && Math.hypot(d.x - (spot?.x ?? 0), d.z - (spot?.z ?? 0)) <= d.radius,
        ),
      ).toBe(true);
    }
  });

  it('gives the same spot every time', () => {
    const { ctx, state, world } = match();
    const other = createSimContext(world, state);
    expect(findBuildingSpot(ctx, state, 'ai-2', 'house')).toEqual(
      findBuildingSpot(other, state, 'ai-2', 'house'),
    );
  });
});

describe('serfs', () => {
  const played = (() => {
    const start = match();
    return { ...start, ...run(start.ctx, start.state, minutes(5)) };
  })();

  it('recruits serfs and puts them to work on wood and stone', () => {
    for (const player of AI_PLAYERS) {
      const own = serfs(played.state, player);
      expect(own.length).toBeGreaterThan(serfs(match().state, player).length);
      // (Which of the two they are on at any one moment depends on what it is short of.)
      const kinds = new Set(
        played.given.flatMap(({ issuer, command: { command } }) =>
          issuer === player && command.type === 'gather'
            ? [played.world.decorations[command.nodeId]?.kind]
            : [],
        ),
      );
      expect(kinds).toEqual(new Set(['tree', 'rock']));
      // At least all but two are busy at any moment.
      expect(own.filter((u) => u.task.kind === 'idle').length).toBeLessThanOrEqual(2);
    }
  });

  it('gathers far more than it started with, spent or not', () => {
    const before = match().state.stocks;
    for (const player of AI_PLAYERS) {
      // What it has, and what it paid for the buildings it started and units it trained.
      const spent = played.given.reduce((sum, { issuer, command: { command } }) => {
        if (issuer !== player) return sum;
        const cost: ResourceCost =
          command.type === 'placeBuilding'
            ? BUILDINGS[command.building].cost
            : command.type === 'trainUnit'
              ? UNITS[command.unit].cost
              : {};
        return sum + (cost.wood ?? 0) + (cost.stone ?? 0);
      }, 0);
      const stock = played.state.stocks[player];
      expect((stock?.wood ?? 0) + (stock?.stone ?? 0) + spent).toBeGreaterThan(
        (before[player]?.wood ?? 0) + (before[player]?.stone ?? 0) + 40,
      );
    }
  });

  it('gives only commands the rules accept, and never more than its difficulty allows', () => {
    expect(played.given.length).toBeGreaterThan(0);
    expect(played.given.filter((g) => !g.ok)).toEqual([]);
    const perThink = new Map<string, number>();
    for (const g of played.given) {
      const key = `${g.issuer}@${g.tick}`;
      perThink.set(key, (perThink.get(key) ?? 0) + 1);
    }
    for (const [key, count] of perThink) {
      const ai = played.state.ai[key.split('@')[0] as PlayerId];
      expect(count).toBeLessThanOrEqual(AI_DIFFICULTIES[ai?.difficulty ?? 'easy'].commandsPerThink);
    }
    expect(played.given.every((g) => g.issuer !== 'human')).toBe(true);
    for (const ai of Object.values(played.state.ai)) {
      expect(ai.log.length).toBeGreaterThan(0);
      expect(ai.log.length).toBeLessThanOrEqual(AI_LOG_LENGTH);
    }
  });

  it('stops once its game is decided', () => {
    const { ctx, state } = match();
    const lost: GameState = { ...state, outcome: { 'ai-1': { result: 'lost', at: 0 } } };
    expect(thinkAi(ctx, lost).commands).toEqual([]);
  });
});

describe('determinism', () => {
  const LENGTH = minutes(4);

  it('plays the same match the same way twice', () => {
    const a = match();
    const b = match();
    const first = run(a.ctx, a.state, LENGTH);
    const second = run(b.ctx, b.state, LENGTH);
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
  });

  it('goes on the same way after a restart from the state', () => {
    const a = match();
    const half = run(a.ctx, a.state, LENGTH / 2);
    const warm = run(a.ctx, half.state, LENGTH / 2);
    // A new context and a state that went through JSON, as after loading a save.
    const loaded = JSON.parse(JSON.stringify(half.state)) as GameState;
    const cold = run(createSimContext(a.world, loaded), loaded, LENGTH / 2);
    expect(cold.given).toEqual(warm.given);
    expect(JSON.stringify(cold.state)).toBe(JSON.stringify(warm.state));
  });

  it('is replayed exactly by its command log with the computer players switched off', () => {
    const a = match();
    const original = run(a.ctx, a.state, LENGTH);
    const b = match();
    let state: GameState = { ...b.state, ai: {} };
    const ctx = createSimContext(b.world, state, { visions: AI_PLAYERS });
    const log = [...original.given];
    for (let tick = 0; tick < LENGTH; tick++) {
      const commands: IssuedCommand[] = [];
      while (log[0]?.tick === tick) commands.push((log.shift() as (typeof log)[0]).command);
      state = stepGame(ctx, state, commands).state;
    }
    expect(JSON.stringify(state)).toBe(JSON.stringify({ ...original.state, ai: {} }));
  });
});
