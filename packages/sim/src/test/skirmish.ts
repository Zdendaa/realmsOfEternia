/**
 * Test-only: plays a fight on a map the way a reasonably careful player would: the
 * heroes and their army attack-move together, and the heroes use their abilities
 * whenever they are worth it.
 */
import {
  abilityOf,
  PROTOTYPE_SETTLEMENT,
  UNITS,
  type AbilityId,
  type UnitKind,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type MapDefinition, type Vec2 } from '@roe/shared';
import { MONSTER_PLAYER } from '../combat/hostility.js';
import type { Command } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { abilitiesOf, abilityIssue, castInRange } from '../heroes/abilities.js';
import { maxHealthOf } from '../heroes/heroes.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive, type UnitInstance } from '../state/units.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';

export type Army = Readonly<Partial<Record<UnitKind, number>>>;

export interface SkirmishResult {
  /** Every targeted monster is dead. */
  cleared: boolean;
  monstersLeft: number;
  monsters: number;
  heroesLeft: number;
  soldiersLeft: number;
  townHallDamage: number;
  seconds: number;
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** The spell worth casting now for `hero`, if any. */
function pickCast(
  state: GameState,
  hero: UnitInstance,
  own: readonly UnitInstance[],
  foes: readonly UnitInstance[],
): Command | null {
  const near = (center: Vec2, radius: number, list: readonly UnitInstance[]) =>
    list.filter((u) => distance(u, center) <= radius);
  const fighting = near(hero, 9, foes).length > 0;
  const cast = (ability: AbilityId, target?: Vec2): Command => ({
    type: 'useAbility',
    unitId: hero.id,
    ability,
    ...(target ? { target: { x: target.x, z: target.z } } : {}),
  });
  for (const ability of [...abilitiesOf(hero)].reverse()) {
    if (abilityIssue(hero, ability, state.tick) !== null) continue;
    const definition = abilityOf(ability);
    const allies = near(hero, definition.radius, own);
    switch (ability) {
      case 'rally':
        if (fighting) return cast(ability);
        break;
      case 'shockwave':
        if (near(hero, definition.radius - 0.5, foes).length >= 2) return cast(ability);
        break;
      case 'lastStand':
        if (near(hero, 5, foes).length >= 3) return cast(ability);
        break;
      case 'massHeal':
        if (allies.reduce((sum, u) => sum + maxHealthOf(u) - u.health, 0) >= 150) {
          return cast(ability);
        }
        break;
      case 'fireball':
      case 'frostNova': {
        // The spot in reach that catches the most.
        let best: UnitInstance | null = null;
        let most = 0;
        for (const foe of foes) {
          if (!castInRange(state.teams, hero, ability, { x: foe.x, z: foe.z }, state.buildings))
            continue;
          const caught = near(foe, definition.radius, foes).length;
          if (caught > most) {
            best = foe;
            most = caught;
          }
        }
        if (best && most >= Math.min(2, foes.length)) return cast(ability, best);
        break;
      }
    }
  }
  return null;
}

export function skirmish(
  map: MapDefinition,
  /** A camp's center, or the wave (defended north of the village). */
  fight: { camp: Vec2 } | { wave: true },
  army: Army = {},
  /** Shifts where the group heads first, to vary how the fight begins. */
  aside: Vec2 = { x: 0, z: 0 },
  limitSeconds = 240,
  /** The heroes' experience at the start. */
  experience = 0,
): SkirmishResult {
  const waves = 'wave' in fight ? map.waves : [];
  const world = createWorld({ ...map, waves: waves ?? [] }, PROTOTYPE_SETTLEMENT);
  let state = createInitialState(world, { owner: 'alice' });
  const ctx = createSimContext(world, state, { dev: true });
  const step = (...commands: Command[]) => {
    state = stepGame(
      ctx,
      state,
      commands.map((command) => ({ issuer: 'alice', command })),
    ).state;
  };
  for (const [unit, count] of Object.entries(army) as [UnitKind, number][]) {
    if (count > 0) step({ type: 'debugSpawn', unit, count, x: 5, z: 4, owner: 'alice' });
  }
  if (experience > 0) {
    const unitIds = state.units.filter((u) => u.hero).map((u) => u.id);
    step({ type: 'debugExperience', unitIds, amount: experience });
  }
  const fighters: EntityId[] = state.units
    .filter((u) => u.ownerId === 'alice' && UNITS[u.type].combat.armorClass !== 'villager')
    .map((u) => u.id);

  let targets: EntityId[];
  let goal: Vec2;
  if ('wave' in fight) {
    const before = new Set(state.units.map((u) => u.id));
    step({ type: 'debugWave' });
    targets = state.units.filter((u) => !before.has(u.id)).map((u) => u.id);
    // Meet it on the north road, just outside the village.
    goal = { x: 6, z: -24 };
  } else {
    const { camp } = fight;
    targets = state.units
      .filter((u) => u.ownerId === MONSTER_PLAYER && distance(u, camp) < 12)
      .map((u) => u.id);
    goal = camp;
  }
  const wanted = new Set(targets);
  const living = () => state.units.filter((u) => wanted.has(u.id) && isAlive(u));
  const mine = () => state.units.filter((u) => fighters.includes(u.id) && isAlive(u));
  goal = { x: goal.x + aside.x, z: goal.z + aside.z };
  step({ type: 'attackMove', unitIds: fighters, ...goal });

  const start = state.tick;
  while (state.tick - start < limitSeconds * SIMULATION_TICK_RATE) {
    const own = mine();
    const foes = living();
    if (foes.length === 0 || !own.some((u) => u.hero)) break;
    const commands: Command[] = [];
    for (const hero of own.filter((u) => u.hero && u.task.kind !== 'cast')) {
      const command = pickCast(state, hero, own, foes);
      if (command) commands.push(command);
    }
    // Idle fighters go on: to the goal, then after whatever is left.
    if (state.tick % SIMULATION_TICK_RATE === 0) {
      const idle = own.filter((u) => u.task.kind === 'idle' && u.combat?.targetId == null);
      const last = foes[0];
      if (idle.length > 0 && last) {
        const there = idle.every((u) => distance(u, goal) < 4);
        commands.push({
          type: 'attackMove',
          unitIds: idle.map((u) => u.id),
          ...(there ? { x: last.x, z: last.z } : goal),
        });
      }
    }
    step(...commands);
  }

  const own = mine();
  const heroes = own.filter((u) => u.hero);
  return {
    cleared: living().length === 0,
    monstersLeft: living().length,
    monsters: targets.length,
    heroesLeft: heroes.length,
    soldiersLeft: own.length - heroes.length,
    townHallDamage: state.buildingDamage[1] ?? 0,
    seconds: Math.round((state.tick - start) / SIMULATION_TICK_RATE),
  };
}

/** Nine ways into the same fight. */
export const APPROACHES: readonly Vec2[] = [-3, 0, 3].flatMap((x) =>
  [-3, 0, 3].map((z) => ({ x, z })),
);
