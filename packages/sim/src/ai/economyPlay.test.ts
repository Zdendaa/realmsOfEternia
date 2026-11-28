import {
  AI_PERSONALITIES,
  AI_RULES,
  BUILDINGS,
  productionOf,
  SKIRMISH_MAP,
  SKIRMISH_SETTLEMENT,
  type AiDifficultyId,
  type AiPersonalityId,
  type BuildingId,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type MapDefinition, type PlayerId, type Vec2 } from '@roe/shared';
import { describe, expect, it, vi } from 'vitest';
import { MONSTER_PLAYER } from '../combat/hostility.js';
import { createSimContext, syncContext, type SimContext } from '../context/simContext.js';
import { createMatch, type MatchSetup } from '../match/setup.js';
import type { BuildingInstance, GameState } from '../state/gameState.js';
import { createUnit } from '../state/units.js';
import { stepGame } from '../tick/stepGame.js';
import { findBuildingSpot, searchBuildingSpot, SPOT_RULES } from './buildingSpot.js';
import type { AiKnowledge } from './knowledge.js';
import { depositAt } from './deposits.js';
import { isUnsafe, observe } from './memory.js';
import { freshAiState } from './state.js';

// Whole matches are played headless here.
vi.setConfig({ testTimeout: 60_000 });

const minutes = (m: number) => m * 60 * SIMULATION_TICK_RATE;
const COLORS = ['red', 'green', 'yellow'] as const;
const PLAYERS: PlayerId[] = ['ai-1', 'ai-2', 'ai-3'];

/** A human who does nothing in slot 0, and computer players in the other three. */
const setupOf = (
  difficulty: AiDifficultyId,
  personalities: readonly AiPersonalityId[],
): MatchSetup => ({
  seed: 5,
  seats: [
    { player: 'human', slot: 0, team: 1, color: 'blue', controller: { kind: 'human' } },
    ...personalities.map((personality, i) => ({
      player: PLAYERS[i] as PlayerId,
      slot: i + 1,
      team: i + 2,
      color: COLORS[i] ?? ('red' as const),
      controller: { kind: 'ai' as const, difficulty, personality },
    })),
  ],
});

/** A match that can be played on, and have its state changed from outside. */
function play(setup: MatchSetup, map: MapDefinition = SKIRMISH_MAP) {
  const { world, state: first } = createMatch(map, SKIRMISH_SETTLEMENT, setup);
  const ctx: SimContext = createSimContext(world, first);
  let state = first;
  const refused: string[] = [];
  const built: { player: PlayerId; type: string; tick: number; onClear: boolean }[] = [];
  return {
    world,
    ctx,
    refused,
    built,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
      syncContext(ctx, state);
    },
    run(ticks: number) {
      for (let i = 0; i < ticks; i++) {
        const result = stepGame(ctx, state);
        for (const { issuer, command, result: outcome } of result.ai) {
          if (!outcome.ok) refused.push(`${issuer} ${command.type} ${outcome.check.issues}`);
          else if (command.type === 'placeBuilding') {
            const deposit = depositAt(world.deposits, command);
            built.push({
              player: issuer,
              type: command.building,
              tick: state.tick,
              // What it remembered of the deposit as it gave the order.
              onClear: result.state.ai[issuer]?.deposits[deposit] === 'clear',
            });
          }
        }
        state = result.state;
      }
    },
  };
}

const complete = (state: GameState, player: PlayerId, type: BuildingId) =>
  state.buildings.filter((b) => b.ownerId === player && b.type === type && b.status === 'complete')
    .length;

const stock = (state: GameState, player: PlayerId) => {
  const own = state.stocks[player];
  if (!own) throw new Error(`no stock for ${player}`);
  return own;
};

describe('Normal economy targets', () => {
  const match = play(setupOf('normal', ['balanced', 'balanced', 'balanced']));
  match.run(minutes(5));
  const at5 = match.state;
  match.run(minutes(5));
  const at10 = match.state;

  it('has a food chain and stone within five minutes, on every start', () => {
    for (const player of PLAYERS) {
      expect(complete(at5, player, 'bakery'), player).toBeGreaterThanOrEqual(1);
      expect(complete(at5, player, 'quarry'), player).toBeGreaterThanOrEqual(1);
      expect(complete(at5, player, 'field'), player).toBeGreaterThanOrEqual(3);
      expect(complete(at5, player, 'archeryRange'), player).toBe(1);
      expect(at5.stats[player]?.soldiersTrained, player).toBeGreaterThanOrEqual(5);
      const serfs = at5.units.filter((u) => u.ownerId === player && u.type === 'serf');
      expect(serfs.length, player).toBeGreaterThanOrEqual(13);
    }
  });

  it('has grown it, with ore and soldiers, within ten', () => {
    for (const player of PLAYERS) {
      expect(complete(at10, player, 'field'), player).toBeGreaterThanOrEqual(4);
      expect(complete(at10, player, 'mill'), player).toBeGreaterThanOrEqual(1);
      expect(complete(at10, player, 'storehouse'), player).toBeGreaterThanOrEqual(1);
      expect(complete(at10, player, 'lumbermill'), player).toBeGreaterThanOrEqual(1);
      expect(complete(at10, player, 'ironMine'), player).toBe(1);
      expect(at10.stats[player]?.soldiersTrained, player).toBeGreaterThanOrEqual(8);
      // Its soldiers eat into the stock, but it never runs dry.
      expect(stock(at10, player).food, player).toBeGreaterThanOrEqual(15);
    }
  });

  it('gives no command the rules refuse', () => {
    expect(match.refused).toEqual([]);
  });

  it('builds in the order of its list', () => {
    for (const player of PLAYERS) {
      const order = match.built.filter((b) => b.player === player).map((b) => b.type);
      expect(order.slice(0, 3), player).toEqual(['bakery', 'field', 'quarry']);
    }
  });

  it('builds mines only on deposits it has seen unguarded', () => {
    const mines = match.built.filter((b) => b.type.endsWith('Mine'));
    expect(mines.length).toBeGreaterThan(0);
    for (const mine of mines) expect(mine.onClear, `${mine.player} ${mine.type}`).toBe(true);
  });

  it('puts every lumbermill and quarry where there is something to harvest', () => {
    for (const building of at10.buildings) {
      const production = productionOf(building.type);
      if (!building.ownerId?.startsWith('ai') || production?.kind !== 'harvest') continue;
      const near = match.world.decorations.filter(
        (d) =>
          d.kind === production.node &&
          Math.hypot(d.x - building.x, d.z - building.z) <= production.workRadius,
      );
      expect(near.length, `${building.ownerId} ${building.type}`).toBeGreaterThan(0);
    }
  });
});

describe('builders', () => {
  it('are never ordered beyond their share of the serfs, even on Hard', () => {
    const match = play(setupOf('hard', ['balanced', 'aggressive', 'defensive']));
    let orders = 0;
    for (let i = 0; i < minutes(6); i++) {
      // (Idle serfs also take up sites near them by themselves: a rule of the game.)
      const before = match.state;
      const given = stepGame(match.ctx, before);
      for (const { issuer, command } of given.ai) {
        if (command.type !== 'assignBuilders') continue;
        const serfs = before.units.filter((u) => u.ownerId === issuer && u.type === 'serf');
        const busy = serfs.filter((u) => u.task.kind === 'build' || u.task.kind === 'deliver');
        expect(busy.length + command.unitIds.length, issuer).toBeLessThanOrEqual(
          Math.ceil(serfs.length * AI_RULES.builderShare),
        );
        orders++;
      }
      match.state = given.state;
    }
    expect(orders).toBeGreaterThan(10);
  });
});

describe('personalities and difficulty', () => {
  it('grows an economy whatever the personality', () => {
    const match = play(setupOf('normal', ['balanced', 'aggressive', 'defensive']));
    match.run(minutes(10));
    PLAYERS.forEach((player) => {
      expect(complete(match.state, player, 'bakery'), player).toBeGreaterThanOrEqual(1);
      expect(complete(match.state, player, 'quarry'), player).toBeGreaterThanOrEqual(1);
      expect(complete(match.state, player, 'field'), player).toBeGreaterThanOrEqual(3);
      // The opening five archers: trained, or paid for and on their way.
      const queued = Object.entries(match.state.training)
        .filter(([id]) =>
          match.state.buildings.some((b) => b.id === Number(id) && b.ownerId === player),
        )
        .reduce((sum, [, training]) => sum + training.queue.length, 0);
      const trained = match.state.stats[player]?.soldiersTrained ?? 0;
      expect(trained + queued, player).toBeGreaterThanOrEqual(5);
    });
    expect(match.refused).toEqual([]);
  });

  it('builds more and faster the harder it is', () => {
    const buildings = (['easy', 'hard'] as const).map((difficulty) => {
      const match = play(setupOf(difficulty, ['balanced']));
      match.run(minutes(6));
      return match.built.length;
    });
    expect(buildings[1]).toBeGreaterThan(buildings[0] ?? Infinity);
  });
});

describe('keeping the base up', () => {
  const settled = () => {
    const match = play(setupOf('normal', ['balanced']));
    match.run(minutes(6));
    return match;
  };
  const owned = (state: GameState, type: BuildingId) =>
    state.buildings.filter((b) => b.ownerId === 'ai-1' && b.type === type);

  it('rebuilds what is destroyed', () => {
    const match = settled();
    const lost = [owned(match.state, 'bakery')[0], owned(match.state, 'lumbermill')[0]];
    const ids = new Set(lost.map((b) => (b as BuildingInstance).id));
    match.state = {
      ...match.state,
      buildings: match.state.buildings.filter((b) => !ids.has(b.id)),
    };
    match.run(minutes(5));
    expect(complete(match.state, 'ai-1', 'bakery')).toBeGreaterThanOrEqual(1);
    expect(complete(match.state, 'ai-1', 'lumbermill')).toBeGreaterThanOrEqual(1);
    expect(match.refused).toEqual([]);
  });

  it('repairs a damaged building', () => {
    const match = settled();
    const hall = owned(match.state, 'townHall')[0] as BuildingInstance;
    match.state = { ...match.state, buildingDamage: { [hall.id]: 600 } };
    match.run(minutes(2));
    expect(match.state.buildingDamage[hall.id] ?? 0).toBeLessThan(
      BUILDINGS.townHall.health * AI_RULES.repairAtShare,
    );
    expect(match.refused).toEqual([]);
  });

  it('builds houses first when places run out', () => {
    const match = play(setupOf('normal', ['balanced']));
    // Two houses left: 18 places for 9 villagers and the serfs and workers it wants.
    let kept = 0;
    match.state = {
      ...match.state,
      buildings: match.state.buildings.filter(
        (b) => b.ownerId !== 'ai-1' || b.type !== 'house' || kept++ < 1,
      ),
    };
    match.run(minutes(6));
    expect(match.built.some((b) => b.type === 'house')).toBe(true);
    expect(complete(match.state, 'ai-1', 'house')).toBeGreaterThanOrEqual(2);
  });
});

describe('mines', () => {
  /** Four Corners without its camps. */
  const PEACEFUL: MapDefinition = { ...SKIRMISH_MAP, camps: [] };

  it('are built on deposits it has seen unguarded, on every start, and pay off', () => {
    const match = play(setupOf('normal', ['aggressive', 'aggressive', 'aggressive']), PEACEFUL);
    // A lookout of its own at each of its deposits (scouting comes with the army).
    const lookouts = PLAYERS.flatMap((player) => {
      const hall = match.state.buildings.find(
        (b) => b.type === 'townHall' && b.ownerId === player,
      ) as BuildingInstance;
      const home = match.world.deposits.filter(
        (d) => Math.hypot(d.x - hall.x, d.z - hall.z) <= AI_RULES.farGatherRadius,
      );
      // Its own two, and perhaps one of the middle ones.
      expect(home.length).toBeGreaterThanOrEqual(2);
      return home.slice(0, 2).map((d) => ({ player, x: d.x + d.radius + 5, z: d.z }));
    });
    match.state = {
      ...match.state,
      units: [
        ...match.state.units,
        ...lookouts.map((at, i) => createUnit(9000 + i, 'swordsman', at.player, at)),
      ],
      nextEntityId: 9100,
    };
    match.run(minutes(10));
    for (const player of PLAYERS) {
      expect(complete(match.state, player, 'ironMine'), player).toBe(1);
      expect(complete(match.state, player, 'goldMine'), player).toBe(1);
      // Soldiers that take iron: there is none without the mine.
      const mined = match.state.units.some(
        (u) => u.ownerId === player && (u.type === 'swordsman' || u.type === 'spearman'),
      );
      expect(mined || stock(match.state, player).iron > 0, player).toBe(true);
    }
    expect(match.refused).toEqual([]);
  });
});

describe('what it remembers', () => {
  const DEPOSITS = SKIRMISH_MAP.deposits;
  const first = DEPOSITS[0] as (typeof DEPOSITS)[number];
  const monster = (at: Vec2) => createUnit(1, 'skeletonWarrior', MONSTER_PLAYER, at);
  const look = (tick: number, seen: boolean, enemies: Vec2[]): AiKnowledge =>
    ({
      tick,
      enemyUnits: enemies.map(monster),
      deposits: DEPOSITS,
      otherBuildings: [],
      startSlots: [],
      isEnemy: () => true,
      sees: () => seen,
    }) as unknown as AiKnowledge;
  const blank = freshAiState({
    difficulty: 'normal',
    personality: 'balanced',
    seed: 1,
    order: 0,
  });

  it('keeps away from deposits it has not seen, and from where it saw enemies', () => {
    expect(isUnsafe(blank, DEPOSITS, first)).toBe(true);
    expect(isUnsafe(blank, DEPOSITS, { x: 0, z: -100 })).toBe(false);
    const warned = observe(blank, look(10, false, [{ x: 0, z: -100 }]));
    expect(isUnsafe(warned, DEPOSITS, { x: 5, z: -100 })).toBe(true);
  });

  it('marks a deposit held or clear by what it sees there', () => {
    const held = observe(blank, look(10, true, [first]));
    expect(held.deposits[0]).toBe('held');
    const later = observe(held, look(20, true, []));
    expect(later.deposits[0]).toBe('clear');
    expect(isUnsafe(later, DEPOSITS, first)).toBe(false);
    // Out of sight, it remembers.
    expect(observe(later, look(30, false, [])).deposits[0]).toBe('clear');
  });

  it('forgets a danger it sees gone, or after a while', () => {
    const at = { x: 0, z: -100 };
    const warned = observe(blank, look(10, false, [at]));
    expect(observe(warned, look(20, false, [])).dangers).toHaveLength(1);
    expect(observe(warned, look(20, true, [])).dangers).toHaveLength(0);
    const much = 10 + AI_RULES.dangerMemorySeconds * SIMULATION_TICK_RATE + 1;
    expect(observe(warned, look(much, false, [])).dangers).toHaveLength(0);
  });

  it('is the same object when a look teaches nothing', () => {
    expect(observe(blank, look(10, false, []))).toBe(blank);
  });
});

describe('searching in steps', () => {
  it('finds the same spot as searching all at once', () => {
    const match = play(setupOf('normal', ['balanced']));
    const options = { radius: 45 };
    const whole = findBuildingSpot(match.ctx, match.state, 'ai-1', 'field', options);
    let from = 0;
    let steps = 0;
    for (;;) {
      const part = searchBuildingSpot(
        match.ctx,
        match.state,
        'ai-1',
        'field',
        options,
        from,
        SPOT_RULES.perDecision / 10,
      );
      steps++;
      if (part.kind !== 'more') {
        expect(part.kind === 'found' ? part.spot : null).toEqual(whole);
        break;
      }
      expect(part.next).toBeGreaterThan(from);
      from = part.next;
    }
    expect(steps).toBeGreaterThan(1);
  });

  it('gives up when nothing fits anywhere', () => {
    const match = play(setupOf('normal', ['balanced']));
    const search = searchBuildingSpot(match.ctx, match.state, 'ai-1', 'house', {
      accept: () => false,
    });
    expect(search.kind).toBe('none');
  });
});

describe('build orders', () => {
  it('keep what the starting village has, so it is rebuilt', () => {
    for (const personality of Object.values(AI_PERSONALITIES)) {
      for (const start of ['lumbermill', 'mill', 'field'] as const) {
        expect(personality.buildOrder).toContain(start);
      }
    }
  });
});
