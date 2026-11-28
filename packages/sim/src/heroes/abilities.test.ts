import {
  ABILITIES,
  abilityOf,
  type AbilityEffect,
  combatOf,
  HERO_IDS,
  HERO_RULES,
  HEROES,
  UNITS,
  type AbilityId,
  type HeroId,
  type UnitKind,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { validateCommand } from '../commands/applyCommand.js';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive, type CastTarget, type UnitInstance } from '../state/units.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { viewOf } from '../vision/view.js';
import { createVision, isExplored, isVisible, updateVision } from '../vision/vision.js';
import { createWorld } from '../world/createWorld.js';
import { maxHealthOf } from './heroes.js';

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

/** An ability's effect of a kind, as game-data has it (the numbers are tuned there). */
function effect<K extends AbilityEffect['kind']>(ability: AbilityId, kind: K) {
  const found = abilityOf(ability).effects.find((e) => e.kind === kind);
  return must(found) as Extract<AbilityEffect, { kind: K }>;
}

/** The value, which the test expects to exist. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('missing');
  return value;
}

/** Experience that brings a hero to `level`. */
const experienceFor = (level: number) => HERO_RULES.levelExperience[level - 1] ?? 0;

/** The flat map: alice has one hero of `type` at (0, 20), at `level`. */
function game(type: HeroId = 'commander', level = 5) {
  const map = {
    ...FLAT_MAP,
    startSlots: [{ x: 0, z: 0, quarterTurns: 0 as const, heroes: [{ hero: type, x: 0, z: 20 }] }],
  };
  const world = createWorld(map, { ...TOWN, startingSerfs: 0 });
  const initial = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, initial, { dev: true, visions: ['alice'] });
  let state: GameState = initial;
  const g = {
    ctx,
    hero: must(initial.units.find((u) => u.hero)).id,
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
      let i = 0;
      for (; i < ticks && !until?.(); i++) g.step();
      return i;
    },
    spawn(owner: string, unit: UnitKind, x: number, z: number): EntityId {
      const id = state.nextEntityId;
      g.step({ type: 'debugSpawn', unit, count: 1, x, z, owner });
      return id;
    },
    unit: (id: EntityId) => must(state.units.find((u) => u.id === id)),
    me: () => g.unit(g.hero),
    patch(id: EntityId, change: Partial<UnitInstance>) {
      state = { ...state, units: state.units.map((u) => (u.id === id ? { ...u, ...change } : u)) };
    },
    /** Keeps a fighter from ever striking, so only abilities do anything. */
    pacify(...ids: EntityId[]) {
      for (const id of ids) {
        g.patch(id, { combat: { ...must(g.unit(id).combat), readyAt: Number.MAX_SAFE_INTEGER } });
      }
    },
    command: (ability: AbilityId, target?: CastTarget): Command => ({
      type: 'useAbility',
      unitId: g.hero,
      ability,
      ...(target === undefined ? {} : { target }),
    }),
    check: (ability: AbilityId, target?: CastTarget) =>
      validateCommand(ctx, state, 'alice', g.command(ability, target)).issues,
    /** Orders the ability and runs until it has taken effect. */
    cast(ability: AbilityId, target?: CastTarget) {
      expect(g.check(ability, target)).toEqual([]);
      const before = state.casts.length;
      g.step(g.command(ability, target));
      g.run(seconds(30), () => state.casts.length > before);
      expect(state.casts.at(-1)?.ability).toBe(ability);
    },
  };
  if (level > 1) {
    g.step({ type: 'debugExperience', unitIds: [g.hero], amount: experienceFor(level) });
  }
  g.pacify(g.hero);
  return g;
}

const health = (g: ReturnType<typeof game>, id: EntityId) => g.unit(id).health;

describe('using abilities', () => {
  it('gives every hero three abilities, unlocking at levels 1, 3 and 5', () => {
    for (const hero of HERO_IDS) {
      expect(HEROES[hero].abilities.map((a) => abilityOf(a).level)).toEqual([1, 3, 5]);
    }
    expect(new Set(HERO_IDS.flatMap((h) => HEROES[h].abilities)).size).toBe(
      Object.keys(ABILITIES).length,
    );
  });

  it('refuses what the hero has not got, not yet unlocked, or still cooling down', () => {
    const g = game('commander', 2);
    expect(g.check('fireball', { x: 0, z: 25 })).toEqual(['noSuchAbility']);
    expect(g.check('shockwave')).toEqual(['abilityLocked']);
    g.cast('rally');
    expect(g.check('rally')).toEqual(['onCooldown']);
    g.run(seconds(abilityOf('rally').cooldown));
    expect(g.check('rally')).toEqual([]);
  });

  it('asks for the right kind of target, on the map and in sight', () => {
    const g = game('archmage');
    expect(g.check('fireball')).toEqual(['badTarget']);
    expect(g.check('fireball', { id: 1 })).toEqual(['badTarget']);
    expect(g.check('massHeal', { x: 0, z: 25 })).toEqual(['badTarget']);
    expect(g.check('fireball', { x: 500, z: 0 })).toEqual(['outOfBounds']);
    expect(g.check('fireball', { x: -45, z: -45 })).toEqual(['notVisible']);
    expect(g.check('fireball', { x: 0, z: 28 })).toEqual([]);
  });

  it('only takes an order for an own living hero', () => {
    const g = game();
    const soldier = g.spawn('alice', 'swordsman', 3, 20);
    const bobs = g.spawn('bob', 'archmage', 20, 20);
    const refused = (unitId: number) =>
      validateCommand(g.ctx, g.state, 'alice', { type: 'useAbility', unitId, ability: 'rally' })
        .issues;
    expect(refused(soldier)).toEqual(['noSuchAbility']);
    expect(refused(bobs)).toEqual(['noUnits']);
    expect(refused(999)).toEqual(['noUnits']);
  });

  it('walks into range first, casts, and only then starts the cooldown', () => {
    const g = game('archmage');
    // A scout so the far point is in sight.
    g.spawn('alice', 'serf', 0, 40);
    const target = { x: 0, z: 44 };
    g.step(g.command('fireball', target));
    expect(g.me().activity).toBe('walking');
    g.run(seconds(10), () => g.me().activity === 'casting');
    expect(Math.hypot(g.me().x - target.x, g.me().z - target.z)).toBeLessThan(10.1);
    expect(Math.hypot(g.me().x - target.x, g.me().z - target.z)).toBeGreaterThan(9);
    expect(g.me().hero?.cooldowns).toEqual({});
    const ticks = g.run(seconds(3), () => g.state.casts.length > 0);
    expect(ticks).toBe(seconds(abilityOf('fireball').castTime));
    expect(g.me().task.kind).toBe('idle');
    expect(g.me().hero?.cooldowns.fireball).toBeGreaterThan(g.state.tick + seconds(14));
  });

  it('loses nothing when a new order breaks off the casting', () => {
    const g = game();
    g.step(g.command('rally'));
    g.step();
    expect(g.me().activity).toBe('casting');
    g.step({ type: 'moveUnits', unitIds: [g.hero], x: 8, z: 20 });
    g.run(seconds(3));
    expect(g.state.casts).toEqual([]);
    expect(g.check('rally')).toEqual([]);
  });

  it('is put off by a stun, then goes ahead', () => {
    const g = game();
    g.step(g.command('rally'));
    g.patch(g.hero, { stunned: g.state.tick + seconds(2) });
    g.run(seconds(1.5));
    expect(g.state.casts).toEqual([]);
    g.run(seconds(2), () => g.state.casts.length > 0);
    expect(g.state.casts.map((c) => c.ability)).toEqual(['rally']);
  });

  it('gives up when the hero can’t get into range', () => {
    const g = game('pathfinder');
    g.step({ type: 'debugFort', x: 0, z: 40, owner: 'bob' });
    const tower = must(g.state.buildings.find((b) => b.type === 'stoneTower'));
    g.spawn('alice', 'serf', 0, 27);
    g.step(g.command('sapperCharge', { id: tower.id }));
    g.run(seconds(30), () => g.me().task.kind !== 'cast');
    expect(g.me().task.kind).toBe('idle');
    expect(g.state.casts).toEqual([]);
    expect(g.me().hero?.cooldowns).toEqual({});
  });

  it('is refused once the game is decided, and parses untrusted input', () => {
    const g = game();
    const over = { ...g.state, outcome: { alice: { result: 'lost', at: 1 } as const } };
    expect(validateCommand(g.ctx, over, 'alice', g.command('rally')).issues).toEqual(['gameOver']);
    const point = { type: 'useAbility', unitId: 2, ability: 'fireball', target: { x: 1, z: 2 } };
    expect(parseCommand({ ...point, extra: true })).toEqual(point);
    expect(parseCommand({ ...point, target: { id: 7, x: 'a' } })).toEqual({
      ...point,
      target: { id: 7 },
    });
    expect(parseCommand({ ...point, ability: 'meteor' })).toBeNull();
    expect(parseCommand({ ...point, target: 'there' })).toBeNull();
    expect(parseCommand({ ...point, target: { x: Number.NaN, z: 0 } })).toBeNull();
  });
});

describe('the Commander', () => {
  it('Rally: own units close by hit harder and walk faster, for a while', () => {
    const g = game();
    const near = g.spawn('alice', 'swordsman', 3, 20);
    const far = g.spawn('alice', 'swordsman', 20, 20);
    const enemy = g.spawn('bob', 'serf', 0, 27);
    g.pacify(near, far);
    g.cast('rally');
    expect(Object.keys(g.unit(near).boosts ?? {}).sort()).toEqual(['damage', 'speed']);
    expect(g.unit(g.hero).boosts).not.toBeNull();
    expect(g.unit(far).boosts).toBeNull();
    expect(g.unit(enemy).boosts).toBeNull();
    // Both walk 6 s along parallel lines.
    g.step({ type: 'moveUnits', unitIds: [near], x: 3, z: 45 });
    g.step({ type: 'moveUnits', unitIds: [far], x: 20, z: 45 });
    g.run(seconds(6));
    expect((g.unit(near).z - 20) / (g.unit(far).z - 20)).toBeGreaterThan(1.25);
    g.run(seconds(effect('rally', 'boost').seconds));
    expect(g.unit(near).boosts).toBeNull();
  });

  it('Rally: a boosted soldier’s blow does a quarter more', () => {
    const blow = (rally: boolean) => {
      const g = game();
      const soldier = g.spawn('alice', 'spearman', 3, 20);
      const target = g.spawn('bob', 'ram', 3, 22);
      g.step({ type: 'stop', unitIds: [soldier] });
      g.pacify(soldier);
      if (rally) g.cast('rally');
      g.patch(soldier, { combat: { ...must(g.unit(soldier).combat), readyAt: 0 } });
      const full = health(g, target);
      g.step({ type: 'attack', unitIds: [soldier], targetId: target });
      g.run(seconds(3), () => health(g, target) < full);
      return full - health(g, target);
    };
    expect(blow(true)).toBe(Math.round(blow(false) * effect('rally', 'boost').factor));
  });

  it('Shockwave: hurts and stuns enemies around, sparing its own side', () => {
    const g = game();
    const foe = g.spawn('bob', 'swordsman', 2, 20);
    const friend = g.spawn('alice', 'serf', -2, 20);
    const outside = g.spawn('bob', 'serf', 9, 20);
    g.cast('shockwave');
    // Spells ignore armor.
    expect(health(g, foe)).toBe(
      combatOf('swordsman').health - effect('shockwave', 'damage').amount,
    );
    expect(health(g, friend)).toBe(combatOf('serf').health);
    expect(health(g, outside)).toBe(combatOf('serf').health);
    const at = { x: g.unit(foe).x, z: g.unit(foe).z };
    const mine = health(g, g.hero);
    g.step();
    g.run(seconds(1.5));
    // Stunned: it neither strikes the hero beside it nor moves.
    expect(health(g, g.hero)).toBe(mine);
    expect(Math.hypot(g.unit(foe).x - at.x, g.unit(foe).z - at.z)).toBeLessThan(0.3);
    g.run(seconds(4), () => health(g, g.hero) < mine);
    expect(health(g, g.hero)).toBeLessThan(mine);
  });

  it('Last Stand: own units nearby take much less damage for a short time', () => {
    const lost = (stand: boolean) => {
      const g = game();
      const ally = g.spawn('alice', 'serf', 3, 20);
      if (stand) g.cast('lastStand');
      const foe = g.spawn('bob', 'swordsman', 3, 21);
      g.step({ type: 'stop', unitIds: [ally] });
      const full = health(g, ally);
      g.run(seconds(3), () => health(g, ally) < full);
      expect(g.unit(foe)).toBeDefined();
      return full - health(g, ally);
    };
    expect(lost(true)).toBe(Math.round(lost(false) * effect('lastStand', 'boost').factor));
  });
});

describe('the Archmage', () => {
  it('Fireball: hurts every enemy where it lands, and only them', () => {
    const g = game('archmage');
    const a = g.spawn('bob', 'swordsman', 0, 28);
    const b = g.spawn('bob', 'serf', 1.5, 28);
    const own = g.spawn('alice', 'swordsman', -1.5, 28);
    const away = g.spawn('bob', 'serf', 7, 28);
    g.pacify(a, own);
    g.cast('fireball', { x: 0, z: 28 });
    expect(health(g, a)).toBe(combatOf('swordsman').health - effect('fireball', 'damage').amount);
    expect(g.state.units.some((u) => u.id === b && isAlive(u))).toBe(false);
    expect(health(g, own)).toBe(combatOf('swordsman').health);
    expect(health(g, away)).toBe(combatOf('serf').health);
  });

  it('counts a spell’s kill as the hero’s own', () => {
    const g = game('archmage', 1);
    g.spawn('bob', 'serf', 0, 28);
    g.cast('fireball', { x: 0, z: 28 });
    expect(g.me().hero?.experience).toBe(UNITS.serf.experience);
  });

  it('Frost Nova: slows enemies in the area', () => {
    const g = game('archmage');
    const slow = g.spawn('bob', 'swordsman', 0, 28);
    const free = g.spawn('bob', 'swordsman', 20, 28);
    g.pacify(slow, free);
    g.cast('frostNova', { x: 0, z: 28 });
    expect(g.unit(slow).slowed?.factor).toBe(effect('frostNova', 'slow').factor);
    const start = [g.unit(slow).z, g.unit(free).z];
    g.patch(slow, { task: { kind: 'move', x: 0, z: 45 }, movement: null });
    const walk = (id: EntityId, x: number) => {
      const goal = { x, z: 45 };
      g.patch(id, {
        task: { kind: 'move', ...goal },
        movement: { goal, waypoints: [goal], next: 0, stuckTicks: 0, bestDistance: 99, replans: 0 },
      });
    };
    walk(slow, 0);
    walk(free, 20);
    g.run(seconds(3));
    const ratio = (g.unit(slow).z - must(start[0])) / (g.unit(free).z - must(start[1]));
    expect(ratio).toBeCloseTo(effect('frostNova', 'slow').factor, 1);
  });

  it('Mass Heal: heals own units nearby, never past full health', () => {
    const g = game('archmage');
    const hurt = g.spawn('alice', 'swordsman', 3, 20);
    const scratched = g.spawn('alice', 'swordsman', -3, 20);
    const foe = g.spawn('bob', 'ram', 0, 26);
    g.patch(hurt, { health: 1 });
    g.patch(scratched, { health: 100 });
    g.patch(foe, { health: 100 });
    g.patch(g.hero, { health: 20 });
    const amount = effect('massHeal', 'heal').amount;
    g.cast('massHeal');
    expect(health(g, hurt)).toBe(Math.min(combatOf('swordsman').health, 1 + amount));
    expect(health(g, scratched)).toBe(combatOf('swordsman').health);
    expect(health(g, g.hero)).toBe(20 + amount);
    expect(maxHealthOf(g.me())).toBeGreaterThan(20 + amount);
    expect(health(g, foe)).toBe(100);
  });
});

describe('the Pathfinder', () => {
  it('Eagle Eye: shows a far area through the fog for a while', () => {
    const g = game('pathfinder');
    const spot = { x: -30, z: -5 };
    const vision = must(g.ctx.visions.get('alice'));
    expect(isVisible(vision, spot.x, spot.z)).toBe(false);
    g.cast('eagleEye', spot);
    expect(isVisible(vision, spot.x, spot.z)).toBe(true);
    expect(isVisible(vision, spot.x - 10, spot.z)).toBe(true);
    g.run(seconds(effect('eagleEye', 'reveal').seconds - 1));
    expect(isVisible(vision, spot.x, spot.z)).toBe(true);
    g.run(seconds(2));
    expect(isVisible(vision, spot.x, spot.z)).toBe(false);
    expect(isExplored(vision, spot.x, spot.z)).toBe(true);
    expect(g.state.reveals).toEqual([]);
  });

  it('Volley: arrows rain on every enemy in the area', () => {
    const g = game('pathfinder');
    const ids = [-2, 0, 2].map((x) => g.spawn('bob', 'swordsman', x, 29));
    g.pacify(...ids);
    g.cast('volley', { x: 0, z: 29 });
    for (const id of ids)
      expect(health(g, id)).toBe(combatOf('swordsman').health - effect('volley', 'damage').amount);
  });

  it('Sapper Charge: heavy damage to one wall, from right beside it', () => {
    const g = game('pathfinder');
    g.step({ type: 'debugFort', x: 0, z: 40, owner: 'bob' });
    const segment = must(
      g.state.buildings.find((b) => b.type === 'stoneWall' && b.z === 30 && b.x === -1),
    );
    g.spawn('alice', 'serf', -1, 26);
    // Towers off, so the hero lives to set it.
    g.patch(g.hero, { boosts: { damageTaken: { factor: 0.01, until: 99_999 } } });
    g.cast('sapperCharge', { id: segment.id });
    expect(g.state.buildingDamage[segment.id]).toBe(effect('sapperCharge', 'damage').amount);
    const damaged = Object.keys(g.state.buildingDamage);
    expect(damaged).toEqual([String(segment.id)]);
    expect(30 - g.me().z).toBeLessThan(abilityOf('sapperCharge').range + 1.5);
  });

  it('takes no building order against its own side or what it can’t see', () => {
    const g = game('pathfinder');
    expect(g.check('sapperCharge', { id: 1 })).toEqual(['notEnemy']);
    expect(g.check('sapperCharge', { id: 999 })).toEqual(['noTarget']);
    g.step({ type: 'debugFort', x: 0, z: -40, owner: 'bob' });
    const hidden = must(g.state.buildings.find((b) => b.ownerId === 'bob' && b.z === -50));
    expect(g.check('sapperCharge', { id: hidden.id })).toEqual(['notVisible']);
  });
});

describe('the player view', () => {
  it('shows that another’s hero is casting, not what it aims at or has used', () => {
    const g = game('archmage');
    const watcher = g.spawn('bob', 'archer', 0, 30);
    g.pacify(watcher);
    g.step(g.command('fireball', { x: 8, z: 22 }));
    const bobs = createVision(g.ctx.world.map, 'bob');
    const view = () => {
      updateVision(bobs, g.state);
      return viewOf(g.ctx.world, g.state, bobs);
    };
    const seen = () => must(view().units.find((u) => u.id === g.hero));
    expect(seen().task).toMatchObject({ kind: 'cast', ability: 'fireball', target: null });
    g.run(seconds(3), () => g.state.casts.length > 0);
    // Where it took effect is in bob's sight, so he sees the burst.
    expect(view().casts.map((c) => c.ability)).toEqual(['fireball']);
    expect(seen().hero?.cooldowns).toEqual({});
  });
});

describe('determinism', () => {
  it('the same orders give the same game', () => {
    const play = () => {
      const g = game('commander');
      for (const x of [-3, 0, 3]) g.spawn('bob', 'skeletonWarrior', x, 26);
      for (const x of [-2, 2]) g.spawn('alice', 'swordsman', x, 22);
      g.step(g.command('rally'));
      g.run(seconds(3));
      g.step(g.command('shockwave'));
      g.run(seconds(20));
      return g.state;
    };
    expect(play()).toEqual(play());
  });
});
