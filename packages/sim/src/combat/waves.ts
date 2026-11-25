import { isUnitKind } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId, type Vec2, type WaveDefinition } from '@roe/shared';
import type { BuildingInstance } from '../state/gameState.js';
import { createUnit, type UnitInstance } from '../state/units.js';
import { formationOffsets, moveTo } from '../units/orders.js';
import { MONSTER_PLAYER } from './hostility.js';

/** Where a wave marches: the player Town Hall nearest to its spawn, else the map center. */
function waveTarget(wave: WaveDefinition, buildings: readonly BuildingInstance[]): Vec2 {
  let best: BuildingInstance | null = null;
  let bestSq = Infinity;
  for (const b of buildings) {
    if (b.type !== 'townHall' || b.ownerId === null || b.ownerId === MONSTER_PLAYER) continue;
    const sq = (b.x - wave.x) ** 2 + (b.z - wave.z) ** 2;
    // Buildings are in id order, so the first of equally near ones wins.
    if (sq < bestSq) {
      best = b;
      bestSq = sq;
    }
  }
  return best ? { x: best.x, z: best.z } : { x: 0, z: 0 };
}

/**
 * Spawns `wave` for the monsters around its point, every unit attack-moving to the
 * nearest player Town Hall (they fight units and buildings on the way, and keep fighting
 * what they see once there). Unknown unit kinds are skipped. New units are appended to
 * `units`; returns the next free entity id.
 */
export function sendWave(
  wave: WaveDefinition,
  buildings: readonly BuildingInstance[],
  units: UnitInstance[],
  nextEntityId: EntityId,
): EntityId {
  const target = waveTarget(wave, buildings);
  const kinds = wave.units.flatMap(({ unit, count }) =>
    isUnitKind(unit) ? Array.from({ length: count }, () => unit) : [],
  );
  const spawn = formationOffsets(kinds.length);
  const arrive = formationOffsets(kinds.length);
  let next = nextEntityId;
  kinds.forEach((kind, i) => {
    const offset = spawn[i] ?? { x: 0, z: 0 };
    const goalOffset = arrive[i] ?? { x: 0, z: 0 };
    const goal = { x: target.x + goalOffset.x, z: target.z + goalOffset.z };
    const unit = createUnit(next++, kind, MONSTER_PLAYER, {
      x: wave.x + offset.x * 1.3,
      z: wave.z + offset.z * 1.3,
    });
    units.push(
      unit.combat
        ? { ...unit, task: { kind: 'attackMove', ...goal }, movement: moveTo(goal) }
        : unit,
    );
  });
  return next;
}

/** First tick of a wave. */
export const waveTick = (wave: WaveDefinition) => Math.round(wave.at * SIMULATION_TICK_RATE);

/**
 * Sends every wave that is due on `tick` (waves are in time order; `wavesSent` counts
 * the ones already sent). Returns the new count, the next free entity id and whether a
 * wave set out now.
 */
export function sendDueWaves(
  waves: readonly WaveDefinition[],
  wavesSent: number,
  tick: number,
  buildings: readonly BuildingInstance[],
  units: UnitInstance[],
  nextEntityId: EntityId,
): { wavesSent: number; nextEntityId: EntityId; sentNow: boolean } {
  let sent = wavesSent;
  let next = nextEntityId;
  for (let wave = waves[sent]; wave && waveTick(wave) <= tick; wave = waves[sent]) {
    next = sendWave(wave, buildings, units, next);
    sent++;
  }
  return { wavesSent: sent, nextEntityId: next, sentNow: sent > wavesSent };
}
