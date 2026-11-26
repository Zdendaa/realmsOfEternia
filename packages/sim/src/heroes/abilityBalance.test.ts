/**
 * Whether each ability is clearly noticeable, measured in simulated fights against the
 * units' own health. The assertions are relations, so the numbers in game-data can
 * still be tuned; the report lines show the measured outcomes.
 */
import {
  abilityOf,
  buildingHealthOf,
  combatOf,
  HERO_RULES,
  type AbilityId,
  type HeroId,
  type UnitKind,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive, type CastTarget, type UnitInstance } from '../state/units.js';
import { report } from '../test/bench.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { formationOffsets } from '../units/orders.js';
import { maxHealthOf } from './heroes.js';

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

/** A hero of `type` at (0, 20) at the level that unlocks what is measured. */
function fight(type: HeroId, level: number) {
  const map = { ...FLAT_MAP, startingHeroes: [{ player: 0, hero: type, x: 0, z: 20 }] };
  const world = createWorld(map, { ...TOWN, startingSerfs: 0 });
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const hero = initial.units.find((u) => u.hero)?.id ?? 0;
  const g = {
    hero,
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
    run(ticks: number) {
      for (let i = 0; i < ticks; i++) g.step();
    },
    /** `count` units in a group around (x, z). */
    group(owner: string, unit: UnitKind, x: number, z: number, count: number): EntityId[] {
      const first = state.nextEntityId;
      g.step({ type: 'debugSpawn', unit, count, x, z, owner });
      return formationOffsets(count).map((_, i) => first + i);
    },
    patch(ids: readonly EntityId[], change: (u: UnitInstance) => Partial<UnitInstance>) {
      state = {
        ...state,
        units: state.units.map((u) => (ids.includes(u.id) ? { ...u, ...change(u) } : u)),
      };
    },
    /** They stand where they are and never strike. */
    pacify(ids: readonly EntityId[]) {
      g.patch(ids, (u) => ({
        combat: u.combat && { ...u.combat, readyAt: Number.MAX_SAFE_INTEGER },
      }));
    },
    alive: (ids: readonly EntityId[]) =>
      state.units.filter((u) => ids.includes(u.id) && isAlive(u)).length,
    healthSum: (ids: readonly EntityId[]) =>
      state.units.filter((u) => ids.includes(u.id)).reduce((sum, u) => sum + u.health, 0),
    cast(ability: AbilityId, target?: CastTarget) {
      const before = state.casts.length;
      g.step({
        type: 'useAbility',
        unitId: hero,
        ability,
        ...(target ? { target } : {}),
      });
      for (let i = 0; i < seconds(20) && state.casts.length === before; i++) g.step();
      if (state.casts.length === before) throw new Error(`${ability} never took effect`);
      g.step();
    },
  };
  g.step({
    type: 'debugExperience',
    unitIds: [hero],
    amount: HERO_RULES.levelExperience[level - 1] || 1,
  });
  return g;
}

const percent = (part: number, whole: number) => Math.round((100 * part) / whole);

/** What a spell aimed at a standing group does: how many die, and the health the rest lose. */
function blast(type: HeroId, ability: AbilityId, unit: UnitKind, count: number) {
  const g = fight(type, abilityOf(ability).level);
  g.pacify([g.hero]);
  const ids = g.group('bob', unit, 0, 28, count);
  g.pacify(ids);
  g.cast(ability, abilityOf(ability).target === 'point' ? { x: 0, z: 28 } : undefined);
  const full = count * combatOf(unit).health;
  return { killed: count - g.alive(ids), lost: percent(full - g.healthSum(ids), full) };
}

/** Shockwave needs the group around the Commander. */
function shockwave(unit: UnitKind, count: number) {
  const g = fight('commander', 3);
  g.pacify([g.hero]);
  const ids = g.group('bob', unit, 0, 22, count);
  g.pacify(ids);
  g.cast('shockwave');
  const full = count * combatOf(unit).health;
  return { killed: count - g.alive(ids), lost: percent(full - g.healthSum(ids), full) };
}

/** Six swordsmen against skeleton warriors, with or without the Commander's cry. */
function battle(ability: AbilityId | null, level: number, enemies: number, forSeconds: number) {
  const g = fight('commander', level);
  // The hero only casts: what is measured is what the ability does for the others.
  g.pacify([g.hero]);
  const own = g.group('alice', 'swordsman', 0, 24, 6);
  const foes = g.group('bob', 'skeletonWarrior', 0, 28, enemies);
  if (ability) g.cast(ability);
  else g.run(seconds(0.6));
  g.run(seconds(forSeconds));
  const full = (ids: readonly EntityId[], unit: UnitKind) => ids.length * combatOf(unit).health;
  return {
    own: g.alive(own),
    foes: g.alive(foes),
    ownLost: full(own, 'swordsman') - g.healthSum(own),
    foesLost: full(foes, 'skeletonWarrior') - g.healthSum(foes),
  };
}

/** Seconds a group needs to walk 12 units after a Frost Nova (or without one). */
function march(frost: boolean) {
  const g = fight('archmage', 3);
  g.pacify([g.hero]);
  const ids = g.group('bob', 'skeletonWarrior', 0, 29, 6);
  g.pacify(ids);
  if (frost) g.cast('frostNova', { x: 0, z: 29 });
  g.patch(ids, (u) => ({
    task: { kind: 'move', x: u.x + 12, z: u.z },
    movement: {
      goal: { x: u.x + 12, z: u.z },
      waypoints: [{ x: u.x + 12, z: u.z }],
      next: 0,
      stuckTicks: 0,
      bestDistance: 999,
      replans: 0,
    },
  }));
  const start = g.state.units.find((u) => u.id === ids[0])?.x ?? 0;
  let ticks = 0;
  while (ticks < seconds(60)) {
    const x = g.state.units.find((u) => u.id === ids[0])?.x ?? 0;
    if (x - start >= 11) break;
    g.step();
    ticks++;
  }
  return ticks / SIMULATION_TICK_RATE;
}

/** Six hurt swordsmen healed: the share of their full health given back. */
function heal() {
  const g = fight('archmage', 5);
  const ids = g.group('alice', 'swordsman', 3, 22, 6);
  g.patch(ids, () => ({ health: 10 }));
  g.cast('massHeal');
  const full = 6 * combatOf('swordsman').health;
  const hero = g.state.units.find((u) => u.id === g.hero);
  return { restored: percent(g.healthSum(ids) - 60, full), hero: hero ? maxHealthOf(hero) : 0 };
}

const sapper = () => {
  const damage = abilityOf('sapperCharge').effects.find((e) => e.kind === 'damage');
  const amount = damage?.kind === 'damage' ? damage.amount : 0;
  return (['stoneWall', 'woodenTower', 'house', 'stoneTower', 'barracks'] as const).map(
    (type) => [type, Math.min(100, percent(amount, buildingHealthOf(type)))] as const,
  );
};

const results = {
  fireball: () => ({
    minions: blast('archmage', 'fireball', 'skeletonMinion', 6),
    archers: blast('archmage', 'fireball', 'archer', 6),
    warriors: blast('archmage', 'fireball', 'skeletonWarrior', 6),
    swordsmen: blast('archmage', 'fireball', 'swordsman', 6),
  }),
  volley: () => ({
    minions: blast('pathfinder', 'volley', 'skeletonMinion', 8),
    warriors: blast('pathfinder', 'volley', 'skeletonWarrior', 8),
  }),
  shockwave: () => ({
    minions: shockwave('skeletonMinion', 8),
    warriors: shockwave('skeletonWarrior', 8),
  }),
};

describe('how much each ability does', () => {
  it('Fireball wipes out a group of weak units and badly hurts tougher ones', () => {
    const r = results.fireball();
    report(`fireball ${JSON.stringify(r)}`);
    expect(r.minions.killed).toBe(6);
    expect(r.archers.killed).toBe(6);
    expect(r.warriors.lost).toBeGreaterThanOrEqual(65);
    expect(r.swordsmen.lost).toBeGreaterThanOrEqual(60);
  });

  it('Volley and Shockwave clear weak units and halve tougher ones', () => {
    for (const [name, r] of [
      ['volley', results.volley()],
      ['shockwave', results.shockwave()],
    ] as const) {
      report(`${name} ${JSON.stringify(r)}`);
      expect(r.minions.killed).toBe(8);
      expect(r.warriors.lost).toBeGreaterThanOrEqual(45);
    }
  });

  it('Frost Nova hurts and nearly halves how fast a group closes in', () => {
    const [without, frosted] = [march(false), march(true)];
    report(`frostNova march ${without} s -> ${frosted} s`);
    expect(frosted).toBeGreaterThanOrEqual(without * 1.7);
  });

  it('Rally decides an even fight', () => {
    const [without, rallied] = [battle(null, 1, 6, 15), battle('rally', 1, 6, 15)];
    report(`rally without ${JSON.stringify(without)} with ${JSON.stringify(rallied)}`);
    expect(without.foes).toBeGreaterThan(0);
    expect(rallied.foes).toBe(0);
    expect(rallied.ownLost).toBeLessThan(without.ownLost);
  });

  it('Last Stand saves most of the damage taken', () => {
    const [without, standing] = [battle(null, 5, 10, 10), battle('lastStand', 5, 10, 10)];
    report(`lastStand without ${JSON.stringify(without)} with ${JSON.stringify(standing)}`);
    expect(standing.ownLost).toBeLessThan(without.ownLost * 0.45);
  });

  it('Mass Heal brings badly hurt soldiers nearly back to full', () => {
    const r = heal();
    report(`massHeal ${JSON.stringify(r)}`);
    expect(r.restored).toBeGreaterThanOrEqual(90);
  });

  it('Sapper Charge levels a house or wooden tower and cripples stone', () => {
    const r = Object.fromEntries(sapper());
    report(`sapper ${JSON.stringify(r)}`);
    expect(r.house).toBe(100);
    expect(r.woodenTower).toBe(100);
    for (const stone of ['stoneWall', 'stoneTower', 'barracks']) {
      expect(r[stone]).toBeGreaterThanOrEqual(65);
    }
  });
});
