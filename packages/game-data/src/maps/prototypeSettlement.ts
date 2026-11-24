import { entrancePoint, type Vec2 } from '@roe/shared';
import { BUILDINGS, type BuildingId } from '../buildings/definitions.js';
import type { PropId } from '../props/definitions.js';

export interface BuildingPlacement {
  building: BuildingId;
  x: number;
  z: number;
  /** Y rotation in radians; 0 = entrance facing +Z. */
  rotation: number;
}

export interface SettlementLayout {
  buildings: readonly BuildingPlacement[];
  /** Dirt paths and roads as Catmull-Rom control points. */
  paths: readonly (readonly Vec2[])[];
  pathWidth: number;
  /** Open trampled areas (town square...), worn into the ground. */
  squares: readonly { x: number; z: number; radius: number }[];
  /** Small pack details scattered around these building types (deterministic). */
  props: {
    around: readonly BuildingId[];
    models: readonly PropId[];
    perBuilding: { min: number; max: number };
  };
  /** Serfs that start next to the first Town Hall. */
  startingSerfs: number;
}

/** Paths meet a building this far in front of its front edge (just clear of the facade). */
const ENTRANCE_GAP = 1.2;
const deg = (degrees: number) => (degrees * Math.PI) / 180;

function place(building: BuildingId, x: number, z: number, rotationDeg: number) {
  return { building, x, z, rotation: deg(rotationDeg) } satisfies BuildingPlacement;
}

/** Where a path should end for this building. */
function door(placement: BuildingPlacement): Vec2 {
  return entrancePoint(
    { ...placement, footprint: BUILDINGS[placement.building].footprint },
    ENTRANCE_GAP,
  );
}

const v = (x: number, z: number): Vec2 => ({ x, z });

// --- Buildings -------------------------------------------------------------
// The village is built around a square at (4, 2), right in front of the Town Hall gate.
// The default camera looks from +X+Z toward the origin.
const square = v(4, 2);

const townHall = place('townHall', -2, -5, 45);
const market = place('market', 10.5, -6, -90);
const well = place('well', 8.5, 5.5, 20);

const houseNE = place('house', 10.5, -15, -90);
const houseE = place('house', 13, 1, -90);
const houseSE = place('house', 8, 10, -90);
const houseS = place('house', 0.5, 12, 90);
const houseW = place('house', -6.5, 2, 10);
const houseNW = place('house', -13, -3, 30);

const mill = place('mill', -19, 11, 90);
const lumbermill = place('lumbermill', 1.5, -24, 90);

/** Hand-authored starting settlement in the flat center of PROTOTYPE_MAP. */
export const PROTOTYPE_SETTLEMENT: SettlementLayout = {
  buildings: [
    townHall,
    market,
    well,
    houseNE,
    houseE,
    houseSE,
    houseS,
    houseW,
    houseNW,
    mill,
    lumbermill,
    // Two 2×3 fields on either side of the mill.
    place('field', -22.5, 0, 0),
    place('field', -22.5, 22.5, 0),
  ],
  paths: [
    // Gate → square.
    [door(townHall), v(3, 0.5), square],
    // North road: square → market → north-east house → lumbermill → north map edge.
    [square, door(market), v(6, -14), door(lumbermill), v(6, -45), v(9, -80), v(7, -117)],
    // South road: square → south-east and south houses → south map edge.
    [square, v(4.3, 7), door(houseS), v(4.8, 20), v(2, 32), v(-3, 60), v(0, 90), v(2, 117)],
    // East house.
    [square, door(houseE)],
    // West lane: square → west house → mill.
    [square, v(-2, 5.5), door(houseW), v(-11, 8.2), door(mill)],
    // North-west house, branching off the west lane.
    [v(-11, 8.2), door(houseNW)],
  ],
  pathWidth: 2.2,
  squares: [{ ...square, radius: 4 }],
  props: {
    around: ['house', 'mill', 'lumbermill', 'market'],
    models: ['rocksSmall', 'rocksSmall', 'rocks', 'gardenTreeA', 'gardenTreeB', 'gardenTreeC'],
    perBuilding: { min: 2, max: 4 },
  },
  startingSerfs: 5,
};
