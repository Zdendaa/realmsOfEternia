/**
 * How strong heroes are, as relations measured in simulated fights (the numbers in
 * game-data can still be tuned), and how hard the prototype map is: its two starting
 * heroes alone shouldn't clear a camp or beat the wave, with soldiers beside them they
 * should. One fight turns on small differences in timing, so each is fought from nine
 * directions and the wins are counted.
 */
import {
  HERO_RULES,
  PROTOTYPE_MAP,
  type HeroId,
  type SettlementLayout,
  type UnitKind,
} from '@roe/game-data';
import type { EntityId, MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { report } from '../test/bench.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { APPROACHES, skirmish, type Army, type SkirmishResult } from '../test/skirmish.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';

function game(map: MapDefinition, layout: SettlementLayout) {
  const world = createWorld(map, layout);
  let state: GameState = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, state, { dev: true });
  const g = {
    get state() {
      return state;
    },
    step(...commands: Command[]) {
      state = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer: 'alice', command })),
      ).state;
    },
    spawn(owner: string, unit: UnitKind, x: number, z: number, count: number): EntityId[] {
      const first = state.nextEntityId;
      g.step({ type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i) => first + i);
    },
    heroes: () => state.units.filter((u) => u.hero && isAlive(u)),
    alive: (ids: readonly EntityId[]) =>
      state.units.filter((u) => ids.includes(u.id) && isAlive(u)).length,
  };
  return g;
}

/** One hero alone against a group that marches on it, no abilities. */
function duel(hero: HeroId, level: number, foe: UnitKind, count: number) {
  const map = { ...FLAT_MAP, startingHeroes: [{ player: 0, hero, x: 0, z: 20 }] };
  const g = game(map, { ...TOWN, startingSerfs: 0 });
  const [id = 0] = g.heroes().map((u) => u.id);
  const experience = HERO_RULES.levelExperience[level - 1] ?? 0;
  if (experience > 0) g.step({ type: 'debugExperience', unitIds: [id], amount: experience });
  const foes = g.spawn('bob', foe, 0, 28, count);
  g.step();
  for (let i = 0; i < 900 && g.alive(foes) > 0 && g.heroes().length > 0; i++) g.step();
  return { won: g.alive(foes) === 0 && g.heroes().length === 1, left: g.alive(foes) };
}

describe('how strong a hero is on its own', () => {
  it('a new Commander holds off a few soldiers, not a squad', () => {
    expect(duel('commander', 1, 'swordsman', 2).won).toBe(true);
    expect(duel('commander', 1, 'swordsman', 3).won).toBe(false);
    expect(duel('commander', 1, 'skeletonWarrior', 2).won).toBe(true);
    expect(duel('commander', 1, 'skeletonWarrior', 3).won).toBe(false);
  });

  it('a new Archmage is fragile up close', () => {
    expect(duel('archmage', 1, 'skeletonMinion', 2).won).toBe(true);
    expect(duel('archmage', 1, 'skeletonMinion', 3).won).toBe(false);
    expect(duel('archmage', 1, 'spearman', 2).won).toBe(false);
  });

  it('levels make a clear difference', () => {
    expect(duel('commander', 5, 'skeletonWarrior', 4).won).toBe(true);
    expect(duel('commander', 5, 'swordsman', 3).won).toBe(true);
    expect(duel('archmage', 5, 'spearman', 2).won).toBe(true);
  });
});

describe('the starting heroes on the prototype map, using their abilities', () => {
  const FIGHTS = {
    ironCamp: { camp: { x: 18, z: 42 } },
    goldCamp: { camp: { x: -42, z: -18 } },
    wave: { wave: true },
  } as const;

  function wins(name: keyof typeof FIGHTS, army: Army): number {
    const runs = APPROACHES.map((aside) => skirmish(PROTOTYPE_MAP, FIGHTS[name], army, aside));
    const won = runs.filter((r) => r.cleared).length;
    const mean = (of: (r: SkirmishResult) => number) =>
      (runs.reduce((sum, r) => sum + of(r), 0) / runs.length).toFixed(1);
    report(
      `${name} with ${JSON.stringify(army)}: won ${won}/${runs.length}, ` +
        `soldiers left ${mean((r) => r.soldiersLeft)}, monsters left ${mean((r) => r.monstersLeft)}`,
    );
    return won;
  }

  it.each(['ironCamp', 'goldCamp', 'wave'] as const)(
    'alone they nearly always lose: %s',
    (name) => {
      expect(wins(name, {})).toBeLessThanOrEqual(2);
    },
    60_000,
  );

  // The iron camp falls before there is any iron: five archers are what 5 gold buys.
  it.each([
    ['ironCamp', { archer: 5 }],
    ['goldCamp', { archer: 8 }],
    ['goldCamp', { swordsman: 4, archer: 4 }],
    ['wave', { swordsman: 3, archer: 4 }],
  ] as const)(
    'with soldiers they win: %s %o',
    (name, army) => {
      expect(wins(name, army)).toBeGreaterThanOrEqual(8);
    },
    60_000,
  );
});
