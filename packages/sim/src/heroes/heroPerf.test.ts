/** What heroes, abilities and graves cost in a large battle (reported, loosely bounded). */
import { abilityOf, HERO_IDS, HERO_RULES } from '@roe/game-data';
import { describe, expect, it } from 'vitest';
import { validateCommand } from '../commands/applyCommand.js';
import type { Command, IssuedCommand } from '../commands/types.js';
import { createSimContext } from '../context/simContext.js';
import { createInitialState, type GameState } from '../state/gameState.js';
import { isAlive } from '../state/units.js';
import { now, report } from '../test/bench.js';
import { FLAT_MAP, TOWN } from '../test/fixtures.js';
import { stepGame } from '../tick/stepGame.js';
import { createWorld } from '../world/createWorld.js';
import { abilitiesOf } from './abilities.js';

describe('performance with heroes', () => {
  it('a 120 v 120 battle with six heroes casting stays far below a tick’s 100 ms', () => {
    const world = createWorld(FLAT_MAP, { ...TOWN, startingSerfs: 0 });
    let state: GameState = createInitialState(world, { owner: 'alice' });
    const ctx = createSimContext(world, state, { dev: true, visions: ['alice', 'bob'] });
    const step = (commands: IssuedCommand[]) => {
      state = stepGame(ctx, state, commands).state;
    };
    const dev = (command: Command) => step([{ issuer: 'alice', command }]);
    const sides = [
      { owner: 'alice', z: 20, goal: 40 },
      { owner: 'bob', z: 40, goal: 20 },
    ];
    for (const { owner, z } of sides) {
      for (let i = 0; i < 8; i++) {
        dev({ type: 'debugSpawn', unit: 'swordsman', count: 15, x: -24 + i * 7, z, owner });
      }
      for (const [i, unit] of HERO_IDS.entries()) {
        dev({ type: 'debugSpawn', unit, count: 1, x: -8 + i * 8, z, owner });
      }
    }
    for (const { owner, goal } of sides) {
      const ids = state.units.filter((u) => u.ownerId === owner).map((u) => u.id);
      step([
        {
          issuer: owner,
          command: { type: 'debugExperience', unitIds: ids, amount: HERO_RULES.levelExperience[4] },
        },
      ]);
      step([{ issuer: owner, command: { type: 'attackMove', unitIds: ids, x: 0, z: goal } }]);
    }

    const times: number[] = [];
    let casts = 0;
    let mostGraves = 0;
    for (let tick = 0; tick < 600; tick++) {
      // Every second, every hero uses whatever is ready on the nearest enemy.
      const commands: IssuedCommand[] = [];
      if (tick % 10 === 0) {
        for (const hero of state.units.filter((u) => u.hero && isAlive(u))) {
          const owner = hero.ownerId as string;
          const enemy = state.units.find(
            (u) => u.ownerId !== owner && isAlive(u) && Math.hypot(u.x - hero.x, u.z - hero.z) < 9,
          );
          for (const ability of abilitiesOf(hero)) {
            const kind = abilityOf(ability).target;
            if (kind === 'building' || (kind === 'point' && !enemy)) continue;
            const command: Command = {
              type: 'useAbility',
              unitId: hero.id,
              ability,
              ...(kind === 'point' && enemy ? { target: { x: enemy.x, z: enemy.z } } : {}),
            };
            if (validateCommand(ctx, state, owner, command).ok) {
              commands.push({ issuer: owner, command });
              break;
            }
          }
        }
      }
      const start = now();
      step(commands);
      times.push(now() - start);
      casts += state.casts.filter((c) => c.tick === state.tick - 1).length;
      mostGraves = Math.max(mostGraves, state.graves.length);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
    const p99 = times[Math.floor(times.length * 0.99)] ?? 0;
    const worst = times.at(-1) ?? 0;
    report(
      `heroes in 120 v 120, 60 s: tick mean ${mean.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms, ` +
        `max ${worst.toFixed(2)} ms; ${casts} casts, up to ${mostGraves} graves`,
    );
    expect(casts).toBeGreaterThan(5);
    expect(mean).toBeLessThan(10);
  });
});
