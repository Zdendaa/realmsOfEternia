import {
  attackOf,
  BUILDING_COMBAT,
  BUILDINGS,
  buildingHealthOf,
  combatOf,
  damageAgainst,
  RESOURCE_IDS,
  towerOf,
  UNITS,
  type BuildingId,
  type ResourceAmounts,
  type TowerDefinition,
  type UnitKind,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command, PlaceWallCommand } from '../commands/types.js';
import { validateCommand } from '../commands/applyCommand.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { report } from '../test/bench.js';
import { FLAT_MAP, place, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';

const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 900])) as ResourceAmounts;
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

/** The value, which the test expects to exist. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing');
  return value;
}
const attackFor = (unit: UnitKind) => must(attackOf(unit));

const wall = (
  from: [number, number],
  to: [number, number],
  building: PlaceWallCommand['building'] = 'stoneWall',
): PlaceWallCommand => ({
  type: 'placeWall',
  building,
  from: { x: from[0], z: from[1] },
  to: { x: to[0], z: to[1] },
});

/** A game on the flat map: "alice" defends, "bob" besieges. Dev commands allowed. */
function game() {
  const world = createWorld(FLAT_MAP, { ...TOWN, startingSerfs: 0 });
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    ctx,
    get state() {
      return state;
    },
    step(issuer = 'alice', ...commands: Command[]) {
      state = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      ).state;
    },
    run(ticks: number, until?: (s: GameState) => boolean) {
      let i = 0;
      for (; i < ticks && !until?.(state); i++) g.step();
      return i;
    },
    /** Places walls and towers, then marks everything built. Returns the tower ids. */
    fortify(walls: readonly Command[], towers: readonly [number, number, BuildingId][] = []) {
      g.step('alice', ...walls);
      const ids = towers.map(([x, z]) => {
        const id = state.nextEntityId;
        g.step('alice', place('woodenTower', x, z));
        return id;
      });
      state = {
        ...state,
        construction: {},
        buildings: state.buildings.map((b) => {
          const type = towers[ids.indexOf(b.id)]?.[2];
          return { ...b, status: 'complete', type: type ?? b.type };
        }),
      };
      g.step();
      return ids;
    },
    spawn(owner: string, unit: UnitKind, x: number, z: number, count = 1) {
      const first = state.nextEntityId;
      g.step('alice', { type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i): EntityId => first + i);
    },
    unit: (id: EntityId) => state.units.find((u) => u.id === id),
    alive: (ids: readonly EntityId[]) =>
      state.units.filter((u) => ids.includes(u.id) && isAlive(u)).length,
    building: (id: EntityId) => state.buildings.find((b) => b.id === id),
    at: (x: number, z: number) => state.buildings.find((b) => b.x === x && b.z === z),
    damage: (id: EntityId) => state.buildingDamage[id] ?? 0,
    order(issuer: string, command: Command) {
      const check = validateCommand(ctx, state, issuer, command);
      g.step(issuer, command);
      return check;
    },
  };
  return g;
}

const wallsOf = (state: GameState) => state.buildings.filter((b) => b.type === 'stoneWall');

/** Damage per second of one `unit` against buildings. */
function buildingDps(unit: UnitKind) {
  const attack = attackFor(unit);
  return damageAgainst(attack, BUILDING_COMBAT) / attack.cooldown;
}

describe('siege numbers', () => {
  it('a catapult outranges every tower', () => {
    const towers = (Object.keys(BUILDINGS) as BuildingId[]).flatMap((id) => towerOf(id) ?? []);
    const longest = Math.max(...towers.map((t) => t.attack.range));
    expect(attackFor('catapult').range).toBeGreaterThan(longest + 1);
    expect(UNITS.catapult.sight).toBeGreaterThan(attackFor('catapult').range);
  });

  it('a ram does about three times a spearman’s damage to buildings', () => {
    const ratio = buildingDps('ram') / buildingDps('spearman');
    expect(ratio).toBeGreaterThan(2.7);
    expect(ratio).toBeLessThan(3.3);
  });

  it('arrows and light tower shots barely scratch a ram; swords bite', () => {
    const ram = combatOf('ram');
    expect(damageAgainst(attackFor('archer'), ram)).toBe(2);
    expect(damageAgainst((towerOf('woodenTower') as TowerDefinition).attack, ram)).toBe(2);
    expect(damageAgainst(attackFor('swordsman'), ram)).toBeGreaterThanOrEqual(15);
  });
});

describe('ram', () => {
  it('goes for a wall on its own, which soldiers leave alone', () => {
    const g = game();
    g.fortify([wall([-6, 20], [6, 20])]);
    const [soldier = 0] = g.spawn('bob', 'swordsman', -4, 24);
    g.run(seconds(3));
    expect(g.unit(soldier)?.combat?.targetId).toBeNull();
    const [ram = 0] = g.spawn('bob', 'ram', 4, 26);
    const walls = wallsOf(g.state).length;
    g.run(seconds(60), (s) => wallsOf(s).length < walls);
    expect(wallsOf(g.state).length).toBe(walls - 1);
    expect(g.unit(ram)?.type).toBe('ram');
  });

  it('breaks a stone wall segment in about half a minute', () => {
    const g = game();
    g.fortify([wall([-6, 20], [6, 20])]);
    g.spawn('bob', 'ram', 0, 23);
    const walls = wallsOf(g.state).length;
    const ticks = g.run(seconds(90), (s) => wallsOf(s).length < walls);
    report(`ram vs stone wall segment: ${ticks / SIMULATION_TICK_RATE} s`);
    expect(ticks).toBeLessThan(seconds(40));
  });

  it('prefers a tower to a nearer wall', () => {
    const g = game();
    const [tower = 0] = g.fortify([wall([-6, 24], [-2, 24])], [[3, 21, 'woodenTower']]);
    const [ram = 0] = g.spawn('bob', 'ram', -3, 28);
    g.run(seconds(1));
    expect(g.unit(ram)?.combat?.targetId).toBe(tower);
  });

  it('never fights units, even while they hit it, and falls to them', () => {
    const g = game();
    const [ram = 0] = g.spawn('bob', 'ram', 0, 30);
    const swords = g.spawn('alice', 'swordsman', 0, 34, 5);
    g.run(seconds(30), () => g.alive([ram]) === 0);
    expect(g.alive([ram])).toBe(0);
    expect(g.alive(swords)).toBe(5);
    for (const id of swords) expect(g.unit(id)?.health).toBe(combatOf('swordsman').health);
  });

  it('cannot be ordered at a unit; with soldiers it comes along', () => {
    const g = game();
    const [ram = 0] = g.spawn('bob', 'ram', 0, 30);
    const [enemy = 0] = g.spawn('alice', 'archer', 25, 30);
    const alone = g.order('bob', { type: 'attack', unitIds: [ram], targetId: enemy });
    expect(alone.issues).toEqual(['cannotAttack']);
    expect(g.unit(ram)?.task.kind).toBe('idle');
    const [sword = 0] = g.spawn('bob', 'swordsman', 2, 32);
    const both = g.order('bob', { type: 'attack', unitIds: [ram, sword], targetId: enemy });
    expect(both.ok).toBe(true);
    expect(g.unit(ram)?.task.kind).toBe('attackMove');
    expect(g.unit(sword)?.task.kind).toBe('attack');
  });

  it('is large, but still gets through a gap one segment wide', () => {
    const g = game();
    // A line with a 2-unit gap at x = 0..2, as a fallen segment leaves; a ram is 2 across.
    g.fortify([wall([-30, 20], [0, 20]), wall([2, 20], [30, 20])]);
    const [ram = 0] = g.spawn('alice', 'ram', 1, 26);
    g.order('alice', { type: 'moveUnits', unitIds: [ram], x: 1, z: 12 });
    let crossedAt = Number.NaN;
    g.run(seconds(20), (s) => {
      const u = must(s.units.find((v) => v.id === ram));
      if (u.z < 20.5 && Number.isNaN(crossedAt)) crossedAt = u.x;
      return u.z < 13;
    });
    expect(must(g.unit(ram)).z).toBeLessThan(13);
    // Through the gap, not around the end of the line.
    expect(crossedAt).toBeGreaterThan(-0.5);
    expect(crossedAt).toBeLessThan(2.5);
  });

  it('keeps large units apart from each other and from small ones', () => {
    const g = game();
    const rams = g.spawn('alice', 'ram', 0, 30, 3);
    const swords = g.spawn('alice', 'swordsman', 0, 30, 4);
    g.run(seconds(6));
    const all = [...rams, ...swords].map((id) => must(g.unit(id)));
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1)) {
        const apart = UNITS[a.type].radius + UNITS[b.type].radius;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(apart * 0.9);
      }
    }
  });
});

describe('catapult', () => {
  it('destroys a stone tower from beyond its reach, unharmed', () => {
    const g = game();
    const [tower = 0] = g.fortify([], [[0, 20, 'stoneTower']]);
    const [catapult = 0] = g.spawn('bob', 'catapult', 0, 36);
    const ticks = g.run(seconds(120), () => !g.building(tower));
    report(
      `catapult vs stone tower (${buildingHealthOf('stoneTower')} hp): ${ticks / SIMULATION_TICK_RATE} s`,
    );
    expect(g.building(tower)).toBeUndefined();
    expect(g.unit(catapult)?.health).toBe(combatOf('catapult').health);
    // It never had to come closer than its range.
    expect(must(g.unit(catapult)).z).toBeGreaterThan(30);
  });

  it('shoots over a closed wall at an ordered tower instead of breaching', () => {
    const g = game();
    const ring = [
      wall([-10, 12], [10, 12]),
      wall([10, 12], [10, 28]),
      wall([10, 28], [-10, 28]),
      wall([-10, 28], [-10, 12]),
    ];
    const [tower = 0] = g.fortify(ring, [[0, 20, 'stoneTower']]);
    const walls = wallsOf(g.state).length;
    const [catapult = 0] = g.spawn('bob', 'catapult', 0, 50);
    // The order needs the tower in sight: a scout close by (out of tower range).
    g.spawn('bob', 'archer', 0, 34);
    const check = g.order('bob', { type: 'attack', unitIds: [catapult], targetId: tower });
    expect(check.ok).toBe(true);
    g.run(seconds(60), () => g.damage(tower) > 0);
    expect(g.damage(tower)).toBeGreaterThan(0);
    expect(wallsOf(g.state).length).toBe(walls);
    expect(g.unit(catapult)?.combat?.breachId).toBeNull();
    expect(must(g.unit(catapult)).z).toBeGreaterThan(28);
  });

  it('splashes the segments next to the one it hits, and spares its own side', () => {
    const g = game();
    g.fortify([wall([-6, 20], [6, 20])]);
    const [catapult = 0] = g.spawn('bob', 'catapult', 0, 32);
    // Its own man right at the wall, where the rock lands.
    const [own = 0] = g.spawn('bob', 'ram', 12, 40);
    const target = must(g.at(1, 20));
    g.order('bob', { type: 'attack', unitIds: [catapult], targetId: target.id });
    g.run(seconds(20), () => g.damage(target.id) > 0);
    expect(g.damage(target.id)).toBeGreaterThan(0);
    expect(g.damage(must(g.at(-1, 20)).id)).toBe(g.damage(target.id));
    expect(g.damage(must(g.at(3, 20)).id)).toBe(g.damage(target.id));
    expect(g.damage(must(g.at(-5, 20)).id)).toBe(0);
    expect(g.unit(own)?.health).toBe(combatOf('ram').health);
  });

  it('misses a unit that walks away before the rock lands', () => {
    const g = game();
    const [runner = 0] = g.spawn('alice', 'swordsman', 6, 28);
    g.order('alice', { type: 'moveUnits', unitIds: [runner], x: -20, z: 28 });
    // It opens fire on its own on the walking swordsman.
    g.spawn('bob', 'catapult', 0, 40);
    g.run(seconds(4), (s) => s.projectiles.length > 0);
    const shot = must(g.state.projectiles[0]);
    expect(shot.weapon).toBe('catapult');
    g.run(seconds(4), (s) => s.tick > shot.impactAt);
    expect(g.unit(runner)?.health).toBe(combatOf('swordsman').health);
  });

  it('hits units that stand still, everyone near the spot', () => {
    const g = game();
    // Serfs don't fight back or move.
    const serfs = g.spawn('alice', 'serf', 0, 28, 3);
    g.spawn('bob', 'catapult', 0, 40);
    const full = combatOf('serf').health;
    const hurt = () => serfs.filter((id) => must(g.unit(id)).health < full);
    g.run(seconds(5), () => hurt().length > 0);
    expect(hurt().length).toBeGreaterThanOrEqual(2);
    for (const id of hurt()) expect(must(g.unit(id)).health).toBe(full - 16);
  });

  it('backs out of its minimum range to fire at an ordered target', () => {
    const g = game();
    const [tower = 0] = g.fortify([], [[0, 20, 'woodenTower']]);
    const [catapult = 0] = g.spawn('bob', 'catapult', 0, 24);
    g.order('bob', { type: 'attack', unitIds: [catapult], targetId: tower });
    g.run(seconds(20), () => g.damage(tower) > 0);
    expect(g.damage(tower)).toBeGreaterThan(0);
    // At least the minimum range from the tower's edge, measured from its own edge.
    expect(must(g.unit(catapult)).z - 20).toBeGreaterThan(
      (attackFor('catapult').minRange ?? 0) + 1,
    );
  });

  it('can’t defend itself against units up close', () => {
    const g = game();
    const [catapult = 0] = g.spawn('bob', 'catapult', 0, 30);
    const swords = g.spawn('alice', 'swordsman', 0, 32, 3);
    g.run(seconds(20), () => g.alive([catapult]) === 0);
    expect(g.alive([catapult])).toBe(0);
    for (const id of swords) expect(g.unit(id)?.health).toBe(combatOf('swordsman').health);
  });

  it('the same orders give the same game', () => {
    const play = () => {
      const g = game();
      g.fortify([wall([-10, 20], [10, 20])], [[0, 15, 'stoneTower']]);
      g.spawn('bob', 'catapult', -3, 36, 2);
      g.spawn('bob', 'ram', 4, 28, 2);
      g.spawn('bob', 'swordsman', 0, 32, 6);
      g.spawn('alice', 'swordsman', 0, 10, 6);
      g.run(seconds(40));
      return g.state;
    };
    expect(play()).toEqual(play());
  });
});
