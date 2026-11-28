import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  AI_RULES,
  RESOURCE_IDS,
  SKIRMISH_MAP,
  SKIRMISH_SETTLEMENT,
  towerOf,
  type AiDifficultyId,
  type AiPersonalityId,
  type BuildingId,
  type ResourceAmounts,
  type UnitKind,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type PlayerId, type Vec2 } from '@roe/shared';
import { describe, expect, it, vi } from 'vitest';
import { MONSTER_PLAYER } from '../combat/hostility.js';
import type { Command } from '../commands/types.js';
import { createSimContext, syncContext } from '../context/simContext.js';
import { createMatch, type MatchSetup } from '../match/setup.js';
import type { BuildingInstance, GameState } from '../state/gameState.js';
import { createUnit, isAlive } from '../state/units.js';
import { stepGame } from '../tick/stepGame.js';
import { aiKnowledge } from './knowledge.js';
import { observe } from './memory.js';
import { marchLegs } from './route.js';
import type { AiMission, AiState } from './state.js';
import { isSoldier, totalStrength } from './strength.js';
import { rallyPoint } from './targets.js';
import { thinkAi } from './think.js';

// Whole matches are played headless here.
vi.setConfig({ testTimeout: 120_000 });

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
const minutes = (m: number) => seconds(m * 60);
const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 500])) as ResourceAmounts;

/** A human who does nothing in slot 0 and computer players from slot 1 on. */
const setupOf = (
  players: readonly (readonly [AiDifficultyId, AiPersonalityId])[],
  seed = 5,
): MatchSetup => ({
  seed,
  seats: [
    { player: 'human', slot: 0, team: 1, color: 'blue', controller: { kind: 'human' } },
    ...players.map(([difficulty, personality], i) => ({
      player: `ai-${i + 1}` as PlayerId,
      slot: i + 1,
      team: i + 2,
      color: (['red', 'green', 'yellow'] as const)[i] ?? ('red' as const),
      controller: { kind: 'ai' as const, difficulty, personality },
    })),
  ],
});

function play(setup: MatchSetup, options: { dev?: boolean } = {}) {
  const { world, state: first } = createMatch(SKIRMISH_MAP, SKIRMISH_SETTLEMENT, setup);
  const ctx = createSimContext(world, first, options);
  let state = first;
  const refused: string[] = [];
  const given: { tick: number; player: PlayerId; command: Command }[] = [];
  return {
    world,
    ctx,
    refused,
    given,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
      syncContext(ctx, state);
    },
    run(ticks: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < ticks && !until?.(state); i++) {
        const result = stepGame(ctx, state);
        for (const { issuer, command, result: outcome } of result.ai) {
          if (!outcome.ok) refused.push(`${issuer} ${command.type} ${outcome.check.issues}`);
          given.push({ tick: state.tick, player: issuer, command });
        }
        state = result.state;
      }
    },
    /** Adds `count` units of `kind` for `owner` around `at`; returns their ids. */
    add(owner: PlayerId, kind: UnitKind, count: number, at: Vec2) {
      const first = state.nextEntityId;
      const units = Array.from({ length: count }, (_, i) =>
        createUnit(first + i, kind, owner, {
          x: at.x + (i % 5) * 1.2,
          z: at.z + Math.floor(i / 5) * 1.2,
        }),
      );
      this.state = {
        ...state,
        units: [...state.units, ...units],
        nextEntityId: first + count,
      };
      return units.map((u) => u.id);
    },
    hall(owner: PlayerId) {
      const hall = state.buildings.find((b) => b.type === 'townHall' && b.ownerId === owner);
      if (!hall) throw new Error(`no Town Hall for ${owner}`);
      return hall;
    },
    /** Changes the memory of `player`. */
    remember(player: PlayerId, change: Partial<AiState>) {
      const ai = state.ai[player];
      if (!ai) throw new Error('no such computer player');
      this.state = { ...state, ai: { ...state.ai, [player]: { ...ai, ...change } } };
    },
    /** What `player` would order on its next turns. */
    ordersOf(player: PlayerId) {
      const ai = state.ai[player];
      let tick = state.tick;
      while (ai && tick % 10 !== ai.order) tick++;
      return thinkAi(ctx, { ...state, tick }).commands.filter((c) => c.issuer === player);
    },
  };
}

type Play = ReturnType<typeof play>;

const army = (state: GameState, player: PlayerId) =>
  state.units.filter((u) => u.ownerId === player && isAlive(u) && isSoldier(u));

/** `ids` as an expedition already marching on `target`. */
const marching = (match: Play, ids: number[], target: Vec2): AiMission => ({
  kind: 'raid',
  stage: 'march',
  target,
  legs: [target],
  deposit: null,
  units: ids,
  strength: totalStrength(match.state.units.filter((u) => ids.includes(u.id))),
  hop: target,
  stageAt: match.state.tick,
  hopAt: match.state.tick,
  focus: null,
});

/** One computer player of `difficulty` with a marching army out in the open. */
function expedition(difficulty: AiDifficultyId) {
  const match = play(setupOf([[difficulty, 'balanced']]));
  const at = { x: 40, z: -40 };
  const ids = match.add('ai-1', 'swordsman', 6, at);
  const ai = match.state.ai['ai-1'] as AiState;
  match.remember('ai-1', {
    army: { ...ai.army, mission: marching(match, ids, { x: -60, z: -40 }) },
  });
  return { match, at, ids };
}

describe('defending the base', () => {
  it('sends the soldiers at home against attackers', () => {
    const match = play(setupOf([['normal', 'balanced']]));
    const hall = match.hall('ai-1');
    const own = match.add('ai-1', 'swordsman', 8, rallyPoint(hall));
    const raiders = match.add('human', 'spearman', 4, { x: hall.x - 12, z: hall.z + 4 });
    match.run(seconds(60), (s) => !s.units.some((u) => raiders.includes(u.id) && isAlive(u)));
    expect(match.state.units.some((u) => raiders.includes(u.id) && isAlive(u))).toBe(false);
    expect(
      match.given.some(
        (g) => g.command.type === 'attackMove' && g.command.unitIds.some((id) => own.includes(id)),
      ),
    ).toBe(true);
    expect(match.refused).toEqual([]);
  });

  it('leaves alone the monsters that only guard a deposit', () => {
    const match = play(setupOf([['normal', 'balanced']]));
    const deposit = match.world.deposits[2];
    if (!deposit) throw new Error('no deposit');
    // A building of its own right by the camp.
    const outpost: BuildingInstance = {
      id: 5000,
      type: 'house',
      x: deposit.x - 16,
      z: deposit.z,
      rotation: 0,
      ownerId: 'ai-1',
      status: 'complete',
    };
    match.state = { ...match.state, buildings: [...match.state.buildings, outpost] };
    match.run(seconds(10));
    expect(match.state.ai['ai-1']?.army.defending).toBe(false);
  });
});

describe('an army on the march', () => {
  it('retreats on Normal when badly outmatched', () => {
    const { match, at } = expedition('normal');
    match.add('human', 'swordsman', 16, { x: at.x - 11, z: at.z });
    match.run(seconds(3));
    expect(match.state.ai['ai-1']?.army.mission?.stage).toBe('retreat');
    expect(match.given.some((g) => g.command.type === 'moveUnits')).toBe(true);
    expect(match.refused).toEqual([]);
  });

  it('fights on to the end on Easy', () => {
    const { match, at } = expedition('easy');
    match.add('human', 'swordsman', 16, { x: at.x - 11, z: at.z });
    match.run(seconds(6));
    expect(match.state.ai['ai-1']?.army.mission?.stage).toBe('march');
    expect(match.given.some((g) => g.command.type === 'moveUnits')).toBe(false);
  });

  it('turns everyone on one enemy on Hard, once per enemy', () => {
    const { match, at } = expedition('hard');
    match.add('human', 'spearman', 3, { x: at.x - 8, z: at.z });
    match.run(seconds(12));
    const focused = match.given.filter((g) => g.command.type === 'attack');
    expect(focused.length).toBeGreaterThan(0);
    const targets = focused.map((g) => (g.command.type === 'attack' ? g.command.targetId : 0));
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('sends the badly hurt home on Hard', () => {
    const { match, ids } = expedition('hard');
    match.state = {
      ...match.state,
      units: match.state.units.map((u) => (u.id === ids[0] ? { ...u, health: 10 } : u)),
    };
    match.run(seconds(3));
    expect(match.state.ai['ai-1']?.army.mission?.units).not.toContain(ids[0]);
    expect(
      match.given.some(
        (g) => g.command.type === 'moveUnits' && g.command.unitIds.includes(ids[0] as number),
      ),
    ).toBe(true);
  });

  it('never gives a fighting unit a new march order', () => {
    const { match, at } = expedition('normal');
    match.add('human', 'swordsman', 4, { x: at.x - 6, z: at.z });
    for (let i = 0; i < seconds(15); i++) {
      const busy = new Set(
        match.state.units.filter((u) => u.combat?.targetId != null).map((u) => u.id),
      );
      const before = match.given.length;
      match.run(1);
      for (const { command } of match.given.slice(before)) {
        if (command.type !== 'attackMove') continue;
        expect(command.unitIds.filter((id) => busy.has(id))).toEqual([]);
      }
    }
  });
});

describe('against walls', () => {
  it('breaks its way into a fortified base with siege engines', () => {
    const match = play(setupOf([['normal', 'balanced']]), { dev: true });
    const at = { x: 30, z: -30 };
    // The dev fort for the human: stone walls, a gate, four towers and a house.
    const fort = stepGame(match.ctx, match.state, [
      { issuer: 'human', command: { type: 'debugFort', ...at } },
    ]).state;
    const raised = fort.buildings.filter(
      (b) => b.ownerId === 'human' && !match.state.buildings.some((o) => o.id === b.id),
    );
    match.state = fort;
    const house = raised.find((b) => b.type === 'house');
    const towers = raised.filter((b) => towerOf(b.type));
    expect(towers.length).toBeGreaterThan(0);
    if (!house) throw new Error('the fort has no house');

    const from = { x: at.x + 28, z: at.z + 28 };
    const ids = (
      [
        ['swordsman', 12],
        ['spearman', 6],
        ['archer', 8],
        ['ram', 2],
        ['catapult', 2],
      ] as const
    ).flatMap(([kind, count], i) =>
      match.add('ai-1', kind, count, { x: from.x + i * 7, z: from.z }),
    );
    const ai = match.state.ai['ai-1'] as AiState;
    match.remember('ai-1', {
      sightings: [{ id: house.id, owner: 'human', type: 'house', x: house.x, z: house.z }],
      army: { ...ai.army, mission: marching(match, ids, { x: house.x, z: house.z }) },
    });
    const standing = (s: GameState, id: number) => s.buildings.some((b) => b.id === id);
    match.run(minutes(3), (s) => !standing(s, house.id));
    expect(standing(match.state, house.id)).toBe(false);
    // And its siege engines broke towers on the way.
    expect(towers.filter((t) => standing(match.state, t.id)).length).toBeLessThan(towers.length);
    expect(match.refused).toEqual([]);
  });
});

describe('training', () => {
  /** A rich computer player with a barracks, a range and a workshop already standing. */
  function trainer(personality: AiPersonalityId) {
    const match = play(setupOf([['normal', personality]]));
    const hall = match.hall('ai-1');
    const buildings = (['barracks', 'archeryRange', 'siegeWorkshop'] as BuildingId[]).map(
      (type, i): BuildingInstance => ({
        id: 6000 + i,
        type,
        x: hall.x - 20,
        z: hall.z - 14 + i * 12,
        rotation: 0,
        ownerId: 'ai-1',
        status: 'complete',
      }),
    );
    match.state = {
      ...match.state,
      buildings: [...match.state.buildings, ...buildings],
      stocks: { ...match.state.stocks, 'ai-1': RICH },
    };
    return match;
  }
  const trained = (match: Play) =>
    match.given.flatMap((g) => (g.command.type === 'trainUnit' ? [g.command.unit] : []));

  it('trains all its kinds, in about its shares', () => {
    const match = trainer('balanced');
    match.run(minutes(3));
    const kinds = trained(match);
    for (const kind of ['swordsman', 'spearman', 'archer'] as const) {
      expect(kinds.filter((k) => k === kind).length, kind).toBeGreaterThanOrEqual(2);
    }
    expect(match.refused).toEqual([]);
  });

  it('builds siege engines only once it knows of an enemy base', () => {
    const quiet = trainer('balanced');
    quiet.run(minutes(2));
    expect(trained(quiet).filter((k) => k === 'ram' || k === 'catapult')).toEqual([]);
    const aware = trainer('balanced');
    const enemy = aware.hall('human');
    aware.remember('ai-1', {
      sightings: [{ id: enemy.id, owner: 'human', type: 'townHall', x: enemy.x, z: enemy.z }],
    });
    aware.run(minutes(3));
    expect(trained(aware)).toContain('ram');
    const siege = army(aware.state, 'ai-1').filter((u) => u.type === 'ram');
    expect(siege.length).toBeLessThanOrEqual(AI_PERSONALITIES.balanced.siege.ram);
  });

  it('keeps no more soldiers than its difficulty allows', () => {
    const match = trainer('balanced');
    match.add('ai-1', 'archer', AI_DIFFICULTIES.normal.maxSoldiers, rallyPoint(match.hall('ai-1')));
    // At its very next decision (later, some may have fallen and made room).
    expect(match.ordersOf('ai-1').filter((c) => c.command.type === 'trainUnit')).toEqual([]);
  });

  it('upgrades its towers when it is the defensive kind', () => {
    const match = trainer('defensive');
    const hall = match.hall('ai-1');
    const tower: BuildingInstance = {
      id: 6100,
      type: 'woodenTower',
      x: hall.x - 26,
      z: hall.z - 26,
      rotation: 0,
      ownerId: 'ai-1',
      status: 'complete',
    };
    match.state = { ...match.state, buildings: [...match.state.buildings, tower] };
    match.run(minutes(2));
    expect(match.given.some((g) => g.command.type === 'upgradeTower')).toBe(true);
    expect(match.refused).toEqual([]);
  });
});

describe('what it knows of the enemy', () => {
  it('learns a building only by seeing it, and forgets it once seen gone', () => {
    const match = play(setupOf([['normal', 'balanced']]));
    const blank = match.state.ai['ai-1'] as AiState;
    const look = (ai: AiState) => observe(ai, aiKnowledge(match.ctx, match.state, 'ai-1'));
    expect(look(blank).sightings).toEqual([]);
    const enemy = match.hall('human');
    const [spy] = match.add('ai-1', 'archer', 1, { x: enemy.x + 9, z: enemy.z });
    const seen = look(blank);
    expect(seen.sightings.some((s) => s.id === enemy.id)).toBe(true);
    // Out of sight it remembers; back in sight with the building gone, it forgets.
    const withSpy = match.state;
    match.state = { ...withSpy, units: withSpy.units.filter((u) => u.id !== spy) };
    expect(look(seen).sightings).toEqual(seen.sightings);
    match.state = { ...withSpy, buildings: withSpy.buildings.filter((b) => b.id !== enemy.id) };
    expect(look(seen).sightings.some((s) => s.id === enemy.id)).toBe(false);
  });

  it('forgets a defeated player', () => {
    const match = play(setupOf([['normal', 'balanced']]));
    const blank = match.state.ai['ai-1'] as AiState;
    const known: AiState = {
      ...blank,
      sightings: [{ id: 1, owner: 'human', type: 'townHall', x: -100, z: -100 }],
    };
    match.state = { ...match.state, outcome: { human: { result: 'lost', at: 0 } } };
    expect(observe(known, aiKnowledge(match.ctx, match.state, 'ai-1')).sightings).toEqual([]);
  });

  it('marches between corners clear of every deposit and the middle', () => {
    const match = play(setupOf([['normal', 'balanced']]));
    const slots = SKIRMISH_MAP.startSlots;
    /** How close the straight way from a to b comes to p. */
    const clearance = (a: Vec2, b: Vec2, p: Vec2) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)),
      );
      return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
    };
    for (const from of slots) {
      for (const to of slots) {
        if (from === to) continue;
        const start = rallyPoint(from);
        const points = [start, ...marchLegs(start, to, SKIRMISH_MAP.size)];
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1] as Vec2;
          const b = points[i] as Vec2;
          for (const hazard of [...match.world.deposits.slice(0, 8), { x: 0, z: 0 }]) {
            expect(clearance(a, b, hazard)).toBeGreaterThan(AI_RULES.campRadius + 5);
          }
        }
      }
    }
  });
});

describe('a whole match', () => {
  const match = play(
    setupOf([
      ['normal', 'balanced'],
      ['normal', 'aggressive'],
      ['normal', 'defensive'],
    ]),
  );
  const AI = ['ai-1', 'ai-2', 'ai-3'] as const;
  match.run(minutes(9));
  const early = match.given.length;
  const raidsAt9 = AI.map((p) => match.state.ai[p]?.army.raids ?? 0);
  match.run(minutes(11));

  it('clears camps and builds mines on its own', () => {
    for (const player of AI) {
      const cleared = Object.values(match.state.ai[player]?.deposits ?? {});
      expect(cleared, player).toContain('clear');
      expect(
        match.given.some(
          (g) =>
            g.player === player &&
            g.command.type === 'placeBuilding' &&
            g.command.building.endsWith('Mine'),
        ),
        player,
      ).toBe(true);
    }
  });

  it('sends no attack on a player before its time, and some after it', () => {
    // Normal attacks from ten minutes, give or take one.
    expect(raidsAt9).toEqual([0, 0, 0]);
    expect(early).toBeGreaterThan(0);
    expect(AI.reduce((sum, p) => sum + (match.state.ai[p]?.army.raids ?? 0), 0)).toBeGreaterThan(0);
  });

  it('gives no command the rules refuse', () => {
    expect(match.refused).toEqual([]);
  });

  it('leaves no monsters mistaken for players', () => {
    for (const player of AI) {
      expect(match.state.ai[player]?.sightings.every((s) => s.owner !== MONSTER_PLAYER)).toBe(true);
    }
  });
});

describe('determinism with armies', () => {
  it('goes on the same way after a restart in the middle of a war', () => {
    const setup = setupOf([
      ['hard', 'balanced'],
      ['hard', 'aggressive'],
      ['hard', 'defensive'],
    ]);
    const warm = play(setup);
    const marchingNow = (s: GameState) =>
      s.tick >= minutes(12) && Object.values(s.ai).some((ai) => ai.army.mission?.stage === 'march');
    warm.run(minutes(20), marchingNow);
    expect(marchingNow(warm.state)).toBe(true);
    // A new context and a state that went through JSON, as after loading a save.
    const cold = play(setup);
    cold.state = JSON.parse(JSON.stringify(warm.state)) as GameState;
    const restarted = createSimContext(cold.world, cold.state);
    let state = cold.state;
    const orders: unknown[] = [];
    const from = warm.given.length;
    for (let i = 0; i < minutes(4); i++) {
      const result = stepGame(restarted, state);
      orders.push(...result.ai.map((c) => [state.tick, c.issuer, c.command]));
      state = result.state;
    }
    warm.run(minutes(4));
    expect(orders).toEqual(warm.given.slice(from).map((g) => [g.tick, g.player, g.command]));
    expect(JSON.stringify(state)).toBe(JSON.stringify(warm.state));
  });
});

describe('against a player who does nothing', () => {
  it('a Hard computer player finds the Town Hall and wins', () => {
    const match = play(setupOf([['hard', 'aggressive']], 11));
    match.run(minutes(35), (s) => s.outcome.human !== undefined);
    expect(match.state.outcome.human?.result).toBe('lost');
    expect(match.state.outcome['ai-1']?.result).toBe('won');
    expect(match.refused).toEqual([]);
  });
});
