import {
  buildingHealthOf,
  BUILDINGS,
  REPAIR_RULES,
  RESOURCE_IDS,
  type BuildingId,
  type ResourceAmounts,
  type ResourceCost,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE, type EntityId } from '@roe/shared';
import { canAfford, EMPTY_STOCK, pay } from '../economy/stock.js';
import type { GameState } from '../state/gameState.js';
import type { UnitInstance } from '../state/units.js';
import { withoutKey } from '../training/training.js';

/**
 * What repairing `damage` points of a complete building of `type` costs: its share of
 * the build cost (`REPAIR_RULES.costShare`), each resource rounded to the nearest unit.
 * Resources that round to 0 are left out.
 */
export function repairCost(type: BuildingId, damage: number): ResourceCost {
  const cost: ResourceCost = BUILDINGS[type].cost;
  const share = (REPAIR_RULES.costShare * damage) / buildingHealthOf(type);
  const result: Partial<ResourceAmounts> = {};
  for (const id of RESOURCE_IDS) {
    const amount = Math.round((cost[id] ?? 0) * share);
    if (amount > 0) result[id] = amount;
  }
  return result;
}

/** What is paid for bringing a building's damage from `from` down to `to`. */
function chargeFor(type: BuildingId, from: number, to: number): ResourceCost {
  const before = repairCost(type, from);
  const after = repairCost(type, to);
  const charge: Partial<ResourceAmounts> = {};
  for (const id of RESOURCE_IDS) charge[id] = (before[id] ?? 0) - (after[id] ?? 0);
  return charge;
}

/** Whole hit points one serf restores on `tick`: integers that add up to the rate. */
const healthOnTick = (tick: number) =>
  Math.floor(((tick + 1) * REPAIR_RULES.healthPerSecond) / SIMULATION_TICK_RATE) -
  Math.floor((tick * REPAIR_RULES.healthPerSecond) / SIMULATION_TICK_RATE);

/**
 * One tick of repair work: every serf working on a damaged building takes damage off
 * it, and the owner pays as the damage goes (`repairCost`). A building whose owner
 * can't pay the next part waits: its serfs stand idle (mutating the unit working
 * copies) until the stock allows. Fully repaired buildings leave `buildingDamage`.
 * Returns the same objects when nothing changed.
 */
export function progressRepairs(
  tick: number,
  state: Pick<GameState, 'buildings' | 'buildingDamage' | 'stocks'>,
  units: readonly UnitInstance[],
): Pick<GameState, 'buildingDamage' | 'stocks'> {
  const crews = new Map<EntityId, UnitInstance[]>();
  for (const u of units) {
    if (u.activity !== 'working' || u.task.kind !== 'repair') continue;
    const crew = crews.get(u.task.buildingId);
    if (crew) crew.push(u);
    else crews.set(u.task.buildingId, [u]);
  }
  let { buildingDamage, stocks } = state;
  if (crews.size === 0) return { buildingDamage, stocks };

  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  for (const [id, crew] of crews) {
    const building = byId.get(id);
    const damage = buildingDamage[id] ?? 0;
    const owner = building?.ownerId;
    if (!building || damage === 0 || owner === null || owner === undefined) continue;
    const stock = stocks[owner] ?? EMPTY_STOCK;
    const healed = Math.min(damage, crew.length * healthOnTick(tick));
    // Judged on at least 1 point each, so a waiting crew doesn't flicker on ticks that
    // restore nothing.
    const next = Math.max(0, damage - Math.max(healed, crew.length));
    if (!canAfford(stock, chargeFor(building.type, damage, next))) {
      for (const unit of crew) unit.activity = 'idle';
      continue;
    }
    if (healed === 0) continue;
    const left = damage - healed;
    const charge = chargeFor(building.type, damage, left);
    if (RESOURCE_IDS.some((r) => (charge[r] ?? 0) > 0)) {
      stocks = { ...stocks, [owner]: pay(stock, charge) };
    }
    buildingDamage = left > 0 ? { ...buildingDamage, [id]: left } : withoutKey(buildingDamage, id);
  }
  return { buildingDamage, stocks };
}
