import {
  attackOf,
  combatOf,
  HERO_IDS,
  HERO_RULES,
  HEROES,
  PROTOTYPE_MAP,
  PROTOTYPE_SETTLEMENT,
  UNITS,
  type UnitKind,
} from '@roe/game-data';
import type { EntityId, MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { applyCommand, validateCommand } from '../commands/applyCommand.js';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { populationOf } from '../economy/population.js';
import { isWalkable } from '../nav/navGrid.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { viewOf } from '../vision/view.js';
import { createVision, updateVision } from '../vision/vision.js';
import { createWorld } from '../world/createWorld.js';
import { levelFor, maxHealthOf, spawnHero, unitAttack } from './heroes.js';

const MAP: MapDefinition = {
  ...FLAT_MAP,
  startingHeroes: [
    { player: 0, hero: 'commander', x: 4, z: 14 },
    { player: 0, hero: 'archmage', x: 6, z: 14 },
    // Skipped: no such hero, and a slot nobody holds.
    { player: 0, hero: 'necromancer', x: 8, z: 14 },
    { player: 3, hero: 'pathfinder', x: 10, z: 14 },
  ],
};

/** The value, which the test expects to exist. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('missing');
  return value;
}

/** The flat map with just one starting hero at (x, z). */
const only = (hero: string, x: number, z: number): MapDefinition => ({
  ...FLAT_MAP,
  startingHeroes: [{ player: 0, hero, x, z }],
});

function game(map: MapDefinition = FLAT_MAP) {
  const world = createWorld(map, { ...TOWN, startingSerfs: 0 });
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    ctx,
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
    run(ticks: number, until?: () => boolean) {
      for (let i = 0; i < ticks && !until?.(); i++) g.step();
    },
    spawn(owner: string, unit: UnitKind, x: number, z: number): EntityId {
      const id = state.nextEntityId;
      g.step({ type: 'debugSpawn', unit, count: 1, x, z, owner });
      return id;
    },
    unit: (id: EntityId) => must(state.units.find((u) => u.id === id)),
    find: (type: UnitKind) => must(state.units.find((u) => u.type === type)),
    /** Keeps a fighter from ever striking, so it only watches. */
    pacify(id: EntityId) {
      g.patch(id, { combat: { ...must(g.unit(id).combat), readyAt: Number.MAX_SAFE_INTEGER } });
    },
    patch(id: EntityId, change: Partial<UnitInstance>) {
      state = {
        ...state,
        units: state.units.map((u) => (u.id === id ? { ...u, ...change } : u)),
      };
    },
  };
  return g;
}

/**
 * `victim` (an enemy, one hit from death) is killed by `killer`; returns the experience
 * the hero `heroId` gained.
 */
function kill(g: ReturnType<typeof game>, heroId: EntityId, killer: EntityId, victim: EntityId) {
  const before = must(g.unit(heroId).hero).experience;
  g.patch(victim, { health: 1 });
  g.step({ type: 'attack', unitIds: [killer], targetId: victim });
  g.run(200, () => !g.state.units.some((u) => u.id === victim && isAlive(u)));
  return must(g.unit(heroId).hero).experience - before;
}

describe('creating heroes', () => {
  it('gives the map’s starting heroes to the player of their slot', () => {
    const g = game(MAP);
    const heroes = g.state.units.filter((u) => u.hero);
    expect(heroes.map((u) => [u.type, u.ownerId, u.x, u.z])).toEqual([
      ['commander', 'alice', 4, 14],
      ['archmage', 'alice', 6, 14],
    ]);
    expect(heroes.every((u) => u.hero?.level === 1 && u.hero.experience === 0)).toBe(true);
    expect(g.state.nextEntityId).toBeGreaterThan(must(heroes.at(-1)).id);
  });

  it('gives a neutral settlement none', () => {
    const world = createWorld(MAP, TOWN);
    expect(createInitialState(world).units.filter((u) => u.hero)).toEqual([]);
  });

  it('puts the prototype map’s two heroes on walkable ground by the Town Hall', () => {
    const world = createWorld(PROTOTYPE_MAP, PROTOTYPE_SETTLEMENT);
    const state = createInitialState(world, { owner: 'alice' });
    const ctx = createSimContext(world, state);
    const heroes = state.units.filter((u) => u.hero);
    expect(heroes.map((u) => u.type)).toEqual(['commander', 'archmage']);
    const hall = must(state.buildings.find((b) => b.type === 'townHall'));
    for (const hero of heroes) {
      expect(isWalkable(ctx.nav, hero.x, hero.z, 'alice')).toBe(true);
      expect(Math.hypot(hero.x - hall.x, hero.z - hall.z)).toBeLessThan(12);
      for (const other of state.units) {
        if (other.id !== hero.id) {
          expect(Math.hypot(hero.x - other.x, hero.z - other.z)).toBeGreaterThan(0.85);
        }
      }
    }
  });

  it('allows one of each type per player, however they are created', () => {
    const g = game(MAP);
    const again = spawnHero(g.state, 'commander', 'alice', { x: 0, z: 20 });
    expect(again.ok ? null : again.issue).toBe('heroExists');
    expect(again.state).toBe(g.state);
    expect(spawnHero(g.state, 'commander', 'bob', { x: 0, z: 20 }).ok).toBe(true);
    expect(spawnHero(g.state, 'pathfinder', 'alice', { x: 0, z: 20 }).ok).toBe(true);
    expect(spawnHero(g.state, 'swordsman', 'alice', { x: 0, z: 20 }).ok).toBe(false);
    const dev = { type: 'debugSpawn', unit: 'archmage', count: 5, x: 0, z: 20 } as const;
    expect(validateCommand(g.ctx, g.state, 'alice', dev).issues).toEqual(['heroExists']);
    // For another player it works, and one comes however many were asked for.
    const bobs = applyCommand(g.ctx, g.state, 'alice', { ...dev, owner: 'bob' });
    expect(bobs.state.units.filter((u) => u.ownerId === 'bob').map((u) => u.type)).toEqual([
      'archmage',
    ]);
  });

  it('takes no place in anyone’s housing', () => {
    const withHeroes = game(MAP);
    const without = game();
    expect(populationOf(withHeroes.state, 'alice')).toEqual(populationOf(without.state, 'alice'));
  });
});

describe('levels', () => {
  it('follow total experience, up to five', () => {
    const [, two, three, four, five] = HERO_RULES.levelExperience;
    expect([0, two - 1, two, three, four, five, 99_999].map(levelFor)).toEqual([
      1, 1, 2, 3, 4, 5, 5,
    ]);
  });

  it('raise health and damage in whole numbers', () => {
    for (const hero of HERO_IDS) {
      const unit = { type: hero, hero: { level: 5, experience: 700, cooldowns: {} } };
      const { healthPerLevel, damagePerLevel } = HEROES[hero];
      expect(maxHealthOf(unit)).toBe(combatOf(hero).health + 4 * healthPerLevel);
      expect(unitAttack(unit)?.damage).toBe(must(attackOf(hero)).damage + 4 * damagePerLevel);
      expect(Number.isInteger(maxHealthOf(unit))).toBe(true);
    }
  });

  it('add the new health to a hurt hero without healing the rest', () => {
    const g = game(MAP);
    const commander = g.find('commander');
    g.patch(commander.id, { health: 100 });
    g.step({ type: 'debugExperience', unitIds: [commander.id], amount: 250 });
    const after = g.unit(commander.id);
    expect(after.hero).toEqual({ level: 3, experience: 250, cooldowns: {} });
    expect(after.health).toBe(100 + 2 * HEROES.commander.healthPerLevel);
  });

  it('make a hero’s blows harder', () => {
    const blow = (experience: number) => {
      const g = game(only('commander', 4, 14));
      const hero = g.find('commander').id;
      if (experience > 0) g.step({ type: 'debugExperience', unitIds: [hero], amount: experience });
      const target = g.spawn('bob', 'ram', 4, 16);
      const full = g.unit(target).health;
      g.step({ type: 'attack', unitIds: [hero], targetId: target });
      g.run(60, () => g.unit(target).health < full);
      return full - g.unit(target).health;
    };
    // Twice the damage per level, times the bonus against siege engines.
    expect(blow(700) - blow(0)).toBe(4 * HEROES.commander.damagePerLevel * 2);
  });

  it('give dev experience only to the issuer’s heroes, and only in development', () => {
    const g = game(MAP);
    const soldier = g.spawn('alice', 'swordsman', 0, 20);
    const command: Command = { type: 'debugExperience', unitIds: [soldier], amount: 50 };
    expect(validateCommand(g.ctx, g.state, 'alice', command).issues).toEqual(['noUnits']);
    expect(parseCommand(command)).toEqual(command);
    expect(parseCommand({ ...command, amount: -1 })).toBeNull();
    expect(parseCommand({ ...command, amount: 1e9 })).toBeNull();
  });
});

describe('experience', () => {
  const worth = UNITS.skeletonMinion.experience;

  it('is all the hero’s for its own kill, wherever its side stands', () => {
    const g = game(only('commander', 4, 14));
    const hero = g.find('commander').id;
    const victim = g.spawn('bob', 'skeletonMinion', 4, 17);
    expect(kill(g, hero, hero, victim)).toBe(worth);
  });

  it('counts an arrow’s kill for the one who shot it', () => {
    const g = game(only('archmage', 6, 14));
    const mage = g.find('archmage').id;
    const victim = g.spawn('bob', 'skeletonMinion', 6, 21);
    expect(kill(g, mage, mage, victim)).toBe(worth);
  });

  it('is shared by half for its side’s kills nearby, and not for far ones', () => {
    const g = game(only('commander', 0, 20));
    const hero = g.find('commander').id;
    g.pacify(hero);
    const near = g.spawn('bob', 'skeletonMinion', 0, 28);
    const killer = g.spawn('alice', 'archer', 5, 28);
    expect(kill(g, hero, killer, near)).toBe(Math.floor(worth / 2));
    const far = g.spawn('bob', 'skeletonMinion', 30, 28);
    const other = g.spawn('alice', 'archer', 35, 28);
    expect(kill(g, hero, other, far)).toBe(0);
  });

  it('is shared by every hero of the side nearby', () => {
    const g = game(MAP);
    const commander = g.find('commander').id;
    const mage = g.find('archmage').id;
    g.pacify(mage);
    const victim = g.spawn('bob', 'skeletonMinion', 4, 17);
    const before = must(g.unit(mage).hero).experience;
    expect(kill(g, commander, commander, victim)).toBe(worth);
    expect(must(g.unit(mage).hero).experience - before).toBe(Math.floor(worth / 2));
  });

  it('never comes from a kill another side made', () => {
    const g = game(only('commander', 4, 14));
    const hero = g.find('commander').id;
    g.pacify(hero);
    // Monsters kill bob's serf right next to the hero.
    const victim = g.spawn('bob', 'serf', 4, 18);
    g.spawn('monsters', 'skeletonWarrior', 4, 19);
    g.patch(victim, { health: 1 });
    g.run(200, () => !isAlive(g.unit(victim)));
    expect(isAlive(g.unit(victim))).toBe(false);
    expect(must(g.unit(hero).hero).experience).toBe(0);
  });

  it('comes from a tower of its side too', () => {
    const g = game(only('commander', 0, 20));
    const hero = g.find('commander').id;
    g.pacify(hero);
    // The fort's southern towers cover the spot where the skeleton appears.
    g.step({ type: 'debugFort', x: 0, z: 34 });
    const victim = g.spawn('bob', 'skeletonMinion', 0, 22);
    g.patch(victim, { health: 1 });
    g.run(100, () => !g.state.units.some((u) => u.id === victim && isAlive(u)));
    expect(must(g.unit(hero).hero).experience).toBe(Math.floor(worth / 2));
  });

  it('hides another player’s experience in the player view, not the level', () => {
    const g = game(MAP);
    const hero = g.find('commander').id;
    g.step({ type: 'debugExperience', unitIds: [hero], amount: 300 });
    g.spawn('bob', 'archer', 4, 24);
    const vision = createVision(g.ctx.world.map, 'bob');
    updateVision(vision, g.state);
    const seen = must(viewOf(g.ctx.world, g.state, vision).units.find((u) => u.id === hero));
    expect(seen.hero).toEqual({ level: 3, experience: 0, cooldowns: {} });
  });

  it('the same orders give the same heroes', () => {
    const play = () => {
      const g = game(MAP);
      for (const z of [18, 19, 20, 21]) g.spawn('bob', 'skeletonMinion', 5, z);
      g.run(300);
      return g.state;
    };
    const first = play();
    expect(first).toEqual(play());
    expect(first.units.some((u) => (u.hero?.experience ?? 0) > 0)).toBe(true);
  });
});
