import {
  BUILDING_SIGHT,
  BUILDINGS,
  combatOf,
  RESOURCE_IDS,
  towerOf,
  upgradesOf,
} from '@roe/game-data';
import type { BuildingId, ResourceAmounts, SettlementLayout, UnitKind } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import { parseCommand, type Command } from '../commands/types.js';
import { createSimContext, ensureVision } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { createUnit, isAlive } from '../state/units.js';
import { report } from '../test/bench.js';
import { FLAT_MAP, place, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { isVisible } from '../vision/vision.js';
import { createWorld } from '../world/createWorld.js';
import { towerDamage } from './towerImpacts.js';

const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 200])) as ResourceAmounts;
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
const LAYOUT: SettlementLayout = { ...TOWN, startingSerfs: 0 };
const SPECIALS = ['crossbowTower', 'magicTower', 'fireTower'] as const;
const TOWERS = ['woodenTower', 'stoneTower', ...SPECIALS] as const;
const SPOT = { x: 0, z: 25 };

/** Alice with a finished tower of `type` at `SPOT`. */
function game(type: BuildingId = 'woodenTower', resources: ResourceAmounts = RICH) {
  const world = createWorld(FLAT_MAP, LAYOUT);
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    ctx,
    get state() {
      return state;
    },
    towerId: 0,
    step(...commands: Command[]) {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer: 'alice', command })),
      );
      state = result.state;
      return result.results;
    },
    run(ticks: number, until?: () => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.()) return;
        g.step();
      }
    },
    set(change: (s: GameState) => GameState) {
      state = change(state);
      g.step();
    },
    spawn(unit: UnitKind, x: number, z: number, count = 1, owner = 'enemy') {
      const first = state.nextEntityId;
      g.step({ type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i): EntityId => first + i);
    },
    tower: () => state.buildings.find((b) => b.id === g.towerId),
    unit: (id: EntityId) => state.units.find((u) => u.id === id),
    upgrade(to: BuildingId) {
      const result = g.step({ type: 'upgradeTower', buildingId: g.towerId, to })[0];
      return result && !result.ok ? result.check.issues : [];
    },
  };
  g.step(place('woodenTower', SPOT.x, SPOT.z));
  g.towerId = state.buildings.at(-1)?.id ?? 0;
  g.set((s) => ({
    ...s,
    stocks: { alice: resources },
    construction: {},
    buildings: s.buildings.map((b) =>
      b.id === g.towerId ? { ...b, status: 'complete', type } : b,
    ),
  }));
  return g;
}

/** A unit that stands still and can't hit back from there: a plain move to its own spot. */
const dummy = (g: ReturnType<typeof game>, unit: UnitKind, x: number, z: number) => {
  const [id] = g.spawn(unit, x, z);
  return id as EntityId;
};

describe('tower data', () => {
  it('upgrades keep the footprint, and every tower sees at least as far as it shoots', () => {
    for (const type of TOWERS) {
      const definition = BUILDINGS[type];
      expect(definition.footprint).toEqual(BUILDINGS.woodenTower.footprint);
      expect(definition.sight).toBeGreaterThan(definition.tower.attack.range);
    }
    expect(upgradesOf('woodenTower')).toEqual(['stoneTower']);
    expect(upgradesOf('stoneTower')).toEqual(SPECIALS);
    for (const special of SPECIALS) expect(upgradesOf(special)).toEqual([]);
  });
});

describe('tower upgrades', () => {
  it('cost resources and time, with no shooting meanwhile', () => {
    const g = game();
    expect(g.upgrade('stoneTower')).toEqual([]);
    expect(g.state.stocks.alice?.stone).toBe(200 - BUILDINGS.stoneTower.cost.stone);
    expect(g.tower()?.type).toBe('woodenTower');
    g.spawn('skeletonWarrior', 6, SPOT.z);
    const upgradeTicks = seconds(BUILDINGS.stoneTower.buildTime);
    let shots = 0;
    for (let i = 0; i < upgradeTicks - 5; i++) {
      g.step();
      shots += g.state.projectiles.length;
    }
    expect(shots).toBe(0);
    expect(g.tower()?.type).toBe('woodenTower');
    g.run(8);
    expect(g.tower()).toMatchObject({ type: 'stoneTower', status: 'complete' });
    expect(g.state.upgrades).toEqual({});
  });

  it('keep the damage taken, so the stronger tower has more health left', () => {
    const g = game();
    g.set((s) => ({ ...s, buildingDamage: { [g.towerId]: 400 } }));
    g.upgrade('stoneTower');
    g.run(seconds(BUILDINGS.stoneTower.buildTime) + 2);
    expect(g.state.buildingDamage[g.towerId]).toBe(400);
  });

  it('see farther once done', () => {
    const g = game();
    const vision = ensureVision(g.ctx, 'alice', g.state);
    // East of the tower: past the wooden tower's sight, within the stone one's.
    const far = { x: SPOT.x + BUILDING_SIGHT.woodenTower + 2, z: SPOT.z };
    expect(isVisible(vision, far.x, far.z)).toBe(false);
    g.upgrade('stoneTower');
    g.run(seconds(BUILDINGS.stoneTower.buildTime) + 2);
    expect(isVisible(vision, far.x, far.z)).toBe(true);
  });

  it('can be called off for a full refund', () => {
    const g = game();
    g.upgrade('stoneTower');
    g.step({ type: 'cancelUpgrade', buildingId: g.towerId });
    expect(g.state.stocks.alice).toEqual(RICH);
    expect(g.state.upgrades).toEqual({});
  });

  it('are refused when not offered, already running, unaffordable or not a tower', () => {
    const g = game();
    expect(g.upgrade('crossbowTower')).toEqual(['noUpgrade']);
    g.upgrade('stoneTower');
    expect(g.upgrade('stoneTower')).toEqual(['upgrading']);
    expect(game('woodenTower', { ...RICH, stone: 1 }).upgrade('stoneTower')).toEqual([
      'notEnoughResources',
    ]);
    const [result] = g.step({ type: 'upgradeTower', buildingId: 1, to: 'stoneTower' });
    expect(result?.ok).toBe(false);
    expect(parseCommand({ type: 'upgradeTower', buildingId: 2, to: 'castle' })).toBeNull();
  });

  it('are lost with a tower that falls', () => {
    const g = game();
    g.upgrade('stoneTower');
    g.set((s) => ({ ...s, buildingDamage: { [g.towerId]: 599 } }));
    g.spawn('spearman', 0, SPOT.z + 4, 4);
    g.run(seconds(20), () => !g.tower());
    g.run(2);
    expect(g.tower()).toBeUndefined();
    expect(g.state.upgrades).toEqual({});
  });
});

describe('special shots', () => {
  it('crossbow bolts go through armor', () => {
    const swordsman = createUnit(1, 'swordsman', 'enemy', { x: 0, z: 0 });
    const attack = BUILDINGS.crossbowTower.tower.attack;
    expect(towerDamage(attack, swordsman)).toBe(attack.damage);
    expect(towerDamage(BUILDINGS.stoneTower.tower.attack, swordsman)).toBe(
      BUILDINGS.stoneTower.tower.attack.damage - combatOf('swordsman').armor,
    );
  });

  it('magic slows the one it hits, and the slow wears off', () => {
    const g = game('magicTower');
    const [runner] = g.spawn('swordsman', -11, SPOT.z - 10) as [EntityId];
    g.step({ type: 'stop', unitIds: [runner] });
    const steps: { slowed: boolean; moved: number }[] = [];
    // The runner clips the edge of the range on a plain move (its owner's command).
    let state = stepGame(g.ctx, g.state, [
      {
        issuer: 'enemy',
        command: { type: 'moveUnits', unitIds: [runner], x: 25, z: SPOT.z - 10 },
      },
    ]).state;
    // Long enough to be well out of range again at the end.
    for (let i = 0; i < seconds(30); i++) {
      const before = state.units.find((u) => u.id === runner);
      state = stepGame(g.ctx, state).state;
      const after = state.units.find((u) => u.id === runner);
      if (!before || !after?.movement?.waypoints) continue;
      const moved = Math.hypot(after.x - before.x, after.z - before.z);
      steps.push({ slowed: before.slowed !== null && after.slowed !== null, moved });
    }
    const median = (slowed: boolean) => {
      const list = steps.filter((s) => s.slowed === slowed).map((s) => s.moved);
      return list.sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;
    };
    expect(median(true)).toBeCloseTo(median(false) * BUILDINGS.magicTower.tower.slow.factor, 2);
    // The slow wore off: it walked at full speed again after being slowed.
    const last = steps.map((s) => s.slowed).lastIndexOf(true);
    expect(steps.slice(last + 1).some((s) => !s.slowed)).toBe(true);
  });

  it('fire bursts among enemies, spares its own side, and burns on', () => {
    const g = game('fireTower');
    const enemies = g.spawn('swordsman', 8, SPOT.z, 5);
    const [friend] = g.spawn('swordsman', 8, SPOT.z + 0.5, 1, 'alice') as [EntityId];
    const full = combatOf('swordsman').health;
    g.run(seconds(6), () => enemies.some((id) => g.unit(id)?.burning));
    const hurt = enemies.filter((id) => (g.unit(id)?.health ?? full) < full);
    expect(hurt.length).toBeGreaterThanOrEqual(3);
    expect(g.unit(friend)?.burning).toBeNull();
    expect(
      g.unit(enemies[0] as EntityId)?.burning ?? g.unit(hurt[0] as EntityId)?.burning,
    ).toMatchObject({ damage: BUILDINGS.fireTower.tower.burn.damagePerSecond, by: 'alice' });
  });

  it('a fire burns for its time and does its damage once a second', () => {
    const g = game('fireTower');
    const id = dummy(g, 'swordsman', 30, -30);
    g.set((s) => ({
      ...s,
      units: s.units.map((u) =>
        u.id === id ? { ...u, burning: { until: s.tick + 40, damage: 3, by: 'alice' } } : u,
      ),
    }));
    g.run(seconds(6));
    expect(g.unit(id)?.health).toBe(combatOf('swordsman').health - 4 * 3);
    expect(g.unit(id)?.burning).toBeNull();
  });

  it('the same battle comes out the same', () => {
    const play = () => {
      const g = game('fireTower');
      g.spawn('skeletonMinion', 9, SPOT.z, 8);
      g.run(seconds(20));
      return g.state;
    };
    expect(play()).toEqual(play());
  });

  it('compare the towers against the same ten skeletons', () => {
    for (const type of TOWERS) {
      const g = game(type);
      const army = g.spawn('skeletonMinion', 10.5, SPOT.z, 10);
      const alive = () =>
        army.filter((id) => {
          const u = g.unit(id);
          return u && isAlive(u);
        }).length;
      let ticks = 0;
      for (; ticks < seconds(120) && alive() > 0 && g.tower(); ticks++) g.step();
      const health = BUILDINGS[type].health - (g.state.buildingDamage[g.towerId] ?? 0);
      const attack = towerOf(type)?.attack;
      report(
        `${type} vs 10 skeleton minions: ${10 - alive()} killed, ` +
          (g.tower() ? `tower stands with ${health} health` : 'tower falls') +
          ` (${(ticks / SIMULATION_TICK_RATE).toFixed(0)} s; dps ` +
          `${((attack?.damage ?? 0) / (attack?.cooldown ?? 1)).toFixed(1)})`,
      );
    }
  });
});
