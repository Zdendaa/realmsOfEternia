/**
 * How strong heroes are, as relations measured in simulated fights (the numbers in
 * game-data can still be tuned). The prototype map's camps and wave against its two
 * starting heroes alone are reported, not asserted: how much they should manage is
 * still an open decision (docs/status.md).
 */
import {
  HERO_RULES,
  PROTOTYPE_MAP,
  PROTOTYPE_SETTLEMENT,
  type HeroId,
  type SettlementLayout,
  type UnitKind,
} from '@roe/game-data';
import type { EntityId, MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { MONSTER_PLAYER } from '../combat/hostility.js';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { report } from '../test/bench.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
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
    monstersNear: (x: number, z: number) =>
      state.units.filter(
        (u) => u.ownerId === MONSTER_PLAYER && isAlive(u) && Math.hypot(u.x - x, u.z - z) < 25,
      ).length,
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
    expect(duel('commander', 1, 'skeletonWarrior', 3).won).toBe(true);
    expect(duel('commander', 1, 'skeletonWarrior', 4).won).toBe(false);
  });

  it('a new Archmage is fragile up close', () => {
    expect(duel('archmage', 1, 'skeletonMinion', 4).won).toBe(true);
    expect(duel('archmage', 1, 'spearman', 2).won).toBe(false);
  });

  it('levels make a clear difference', () => {
    expect(duel('commander', 5, 'skeletonWarrior', 4).won).toBe(true);
    expect(duel('commander', 5, 'swordsman', 3).won).toBe(true);
    expect(duel('archmage', 5, 'spearman', 2).won).toBe(true);
  });
});

describe('the starting heroes on the prototype map (reported, no abilities)', () => {
  const left = (g: ReturnType<typeof game>) =>
    g
      .heroes()
      .map((u) => `${u.type} ${u.health} hp`)
      .join(', ') || 'no hero';

  it.each([
    ['gold camp', -42, -18],
    ['iron camp', 18, 42],
  ])('against the %s', (name, x, z) => {
    const g = game({ ...PROTOTYPE_MAP, waves: [] }, PROTOTYPE_SETTLEMENT);
    g.step({ type: 'attackMove', unitIds: g.heroes().map((u) => u.id), x, z });
    for (let i = 0; i < 1500 && g.heroes().length > 0 && g.monstersNear(x, z) > 0; i++) g.step();
    report(`heroes vs ${name}: ${g.monstersNear(x, z)} skeletons left; ${left(g)}`);
  });

  it('against the wave', () => {
    const g = game(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
    g.step({ type: 'debugWave' });
    const wave = g.state.units.filter((u) => u.ownerId === MONSTER_PLAYER && !u.combat?.home);
    const ids = wave.map((u) => u.id);
    g.step({ type: 'attackMove', unitIds: g.heroes().map((u) => u.id), x: 4, z: -25 });
    for (let i = 0; i < 2400 && g.heroes().length > 0 && g.alive(ids) > 0; i++) g.step();
    report(
      `heroes vs wave of ${ids.length}: ${g.alive(ids)} left; ${left(g)}; Town Hall damage ${g.state.buildingDamage[1] ?? 0}`,
    );
  });
});
