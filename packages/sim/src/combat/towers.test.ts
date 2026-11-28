import { BUILDINGS, combatOf, damageAgainst, RESOURCE_IDS } from '@roe/game-data';
import type { ResourceAmounts, SettlementLayout, UnitKind } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { createUnit, isAlive, type UnitInstance } from '../state/units.js';
import { report } from '../test/bench.js';
import { FLAT_MAP, place, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { createUnitGrid } from './targeting.js';
import { towerTarget } from './towers.js';

const TOWER = BUILDINGS.woodenTower.tower;
const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 500])) as ResourceAmounts;
const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);
const LAYOUT: SettlementLayout = { ...TOWN, startingSerfs: 0 };

/** Alice with a finished tower at (0, 20). */
function game({ complete = true } = {}) {
  const world = createWorld(FLAT_MAP, LAYOUT);
  const initial = createInitialState(world, { owner: 'alice', resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const g = {
    get state() {
      return state;
    },
    towerId: 0,
    step(...commands: Command[]) {
      state = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer: 'alice', command })),
      ).state;
    },
    run(ticks: number, each?: (s: GameState) => void) {
      for (let i = 0; i < ticks; i++) {
        g.step();
        each?.(state);
      }
    },
    spawn(owner: string | null, unit: UnitKind, x: number, z: number, count = 1) {
      const first = state.nextEntityId;
      g.step({ type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i): EntityId => first + i);
    },
    unit: (id: EntityId) => state.units.find((u) => u.id === id),
    /** Every shot released from now on, over `ticks`. */
    shots(ticks: number) {
      const seen = new Map<string, GameState['projectiles'][number]>();
      g.run(ticks, (s) => {
        for (const p of s.projectiles) {
          if (p.attackerId === g.towerId) seen.set(`${p.firedAt}`, p);
        }
      });
      return [...seen.values()];
    },
  };
  g.step(place('woodenTower', 0, 20));
  g.towerId = state.buildings.at(-1)?.id ?? 0;
  if (complete) {
    state = {
      ...state,
      construction: {},
      buildings: state.buildings.map((b) => ({ ...b, status: 'complete' })),
    };
    g.step();
  }
  return g;
}

describe('towers', () => {
  it('shoot an enemy in range by themselves, once per cooldown, from the top', () => {
    const g = game();
    const [skeleton] = g.spawn('enemy', 'skeletonMinion', 8, 20);
    const health = g.unit(skeleton as EntityId)?.health ?? 0;
    // A plain move far east keeps it from walking up to attack.
    const shots = g.shots(seconds(1));
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ ownerId: 'alice', targetId: skeleton, fromX: 0, fromZ: 20 });
    expect(shots[0]?.fromHeight).toBe(TOWER.launchHeight);
    const left = g.unit(skeleton as EntityId)?.health ?? 0;
    expect(health - left).toBe(damageAgainst(TOWER.attack, combatOf('skeletonMinion')));
    const more = g.shots(seconds(TOWER.attack.cooldown * 3));
    const gaps = more.slice(1).map((p, i) => p.firedAt - (more[i]?.firedAt ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(seconds(TOWER.attack.cooldown));
      expect(gap).toBeLessThan(seconds(TOWER.attack.cooldown) + 3);
    }
  });

  it('leave alone what is out of range, their own people and neutrals', () => {
    const g = game();
    g.spawn('enemy', 'skeletonMinion', TOWER.attack.range + 3, 20);
    g.spawn('alice', 'swordsman', 4, 20);
    g.spawn(null, 'swordsman', -4, 20);
    expect(g.shots(2)).toHaveLength(0);
  });

  it('do not shoot while being built', () => {
    const g = game({ complete: false });
    g.spawn('enemy', 'skeletonMinion', 6, 20);
    expect(g.shots(seconds(5))).toHaveLength(0);
  });

  it('prefer an enemy that is attacking, then the nearest, then the lowest id', () => {
    const tower = { x: 0, z: 0, ownerId: 'alice' };
    const at = (id: number, x: number, activity: UnitInstance['activity'] = 'idle') => ({
      ...createUnit(id, 'swordsman', 'enemy', { x, z: 0 }),
      activity,
    });
    const pick = (...units: UnitInstance[]) =>
      towerTarget({}, tower, createUnitGrid(units), 11)?.id;
    expect(pick(at(1, 3), at(2, 9, 'attacking'))).toBe(2);
    expect(pick(at(1, 9), at(2, 3))).toBe(2);
    expect(pick(at(5, -4), at(4, 4))).toBe(4);
    expect(pick(at(1, 12, 'attacking'), at(2, 3))).toBe(2);
  });

  it('kill, with the kill counted for the owner', () => {
    const g = game();
    const [skeleton] = g.spawn('enemy', 'skeletonMinion', 8, 20);
    g.run(seconds(40));
    const unit = g.unit(skeleton as EntityId);
    expect(unit === undefined || !isAlive(unit)).toBe(true);
    expect(g.state.stats.alice?.enemiesKilled).toBe(1);
  });

  it('stop for good once they fall', () => {
    const g = game();
    g.spawn('enemy', 'spearman', 0, 24, 12);
    const standing = () => g.state.buildings.some((b) => b.id === g.towerId);
    let i = 0;
    for (; i < seconds(200) && standing(); i++) {
      g.step();
      if (g.state.units.filter((u) => u.ownerId === 'enemy' && isAlive(u)).length < 6) break;
    }
    report(`12 spearmen against a wooden tower: tower ${standing() ? 'stands' : 'falls'}`);
    expect(standing()).toBe(false);
    g.run(2);
    expect(g.state.towerCooldowns).toEqual({});
    expect(g.shots(seconds(5))).toHaveLength(0);
  });

  it('are deterministic', () => {
    const play = () => {
      const g = game();
      g.spawn('enemy', 'skeletonMinion', 9, 24, 5);
      g.run(seconds(30));
      return g.state;
    };
    expect(play()).toEqual(play());
  });
});
