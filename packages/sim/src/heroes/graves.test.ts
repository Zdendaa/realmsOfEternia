import { buildingHealthOf, combatOf, HERO_RULES, UNITS, type UnitKind } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type MapDefinition } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { validateCommand } from '../commands/applyCommand.js';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { populationOf } from '../economy/population.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { viewOf } from '../vision/view.js';
import { createVision, isVisible, updateVision } from '../vision/vision.js';
import { createWorld } from '../world/createWorld.js';
import { REVIVE_TICKS, reviveStatus } from './graves.js';
import { maxHealthOf, spawnHero } from './heroes.js';

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
/** Far from the Town Hall (which would see the spot anyway). */
const SPOT = { x: -30, z: 30 };
const MAP: MapDefinition = {
  ...FLAT_MAP,
  startingHeroes: [{ player: 0, hero: 'commander', ...SPOT }],
};

/** The value, which the test expects to exist. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('missing');
  return value;
}

function game(map: MapDefinition = MAP) {
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
    unit: (id: EntityId) => state.units.find((u) => u.id === id),
    grave: () => must(state.graves[0]),
    damage(buildingId: EntityId, amount: number) {
      state = { ...state, buildingDamage: { ...state.buildingDamage, [buildingId]: amount } };
    },
    patch(id: EntityId, change: Partial<UnitInstance>) {
      state = { ...state, units: state.units.map((u) => (u.id === id ? { ...u, ...change } : u)) };
    },
    /** The hero dies where it stands. */
    fell() {
      g.patch(g.hero, {
        health: 1,
        burning: { until: state.tick + 11, damage: 5, by: 'monsters' },
      });
      g.run(20, () => state.graves.length > 0);
      expect(state.graves).toHaveLength(1);
    },
  };
  return g;
}

describe('fallen heroes', () => {
  it('leave a grave with what they had learned, where they fell', () => {
    const g = game();
    g.step({ type: 'debugExperience', unitIds: [g.hero], amount: 300 });
    g.fell();
    expect(g.grave()).toMatchObject({
      id: g.hero,
      hero: 'commander',
      ownerId: 'alice',
      ...SPOT,
      state: { level: 3, experience: 300 },
      progress: 0,
    });
    g.run(seconds(5));
    // The body is gone, the grave stays.
    expect(g.unit(g.hero)).toBeUndefined();
    expect(g.state.graves).toHaveLength(1);
  });

  it('count as the player’s hero: no second one of that type', () => {
    const g = game();
    g.fell();
    g.run(seconds(5));
    const again = spawnHero(g.state, 'commander', 'alice', { x: 0, z: 20 });
    expect(again.ok ? null : again.issue).toBe('heroExists');
  });

  it('can’t be attacked, and a monster passes the grave by', () => {
    const g = game();
    g.fell();
    g.run(seconds(5));
    const monster = g.spawn('monsters', 'skeletonWarrior', SPOT.x + 2, SPOT.z);
    g.run(seconds(5));
    expect(g.unit(monster)?.combat?.targetId).toBeNull();
    expect(
      validateCommand(g.ctx, g.state, 'alice', {
        type: 'attack',
        unitIds: [monster],
        targetId: g.hero,
      }).issues,
    ).toEqual(['noTarget']);
    expect(g.state.graves).toHaveLength(1);
  });

  it('show their owner a little around the grave', () => {
    const g = game();
    const vision = must(g.ctx.visions.get('alice'));
    g.fell();
    g.run(seconds(5));
    expect(isVisible(vision, SPOT.x + 4, SPOT.z)).toBe(true);
    expect(isVisible(vision, SPOT.x + HERO_RULES.graveSight + 5, SPOT.z)).toBe(false);
  });

  it('don’t keep a player in the game: the Town Hall falls and the game is lost', () => {
    const g = game();
    g.fell();
    const hall = must(g.state.buildings.find((b) => b.type === 'townHall'));
    // One blow from falling, and a ram at its wall.
    g.damage(hall.id, buildingHealthOf('townHall') - 1);
    g.spawn('bob', 'ram', hall.x, hall.z + 8);
    g.run(seconds(30), () => g.state.outcome.alice !== undefined);
    expect(g.state.outcome.alice?.result).toBe('lost');
    expect(g.state.graves).toHaveLength(1);
  });
});

describe('revival', () => {
  it('needs an own unit close by, and takes 30 s', () => {
    const g = game();
    g.fell();
    g.run(seconds(40));
    expect(g.grave().progress).toBe(0);
    expect(reviveStatus(g.grave(), g.state.units)).toBe('noUnit');
    // Just out of reach.
    g.spawn('alice', 'swordsman', SPOT.x + HERO_RULES.reviveRadius + 1.5, SPOT.z);
    g.run(seconds(2));
    expect(g.grave().progress).toBe(0);
    g.spawn('alice', 'serf', SPOT.x + 2, SPOT.z);
    const ticks = g.run(seconds(40), () => g.state.graves.length === 0);
    expect(Math.abs(ticks - REVIVE_TICKS)).toBeLessThanOrEqual(2);
    const hero = must(g.unit(g.hero));
    expect(isAlive(hero)).toBe(true);
    expect(hero.health).toBe(Math.floor(maxHealthOf(hero) / 2));
    expect(Math.hypot(hero.x - SPOT.x, hero.z - SPOT.z)).toBeLessThan(2);
  });

  it('keeps level, experience and cooldowns', () => {
    const g = game();
    g.step({ type: 'debugExperience', unitIds: [g.hero], amount: 700 });
    g.step({ type: 'useAbility', unitId: g.hero, ability: 'rally' });
    g.run(seconds(2));
    const learned = must(g.unit(g.hero)).hero;
    g.fell();
    g.spawn('alice', 'serf', SPOT.x + 2, SPOT.z);
    g.run(seconds(40), () => g.state.graves.length === 0);
    expect(must(g.unit(g.hero)).hero).toEqual(learned);
    expect(must(g.unit(g.hero)).health).toBe(Math.floor((combatOf('commander').health + 180) / 2));
  });

  it('pauses while an enemy is near or the helper is gone, without losing progress', () => {
    const g = game();
    g.fell();
    const helper = g.spawn('alice', 'serf', SPOT.x + 2, SPOT.z);
    g.run(seconds(10));
    const reached = g.grave().progress;
    expect(reached).toBeGreaterThan(seconds(9));
    const enemy = g.spawn('bob', 'ram', SPOT.x + HERO_RULES.reviveClearRadius - 1, SPOT.z);
    expect(reviveStatus(g.grave(), g.state.units)).toBe('contested');
    const held = g.grave().progress;
    g.run(seconds(20));
    expect(g.grave().progress).toBe(held);
    g.patch(enemy, { x: SPOT.x + 30 });
    g.run(seconds(1));
    expect(g.grave().progress).toBeGreaterThan(held);
    g.patch(helper, { x: SPOT.x + 20 });
    const away = g.grave().progress;
    g.run(seconds(5));
    expect(g.grave().progress).toBe(away);
  });

  it('is helped along by an order: serfs stay by the grave, then are free again', () => {
    const g = game();
    g.fell();
    // A building site within reach would tempt an idle serf away.
    const serf = g.spawn('alice', 'serf', SPOT.x + 12, SPOT.z);
    g.step({ type: 'revive', unitIds: [serf], graveId: g.hero });
    expect(g.unit(serf)?.task).toEqual({ kind: 'revive', graveId: g.hero });
    g.step({ type: 'placeBuilding', building: 'house', x: -22, z: 22, quarterTurns: 0 });
    g.run(seconds(50), () => g.state.graves.length === 0);
    expect(g.state.graves).toEqual([]);
    g.step();
    expect(g.unit(serf)?.task.kind).not.toBe('revive');
  });

  it('is helped along by an order: soldiers attack-move there and clear the spot', () => {
    const g = game();
    g.fell();
    g.run(seconds(4));
    g.spawn('monsters', 'skeletonMinion', SPOT.x + 3, SPOT.z);
    const soldiers = [0, 1, 2].map((i) => g.spawn('alice', 'swordsman', SPOT.x + 16, SPOT.z + i));
    g.step({ type: 'revive', unitIds: soldiers, graveId: g.hero });
    for (const id of soldiers) expect(g.unit(id)?.task.kind).toBe('attackMove');
    g.run(seconds(60), () => g.state.graves.length === 0);
    expect(g.state.graves).toEqual([]);
  });

  it('takes the order only for an own grave and own units, from well-formed input', () => {
    const g = game();
    const serf = g.spawn('alice', 'serf', 0, 20);
    const command: Command = { type: 'revive', unitIds: [serf], graveId: g.hero };
    expect(validateCommand(g.ctx, g.state, 'alice', command).issues).toEqual(['noGrave']);
    g.fell();
    expect(validateCommand(g.ctx, g.state, 'alice', command).issues).toEqual([]);
    expect(validateCommand(g.ctx, g.state, 'bob', command).issues).toEqual(['noGrave']);
    expect(validateCommand(g.ctx, g.state, 'alice', { ...command, unitIds: [999] }).issues).toEqual(
      ['noUnits'],
    );
    expect(parseCommand({ ...command, x: 1 })).toEqual(command);
    expect(parseCommand({ type: 'revive', unitIds: [serf] })).toBeNull();
  });

  it('works when something was built over the grave', () => {
    const g = game();
    g.fell();
    g.run(seconds(4));
    g.step({ type: 'placeBuilding', building: 'house', ...SPOT, quarterTurns: 0 });
    expect(g.state.buildings.some((b) => b.type === 'house' && b.x === SPOT.x)).toBe(true);
    g.spawn('alice', 'ram', SPOT.x + 3, SPOT.z);
    g.run(seconds(45), () => g.state.graves.length === 0);
    const hero = must(g.unit(g.hero));
    expect(Math.hypot(hero.x - SPOT.x, hero.z - SPOT.z)).toBeLessThan(6);
  });

  it('takes no housing, and hides another’s hero in the view', () => {
    const g = game();
    g.step({ type: 'debugExperience', unitIds: [g.hero], amount: 300 });
    const used = populationOf(g.state, 'alice').used;
    g.fell();
    expect(populationOf(g.state, 'alice').used).toBe(used);
    g.spawn('bob', 'archer', SPOT.x + 9, SPOT.z);
    const bobs = createVision(g.ctx.world.map, 'bob');
    updateVision(bobs, g.state);
    expect(viewOf(g.ctx.world, g.state, bobs).graves[0]?.state).toEqual({
      level: 3,
      experience: 0,
      cooldowns: {},
    });
    expect(UNITS.commander.experience).toBeGreaterThan(0);
  });

  it('the same orders give the same game', () => {
    const play = () => {
      const g = game();
      g.fell();
      const soldier = g.spawn('alice', 'swordsman', SPOT.x + 10, SPOT.z);
      g.step({ type: 'revive', unitIds: [soldier], graveId: g.hero });
      g.run(seconds(45));
      return g.state;
    };
    expect(play()).toEqual(play());
  });
});
