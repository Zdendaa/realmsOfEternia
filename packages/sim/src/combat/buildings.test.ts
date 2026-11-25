import {
  BUILDING_COMBAT,
  buildingHealthOf,
  combatOf,
  damageAgainst,
  RESOURCE_IDS,
  type AttackDefinition,
  type ResourceAmounts,
  type SettlementLayout,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type PlayerId } from '@roe/shared';
import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../commands/applyCommand.js';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { isWalkable } from '../nav/navGrid.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { FLAT_MAP, place } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { approachPoint, buildingMaxHealth } from './buildings.js';

/** Alice's Town Hall, a house and a lumbermill (with its woodcutter). */
const VILLAGE: SettlementLayout = {
  buildings: [
    { building: 'townHall', x: 0, z: 0, rotation: 0 },
    { building: 'house', x: 16, z: 0, rotation: 0 },
    { building: 'lumbermill', x: -16, z: 0, rotation: 0 },
  ],
  paths: [],
  pathWidth: 2,
  squares: [],
  props: { around: [], models: [], perBuilding: { min: 0, max: 0 } },
  startingSerfs: 0,
};
const HOUSE = 2;
const LUMBERMILL = 3;

const world = createWorld(FLAT_MAP, VILLAGE);
const RICH = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 100])) as ResourceAmounts;

function village() {
  const initial = createInitialState(world, { owner: 'alice', players: ['bob'], resources: RICH });
  const ctx = createSimContext(world, initial, { dev: true });
  let state: GameState = initial;
  const game = {
    ctx,
    get state() {
      return state;
    },
    step(issuer: PlayerId = 'alice', ...commands: Command[]): CommandResult[] {
      const result = stepGame(
        ctx,
        state,
        commands.map((command) => ({ issuer, command })),
      );
      state = result.state;
      return result.results;
    },
    run(ticks: number, until?: (s: GameState) => boolean) {
      for (let i = 0; i < ticks; i++) {
        if (until?.(state)) return;
        game.step();
      }
    },
    spawn(
      owner: PlayerId,
      unit: 'swordsman' | 'spearman' | 'archer',
      x: number,
      z: number,
      count = 1,
    ) {
      const first = state.nextEntityId;
      game.step('alice', { type: 'debugSpawn', unit, count, x, z, owner });
      return Array.from({ length: count }, (_, i) => first + i);
    },
    building(id: EntityId) {
      return state.buildings.find((b) => b.id === id);
    },
  };
  return game;
}

const seconds = (s: number) => Math.round(s * SIMULATION_TICK_RATE);

describe('building health', () => {
  it('comes from the footprint unless set; the Town Hall is sturdier', () => {
    expect(buildingHealthOf('townHall')).toBe(3000);
    expect(buildingHealthOf('house')).toBeGreaterThanOrEqual(300);
    expect(buildingHealthOf('barracks')).toBeGreaterThan(buildingHealthOf('house'));
  });

  it('grows with construction for sites', () => {
    const full = buildingHealthOf('barracks');
    const site = { type: 'barracks' as const, status: 'construction' as const };
    const progress = (workDone: number) => ({ workDone, workRequired: 100, delivered: {} });
    expect(buildingMaxHealth(site, progress(0))).toBe(Math.round(full * 0.1));
    expect(buildingMaxHealth(site, progress(50))).toBe(Math.round(full * 0.55));
    expect(buildingMaxHealth({ ...site, status: 'complete' }, undefined)).toBe(full);
  });

  it('spearmen break buildings; arrows barely scratch them', () => {
    const spear = combatOf('spearman').attack as AttackDefinition;
    const bow = combatOf('archer').attack as AttackDefinition;
    expect(damageAgainst(spear, BUILDING_COMBAT)).toBe(25);
    expect(damageAgainst(bow, BUILDING_COMBAT)).toBe(2);
  });

  it('approach points lie just outside the footprint, on the attacker’s side', () => {
    const house = {
      id: 1,
      type: 'house' as const,
      x: 0,
      z: 0,
      rotation: 0,
      ownerId: null,
      status: 'complete' as const,
    };
    const east = approachPoint({ x: 20, z: 0 }, house);
    expect(east.x).toBeGreaterThan(1.75);
    expect(east.x).toBeLessThan(3);
    expect(Math.abs(east.z)).toBeLessThan(0.01);
    const turned = approachPoint({ x: 0, z: 20 }, { ...house, rotation: Math.PI / 2 });
    // Turned a quarter: the 3.5-wide side now faces +Z.
    expect(turned.z).toBeGreaterThan(1.75);
    expect(turned.z).toBeLessThan(3);
  });
});

describe('attacking buildings', () => {
  it('enemy soldiers left idle near a house attack it on their own and destroy it', () => {
    const game = village();
    game.spawn('bob', 'spearman', 16, 9, 3);
    game.run(seconds(60), (s) => !s.buildings.some((b) => b.id === HOUSE));
    expect(game.building(HOUSE)).toBeUndefined();
    const ruin = game.state.ruins.find((r) => r.id === HOUSE);
    expect(ruin).toMatchObject({ type: 'house', x: 16, z: 0, ownerId: 'alice' });
    expect(game.state.buildingDamage[HOUSE]).toBeUndefined();
    // The footprint is free to walk again; the ground stays flattened under the ruin.
    expect(isWalkable(game.ctx.nav, 16, 0)).toBe(true);
    expect(game.ctx.heights.getHeightAt(16, 0)).toBeCloseTo(world.heights.getHeightAt(16, 0), 5);
  });

  it('damage accumulates per hit and is reported in buildingDamage', () => {
    const game = village();
    game.spawn('bob', 'swordsman', 16, 9);
    game.run(seconds(10), (s) => (s.buildingDamage[HOUSE] ?? 0) > 0);
    const swordHit = damageAgainst(
      combatOf('swordsman').attack as AttackDefinition,
      BUILDING_COMBAT,
    );
    expect(game.state.buildingDamage[HOUSE]).toBe(swordHit);
  });

  it('an attack order sends soldiers after a building beyond sight range', () => {
    const game = village();
    const ids = game.spawn('bob', 'spearman', 16, 40, 2);
    const [result] = game.step('bob', { type: 'attack', unitIds: ids, targetId: HOUSE });
    expect(result?.ok).toBe(true);
    game.run(seconds(90), (s) => !s.buildings.some((b) => b.id === HOUSE));
    expect(game.building(HOUSE)).toBeUndefined();
  });

  it('own buildings and neutral ones are not targets', () => {
    const game = village();
    const [sword] = game.spawn('alice', 'swordsman', 16, 9);
    const [own] = game.step('alice', {
      type: 'attack',
      unitIds: [sword as number],
      targetId: HOUSE,
    });
    expect(own).toMatchObject({ check: { issues: ['notEnemy'] } });
    game.run(seconds(10));
    expect(game.state.buildingDamage[HOUSE]).toBeUndefined();
  });

  it('a destroyed production building takes its worker with it', () => {
    const game = village();
    const worker = game.state.units.find(
      (u) => u.type === 'worker' && u.task.kind === 'work' && u.task.buildingId === LUMBERMILL,
    );
    expect(worker).toBeDefined();
    game.spawn('bob', 'spearman', -16, 9, 4);
    game.run(seconds(90), (s) => !s.buildings.some((b) => b.id === LUMBERMILL));
    expect(game.building(LUMBERMILL)).toBeUndefined();
    const lost = game.state.units.find((u) => u.id === worker?.id);
    expect(lost === undefined || !isAlive(lost)).toBe(true);
  });

  it('construction sites fall quickly: little health while just started', () => {
    const game = village();
    game.step('alice', place('barracks', 0, 22));
    const site = game.state.buildings.at(-1)?.id as EntityId;
    expect(game.building(site)?.status).toBe('construction');
    game.spawn('bob', 'swordsman', 0, 30);
    game.run(seconds(30), (s) => !s.buildings.some((b) => b.id === site));
    expect(game.building(site)).toBeUndefined();
    expect(game.state.construction[site]).toBeUndefined();
  });

  it('archers shoot at buildings with arrows that land on them', () => {
    const game = village();
    game.spawn('bob', 'archer', 16, 11);
    game.run(seconds(10), (s) => (s.buildingDamage[HOUSE] ?? 0) > 0);
    expect(game.state.buildingDamage[HOUSE]).toBe(2);
  });
});
