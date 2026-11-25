import { useFrame } from '@react-three/fiber';
import { attackOf, productionOf, type ProfessionId } from '@roe/game-data';
import { SIMULATION_TICK_RATE, type Decoration, type EntityId } from '@roe/shared';
import {
  combatTicks,
  plotCenter,
  type BuildingInstance,
  type GameState,
  type UnitInstance,
} from '@roe/sim';
import { useRef } from 'react';
import { useGameStore } from '../../state/gameStore';
import { simClock } from '../simulation/simClock';
import { shownAt } from '../fog/knowledge';
import { renderedUnitList, renderedUnits, type RenderedUnit, type UnitWork } from './renderedUnits';

/** How quickly units turn toward their walking direction (per second). */
const TURN_RATE = 12;

/** A corpse starts sinking this long after death (s) and is gone below ground by removal. */
const SINK_START = 1.8;
/** How fast corpses sink (units per second). */
const SINK_SPEED = 0.9;

/**
 * Seconds since the current attack of `unit` started at render tick `now` (the
 * attack began `cooldown` ticks before `readyAt`), or null when it isn't attacking.
 */
function attackElapsed(unit: UnitInstance, now: number): number | null {
  const attack = unit.activity === 'attacking' && unit.combat ? attackOf(unit.type) : undefined;
  if (!attack || !unit.combat) return null;
  const start = unit.combat.readyAt - combatTicks(attack.cooldown);
  return Math.max(0, now - start) / SIMULATION_TICK_RATE;
}

/** Shortest signed angle from `a` to `b`. */
const angleDelta = (a: number, b: number) => {
  const d = (b - a) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
};

/**
 * Builders hammer (as do workers processing at their building); gatherers and workers
 * at a node chop trees and pick at rocks; farmers sow and reap.
 */
function workOf(unit: UnitInstance, decorations: readonly Decoration[]): UnitWork {
  const task = unit.task;
  if (task.kind === 'gather') return decorations[task.nodeId]?.kind === 'rock' ? 'mine' : 'chop';
  if (task.kind !== 'work') return 'build';
  switch (task.phase) {
    case 'working':
      return decorations[task.target]?.kind === 'rock' ? 'mine' : 'chop';
    case 'sowing':
      return 'sow';
    case 'harvesting':
      return 'reap';
    default:
      return 'build';
  }
}

/** A worker's profession, from the production building it works for. */
function professionOf(
  unit: UnitInstance,
  buildings: ReadonlyMap<EntityId, BuildingInstance>,
): ProfessionId | null {
  if (unit.task.kind !== 'work') return null;
  const building = buildings.get(unit.task.buildingId);
  return building ? (productionOf(building.type)?.profession ?? null) : null;
}

/** Millers and bakers process inside their building, so they aren't drawn meanwhile. */
function isInside(unit: UnitInstance, buildings: ReadonlyMap<EntityId, BuildingInstance>) {
  if (unit.task.kind !== 'work' || unit.task.phase !== 'processing') return false;
  const building = buildings.get(unit.task.buildingId);
  return building ? productionOf(building.type)?.kind === 'process' : false;
}

/**
 * Computes every unit's frame once: interpolated position between the previous and the
 * current tick, ground height, facing (walking direction, or the site or tree/rock while
 * working) and the kind of work.
 * Mount it after `SimulationDriver` and before anything that reads `renderedUnits`.
 */
export function UnitFrameDriver() {
  // Lookup maps, rebuilt only when the underlying arrays change (once per tick at most).
  const lookups = useRef({
    previous: null as GameState | null,
    previousUnits: new Map<EntityId, UnitInstance>(),
    buildingsRef: null as readonly BuildingInstance[] | null,
    buildings: new Map<EntityId, BuildingInstance>(),
    unitsRef: null as readonly UnitInstance[] | null,
    units: new Map<EntityId, UnitInstance>(),
  });

  useFrame((_, delta) => {
    const { state, previous, ctx, world } = useGameStore.getState();
    const look = lookups.current;
    if (look.previous !== previous) {
      look.previous = previous;
      look.previousUnits = new Map(previous.units.map((u) => [u.id, u]));
    }
    if (look.buildingsRef !== state.buildings) {
      look.buildingsRef = state.buildings;
      look.buildings = new Map(state.buildings.map((b) => [b.id, b]));
    }

    if (look.unitsRef !== state.units) {
      look.unitsRef = state.units;
      look.units = new Map(state.units.map((u) => [u.id, u]));
    }

    const alpha = simClock.alpha;
    // Rendering runs one tick behind: between the previous state (tick - 1) and this one.
    const now = state.tick - 1 + alpha;
    const turn = Math.min(1, delta * TURN_RATE);
    renderedUnitList.length = 0;
    for (const unit of state.units) {
      // Other players' units out of the local player's sight aren't drawn (fog of war).
      if (!shownAt(unit.ownerId, unit.x, unit.z)) continue;
      const before = look.previousUnits.get(unit.id) ?? unit;
      const x = before.x + (unit.x - before.x) * alpha;
      const z = before.z + (unit.z - before.z) * alpha;

      let r: RenderedUnit | undefined = renderedUnits.get(unit.id);
      if (!r) {
        r = {
          id: unit.id,
          type: unit.type,
          x,
          y: 0,
          z,
          heading: 0,
          activity: unit.activity,
          work: 'build',
          profession: null,
          inside: false,
          carrying: null,
          ownerId: null,
          attackElapsed: null,
          deathElapsed: null,
        };
        renderedUnits.set(unit.id, r);
      }
      const dx = unit.x - before.x;
      const dz = unit.z - before.z;
      let target: number | null = null;
      if (unit.activity === 'walking' && dx * dx + dz * dz > 1e-6) {
        target = Math.atan2(dx, dz);
      } else if (unit.activity === 'attacking' && unit.combat?.targetId != null) {
        const foe = look.units.get(unit.combat.targetId);
        if (foe) target = Math.atan2(foe.x - x, foe.z - z);
      } else if (unit.activity === 'working' && unit.task.kind === 'build') {
        const site = look.buildings.get(unit.task.siteId);
        if (site) target = Math.atan2(site.x - x, site.z - z);
      } else if (unit.activity === 'working' && unit.task.kind === 'gather') {
        const node = world.decorations[unit.task.nodeId];
        if (node) target = Math.atan2(node.x - x, node.z - z);
      } else if (unit.activity === 'working' && unit.task.kind === 'work') {
        // Workers face the node they harvest, the plot they sow or reap, or their building
        // while processing.
        const task = unit.task;
        const building = look.buildings.get(task.buildingId);
        const faced =
          task.phase === 'working'
            ? world.decorations[task.target]
            : (task.phase === 'sowing' || task.phase === 'harvesting') && building
              ? plotCenter(building, task.target)
              : building;
        if (faced) target = Math.atan2(faced.x - x, faced.z - z);
      }
      if (target !== null) r.heading += angleDelta(r.heading, target) * turn;
      r.x = x;
      r.z = z;
      r.deathElapsed =
        unit.diedAt === null ? null : Math.max(0, now - unit.diedAt) / SIMULATION_TICK_RATE;
      r.attackElapsed = attackElapsed(unit, now);
      const sink =
        r.deathElapsed === null ? 0 : Math.max(0, r.deathElapsed - SINK_START) * SINK_SPEED;
      r.y = ctx.heights.getHeightAt(x, z) - sink;
      r.activity = unit.activity;
      r.work = workOf(unit, world.decorations);
      r.profession = professionOf(unit, look.buildings);
      r.inside = isInside(unit, look.buildings);
      r.carrying = unit.carrying?.resource ?? null;
      r.ownerId = unit.ownerId;
      renderedUnitList.push(r);
    }
    if (renderedUnits.size > renderedUnitList.length) {
      const alive = new Set(renderedUnitList.map((u) => u.id));
      for (const id of renderedUnits.keys()) if (!alive.has(id)) renderedUnits.delete(id);
    }
  });

  return null;
}
