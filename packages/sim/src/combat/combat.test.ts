import {
  COMBAT_RULES,
  combatOf,
  damageAgainst,
  UNITS,
  type AttackDefinition,
  type UnitKind,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../commands/applyCommand.js';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { populationUsed } from '../economy/population.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { createUnit, isAlive, type UnitInstance } from '../state/units.js';
import { now, report } from '../test/bench.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { applyHits, Hits } from './damage.js';
import { areEnemies } from './hostility.js';
import { landProjectiles, type Projectile } from './projectiles.js';

const world = createWorld(FLAT_MAP, TOWN);

/** Open, flat ground west of the Town Hall (the lake is at +35, +35). */
const FIELD = { x: -25, z: -10 };

function battle({ dev = true } = {}) {
  const initial = createInitialState(world, { owner: 'alice', players: ['bob'] });
  const ctx = createSimContext(world, initial, { dev });
  let state: GameState = initial;
  const game = {
    ctx,
    get state() {
      return state;
    },
    /** One tick with the given commands, all from `issuer`. */
    step(issuer: PlayerId = 'alice', ...commands: Command[]): CommandResult[] {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      );
      state = result.state;
      return result.results;
    },
    /** Spawns units for `owner`; returns their ids. */
    spawn(owner: PlayerId, unit: UnitKind, x: number, z: number, count = 1): EntityId[] {
      const first = state.nextEntityId;
      const [result] = game.step(owner, { type: 'debugSpawn', unit, count, x, z });
      expect(result?.ok).toBe(true);
      return Array.from({ length: count }, (_, i) => first + i);
    },
    spawnOne(owner: PlayerId, unit: UnitKind, x: number, z: number): EntityId {
      return game.spawn(owner, unit, x, z, 1)[0] as EntityId;
    },
    run(ticks: number, until?: (s: GameState) => boolean): number {
      for (let i = 0; i < ticks; i++) {
        if (until?.(state)) return i;
        game.step();
      }
      return ticks;
    },
    unit(id: EntityId): UnitInstance | undefined {
      return state.units.find((u) => u.id === id);
    },
  };
  return game;
}

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
const dead = (u: UnitInstance | undefined) => !u || !isAlive(u);

describe('damage and counters', () => {
  it('applies class bonuses, then armor, and never goes below 1', () => {
    const sword = combatOf('swordsman').attack as AttackDefinition;
    const spear = combatOf('spearman').attack as AttackDefinition;
    const bow = combatOf('archer').attack as AttackDefinition;
    // Swordsmen are strong against infantry: 12 × 1.5 − 1 armor.
    expect(damageAgainst(sword, combatOf('spearman'))).toBe(17);
    // No bonus against archers (ranged), no armor.
    expect(damageAgainst(sword, combatOf('archer'))).toBe(12);
    // Spearmen break buildings: 9 × 3.
    expect(damageAgainst(spear, { armor: 0, armorClass: 'building' })).toBe(27);
    // Arrows lose most of their damage on the swordsman's armor: 8 − 3.
    expect(damageAgainst(bow, combatOf('swordsman'))).toBe(5);
    expect(damageAgainst(bow, { armor: 50, armorClass: 'infantry' })).toBe(1);
  });

  it('treats different owners as enemies and neutral as nobody’s enemy', () => {
    expect(areEnemies('alice', 'bob')).toBe(true);
    expect(areEnemies('alice', 'alice')).toBe(false);
    expect(areEnemies('alice', null)).toBe(false);
    expect(areEnemies(null, null)).toBe(false);
  });

  it('gives every unit its health; only soldiers get a combat state', () => {
    for (const kind of Object.keys(UNITS) as UnitKind[]) {
      const unit = createUnit(1, kind, 'alice', { x: 0, z: 0 });
      expect(unit.health).toBe(combatOf(kind).health);
      expect(unit.combat !== null).toBe(combatOf(kind).attack !== undefined);
    }
  });
});

describe('dev spawn', () => {
  it('is rejected unless the context is a dev one', () => {
    const game = battle({ dev: false });
    const [result] = game.step('alice', {
      type: 'debugSpawn',
      unit: 'swordsman',
      count: 1,
      x: FIELD.x,
      z: FIELD.z,
    });
    expect(result).toMatchObject({ ok: false, check: { issues: ['devOnly'] } });
  });

  it('parses only well-formed input', () => {
    const base = { type: 'debugSpawn', unit: 'archer', count: 3, x: 1, z: 2 };
    expect(parseCommand(base)).toEqual(base);
    expect(parseCommand({ ...base, owner: null })).toEqual({ ...base, owner: null });
    expect(parseCommand({ ...base, unit: 'dragon' })).toBeNull();
    expect(parseCommand({ ...base, count: 0 })).toBeNull();
    expect(parseCommand({ ...base, count: 1000 })).toBeNull();
    expect(parseCommand({ ...base, owner: 5 })).toBeNull();
  });

  it('spawns units for another owner when asked', () => {
    const game = battle();
    game.step('alice', {
      type: 'debugSpawn',
      unit: 'spearman',
      count: 4,
      x: FIELD.x,
      z: FIELD.z,
      owner: 'bob',
    });
    const spawned = game.state.units.filter((u) => u.type === 'spearman');
    expect(spawned).toHaveLength(4);
    expect(spawned.every((u) => u.ownerId === 'bob')).toBe(true);
  });
});

describe('melee', () => {
  it('idle soldiers engage on their own; the counter wins and the loser is removed later', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const spear = game.spawnOne('bob', 'spearman', FIELD.x + 6, FIELD.z);
    game.run(seconds(30), () => dead(game.unit(spear)));

    const loser = game.unit(spear);
    expect(loser?.diedAt).not.toBeNull();
    expect(loser?.activity).toBe('dying');
    expect(loser?.health).toBe(0);
    const winner = game.unit(sword) as UnitInstance;
    expect(isAlive(winner)).toBe(true);
    // 90 health takes six 17-damage hits; the spearman lands at most six 6-damage hits.
    expect(winner.health).toBeLessThan(combatOf('swordsman').health);
    expect(winner.health).toBeGreaterThanOrEqual(combatOf('swordsman').health - 6 * 6);

    // The corpse lies for a while, then is gone.
    game.run(seconds(COMBAT_RULES.corpseSeconds) + 1);
    expect(game.unit(spear)).toBeUndefined();
    // The winner went back to where it engaged and stands idle.
    game.run(seconds(10));
    expect(game.unit(sword)?.activity).toBe('idle');
    expect(game.unit(sword)?.combat?.anchor).toBeNull();
  });

  it('kills villagers, who don’t fight back', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const serf = game.spawnOne('bob', 'serf', FIELD.x + 4, FIELD.z);
    game.run(seconds(20), () => dead(game.unit(serf)));
    expect(dead(game.unit(serf))).toBe(true);
    expect(game.unit(sword)?.health).toBe(combatOf('swordsman').health);
  });

  it('a strike in progress misses a target that got away', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const serf = game.spawnOne('bob', 'serf', FIELD.x + 1.5, FIELD.z);
    game.run(seconds(5), () => game.unit(sword)?.combat?.strikeAt != null);
    expect(game.unit(sword)?.combat?.strikeAt).not.toBeNull();
    // Bob's serf runs before the blow lands.
    game.step('bob', { type: 'moveUnits', unitIds: [serf], x: FIELD.x + 30, z: FIELD.z });
    game.run(seconds(COMBAT_RULES.leash / 2));
    expect(game.unit(serf)?.health).toBe(combatOf('serf').health);
  });
});

describe('arrows', () => {
  it('fly for a while, then hit for the counter damage', () => {
    const game = battle();
    const archer = game.spawnOne('alice', 'archer', FIELD.x, FIELD.z);
    const sword = game.spawnOne('bob', 'swordsman', FIELD.x + 9, FIELD.z);
    game.run(seconds(5), (s) => s.projectiles.length > 0);
    const arrow = game.state.projectiles[0] as Projectile;
    expect(arrow).toMatchObject({ attackerId: archer, targetId: sword, ownerId: 'alice' });
    expect(arrow.impactAt).toBeGreaterThan(arrow.firedAt);
    const before = (game.unit(sword) as UnitInstance).health;
    game.run(arrow.impactAt - game.state.tick + 1);
    expect((game.unit(sword) as UnitInstance).health).toBe(before - 5);
  });

  it('land harmlessly when the target is already dead or gone', () => {
    const corpse = { ...createUnit(7, 'serf', 'bob', { x: 0, z: 0 }), health: 0, diedAt: 3 };
    const units = [corpse];
    const arrows: Projectile[] = [
      {
        attackerId: 1,
        ownerId: 'alice',
        targetId: 7,
        fromX: 5,
        fromZ: 0,
        firedAt: 1,
        impactAt: 4,
        damage: 8,
      },
      {
        attackerId: 1,
        ownerId: 'alice',
        targetId: 99,
        fromX: 5,
        fromZ: 0,
        firedAt: 2,
        impactAt: 4,
        damage: 8,
      },
    ];
    const hits = new Hits();
    expect(landProjectiles(arrows, 4, hits)).toEqual([]);
    applyHits(units, hits, 4);
    expect(units[0]).toEqual(corpse);
  });

  it('three archers kill a lone spearman while it closes in', () => {
    // Three archers against one spearman: arrows fly while it closes in.
    const game = battle();
    const archers = game.spawn('alice', 'archer', FIELD.x, FIELD.z, 3);
    const spear = game.spawnOne('bob', 'spearman', FIELD.x + 10, FIELD.z);
    game.run(seconds(30), () => dead(game.unit(spear)));
    expect(dead(game.unit(spear))).toBe(true);
    expect(archers.every((id) => !dead(game.unit(id)))).toBe(true);
  });
});

describe('orders', () => {
  it('attack: chases an enemy beyond sight range until it dies, then stands', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const serf = game.spawnOne('bob', 'serf', FIELD.x, FIELD.z + 20);
    const [result] = game.step('alice', { type: 'attack', unitIds: [sword], targetId: serf });
    expect(result?.ok).toBe(true);
    game.run(seconds(30), () => dead(game.unit(serf)));
    expect(dead(game.unit(serf))).toBe(true);
    game.run(2);
    expect(game.unit(sword)?.task.kind).toBe('idle');
  });

  it('attack is validated: a target, an enemy, and own fighting units', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const friend = game.spawnOne('alice', 'serf', FIELD.x + 3, FIELD.z);
    const enemy = game.spawnOne('bob', 'serf', FIELD.x + 30, FIELD.z);
    const attack = (unitIds: EntityId[], targetId: EntityId) =>
      game.step('alice', { type: 'attack', unitIds, targetId })[0];
    expect(attack([sword], 9999)).toMatchObject({ check: { issues: ['noTarget'] } });
    expect(attack([sword], friend)).toMatchObject({ check: { issues: ['notEnemy'] } });
    expect(attack([friend], enemy)).toMatchObject({ check: { issues: ['noUnits'] } });
    // Bob can't order Alice's swordsman.
    const [stolen] = game.step('bob', { type: 'attack', unitIds: [sword], targetId: friend });
    expect(stolen).toMatchObject({ check: { issues: ['noUnits'] } });
  });

  it('move: walks past enemies without fighting', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const serf = game.spawnOne('bob', 'serf', FIELD.x + 2, FIELD.z);
    game.step('alice', { type: 'moveUnits', unitIds: [sword], x: FIELD.x + 15, z: FIELD.z });
    let attacked = false;
    for (let i = 0; i < seconds(8); i++) {
      game.step();
      if (game.unit(sword)?.activity === 'attacking') attacked = true;
    }
    expect(attacked).toBe(false);
    expect(game.unit(serf)?.health).toBe(combatOf('serf').health);
  });

  it('leash: a unit that engaged on its own gives up a long chase and walks back', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const serf = game.spawnOne('bob', 'serf', FIELD.x + 5, FIELD.z);
    game.run(seconds(1), () => game.unit(sword)?.combat?.targetId === serf);
    expect(game.unit(sword)?.combat?.anchor).toEqual({ x: FIELD.x, z: FIELD.z });
    // The serf flees far away; the swordsman (barely faster) can't catch it within the leash.
    game.step('bob', { type: 'moveUnits', unitIds: [serf], x: FIELD.x + 40, z: FIELD.z });
    game.run(seconds(40));
    const back = game.unit(sword) as UnitInstance;
    expect(Math.hypot(back.x - FIELD.x, back.z - FIELD.z)).toBeLessThan(1.5);
    expect(back.combat).toMatchObject({ targetId: null, anchor: null });
    expect(back.activity).toBe('idle');
  });

  it('attack-move: fights through enemies on the way and arrives', () => {
    const game = battle();
    const swords = game.spawn('alice', 'swordsman', FIELD.x, FIELD.z, 3);
    const serfs = game.spawn('bob', 'serf', FIELD.x, FIELD.z + 10, 2);
    const goal = { x: FIELD.x, z: FIELD.z + 25 };
    game.step('alice', { type: 'attackMove', unitIds: swords, ...goal });
    game.run(seconds(40), (s) =>
      swords.every((id) => s.units.find((u) => u.id === id)?.task.kind === 'idle'),
    );
    expect(serfs.every((id) => dead(game.unit(id)))).toBe(true);
    for (const id of swords) {
      const u = game.unit(id) as UnitInstance;
      expect(u.task.kind).toBe('idle');
      expect(Math.hypot(u.x - goal.x, u.z - goal.z)).toBeLessThan(3);
    }
  });

  it('attack-move: units that don’t fight just walk', () => {
    const game = battle();
    const serf = game.spawnOne('alice', 'serf', FIELD.x, FIELD.z);
    game.step('alice', { type: 'attackMove', unitIds: [serf], x: FIELD.x + 5, z: FIELD.z });
    expect(game.unit(serf)?.task.kind).toBe('move');
  });

  it('stop: drops the target and the order', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const serf = game.spawnOne('bob', 'serf', FIELD.x, FIELD.z + 20);
    game.step('alice', { type: 'attack', unitIds: [sword], targetId: serf });
    game.run(5);
    game.step('alice', { type: 'stop', unitIds: [sword] });
    const stopped = game.unit(sword) as UnitInstance;
    expect(stopped.task.kind).toBe('idle');
    expect(stopped.movement).toBeNull();
    expect(stopped.combat).toMatchObject({ targetId: null, strikeAt: null, anchor: null });
  });
});

describe('the dead', () => {
  it('free their housing at once and take no orders', () => {
    const game = battle();
    const sword = game.spawnOne('alice', 'swordsman', FIELD.x, FIELD.z);
    const serf = game.spawnOne('bob', 'serf', FIELD.x + 3, FIELD.z);
    const before = populationUsed(game.state.units, 'bob');
    game.run(seconds(20), () => dead(game.unit(serf)));
    expect(populationUsed(game.state.units, 'bob')).toBe(before - 1);
    const [move] = game.step('bob', { type: 'moveUnits', unitIds: [serf], x: 0, z: 0 });
    expect(move).toMatchObject({ ok: false, check: { issues: ['noUnits'] } });
    expect(game.unit(sword)?.combat?.targetId).toBeNull();
  });
});

describe('determinism', () => {
  it('the same battle gives the same state on every run', () => {
    const play = () => {
      const game = battle();
      const red = [
        ...game.spawn('alice', 'swordsman', FIELD.x, FIELD.z, 5),
        ...game.spawn('alice', 'archer', FIELD.x - 4, FIELD.z, 4),
      ];
      const blue = [
        ...game.spawn('bob', 'spearman', FIELD.x + 12, FIELD.z, 6),
        ...game.spawn('bob', 'archer', FIELD.x + 16, FIELD.z, 3),
      ];
      // Both armies attack-move into each other.
      game.step('alice', { type: 'attackMove', unitIds: red, x: FIELD.x + 14, z: FIELD.z });
      game.step('bob', { type: 'attackMove', unitIds: blue, x: FIELD.x, z: FIELD.z });
      game.run(seconds(45));
      return game.state;
    };
    const a = play();
    const b = play();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Something actually happened: soldiers died (18 were spawned).
    const soldiersLeft = a.units.filter((u) => u.type !== 'serf' && isAlive(u)).length;
    expect(soldiersLeft).toBeLessThan(18);
  });
});

describe('performance', () => {
  it('runs a 100 vs 100 battle within the tick budget', () => {
    const game = battle();
    const red = [
      ...game.spawn('alice', 'swordsman', FIELD.x, FIELD.z - 8, 40),
      ...game.spawn('alice', 'spearman', FIELD.x, FIELD.z + 8, 30),
      ...game.spawn('alice', 'archer', FIELD.x - 10, FIELD.z, 30),
    ];
    const blue = [
      ...game.spawn('bob', 'swordsman', FIELD.x + 30, FIELD.z - 8, 40),
      ...game.spawn('bob', 'spearman', FIELD.x + 30, FIELD.z + 8, 30),
      ...game.spawn('bob', 'archer', FIELD.x + 40, FIELD.z, 30),
    ];
    game.step('alice', { type: 'attackMove', unitIds: red, x: FIELD.x + 30, z: FIELD.z });
    game.step('bob', { type: 'attackMove', unitIds: blue, x: FIELD.x, z: FIELD.z });
    const times: number[] = [];
    for (let i = 0; i < seconds(40); i++) {
      const start = now();
      game.step();
      times.push(now() - start);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p99 = times[Math.floor(times.length * 0.99)] as number;
    const alive = game.state.units.filter((u) => u.type !== 'serf' && isAlive(u)).length;
    report(
      `100 vs 100 battle: mean ${mean.toFixed(2)} ms/tick, p99 ${p99.toFixed(2)} ms, max ${(times.at(-1) as number).toFixed(2)} ms, ${alive} soldiers left after 40 s`,
    );
    expect(mean).toBeLessThan(10);
  });
});
