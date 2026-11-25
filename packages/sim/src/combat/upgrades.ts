import { BUILDINGS, type BuildingId } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import type { BuildingInstance } from '../state/gameState.js';

/** A tower being upgraded: it stands (and can be hurt) but doesn't shoot. */
export interface TowerUpgrade {
  to: BuildingId;
  startedAt: number;
  /** Tick it is done on. */
  readyAt: number;
}

export type TowerUpgrades = Readonly<Record<EntityId, TowerUpgrade>>;

export const startUpgrade = (to: BuildingId, tick: number): TowerUpgrade => ({
  to,
  startedAt: tick,
  readyAt: tick + Math.max(1, Math.round(BUILDINGS[to].buildTime * SIMULATION_TICK_RATE)),
});

/**
 * Turns the towers whose upgrade is due into their new type (same id, same spot; damage
 * taken stays, so a sturdier tower comes out with more health left) and forgets the
 * upgrades of towers that fell, whose cost is lost. Returns the same objects when
 * nothing changed.
 */
export function progressUpgrades(
  buildings: readonly BuildingInstance[],
  upgrades: TowerUpgrades,
  tick: number,
): { buildings: readonly BuildingInstance[]; upgrades: TowerUpgrades } {
  const entries = Object.entries(upgrades);
  if (entries.length === 0) return { buildings, upgrades };
  const standing = new Set(buildings.map((b) => b.id));
  const done = new Map<EntityId, BuildingId>();
  const left: Record<EntityId, TowerUpgrade> = {};
  for (const [key, upgrade] of entries) {
    const id = Number(key);
    if (!standing.has(id)) continue;
    if (tick >= upgrade.readyAt) done.set(id, upgrade.to);
    else left[id] = upgrade;
  }
  if (done.size === 0 && Object.keys(left).length === entries.length) {
    return { buildings, upgrades };
  }
  return {
    buildings:
      done.size === 0
        ? buildings
        : buildings.map((b) => {
            const to = done.get(b.id);
            return to ? { ...b, type: to } : b;
          }),
    upgrades: left,
  };
}
