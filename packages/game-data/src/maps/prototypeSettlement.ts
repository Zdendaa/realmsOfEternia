import type { BuildingId } from '../buildings/definitions.js';

export interface BuildingPlacement {
  building: BuildingId;
  x: number;
  z: number;
  /** Y rotation in radians; 0 = entrance facing +Z. */
  rotation: number;
}

export interface SettlementLayout {
  buildings: readonly BuildingPlacement[];
  /** Dirt paths as Catmull-Rom control points ([x, z] pairs). */
  paths: readonly (readonly (readonly [number, number])[])[];
  pathWidth: number;
}

const deg = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Hand-authored starting settlement in the flat center of PROTOTYPE_MAP.
 * The default camera looks from +X+Z toward the origin. Every building's entrance
 * faces (sin r, cos r); paths end at those entrances, 3.5 units in front of the center.
 */
export const PROTOTYPE_SETTLEMENT = {
  buildings: [
    // Town Hall: central landmark, gate facing the square and the default camera.
    { building: 'townHall', x: -2, z: -5, rotation: deg(45) },
    { building: 'market', x: 11, z: -6, rotation: deg(-90) },
    { building: 'well', x: 8.5, z: 8, rotation: deg(20) },

    { building: 'house', x: 10, z: 15, rotation: deg(-80) },
    { building: 'house', x: -4, z: 15, rotation: deg(95) },
    { building: 'house', x: 16, z: 4, rotation: deg(-105) },
    { building: 'house', x: -9, z: 1, rotation: deg(10) },
    { building: 'house', x: -17, z: -6, rotation: deg(45) },
    { building: 'house', x: 13, z: -15, rotation: deg(-75) },

    // Farmland at the western edge of the plateau.
    { building: 'farmPlot', x: -23, z: 13, rotation: deg(15) },
    { building: 'farmPlot', x: -15, z: 24, rotation: deg(40) },
    { building: 'mill', x: -26, z: 24, rotation: deg(130) },

    // Lumbermill at the edge of the northern forest.
    { building: 'lumbermill', x: 2, z: -27, rotation: deg(0) },
  ],
  paths: [
    // Town Hall gate → square.
    [
      [1.7, -1.3],
      [3, 0.8],
      [4, 2],
    ],
    // North road: square → market → lumbermill.
    [
      [4, 2],
      [6.5, -4],
      [6.5, -10],
      [4.5, -17],
      [2, -23.5],
    ],
    // North-east house.
    [
      [5.4, -14],
      [9.6, -14.1],
    ],
    // South street: square → past the well.
    [
      [4, 2],
      [5, 8.5],
      [4.2, 15],
      [2.5, 22],
    ],
    // South houses, crossing the south street.
    [
      [-0.5, 14.7],
      [4.2, 15],
      [6.5, 15.6],
    ],
    // East house.
    [
      [4, 2],
      [9, 2.8],
      [12.6, 3.1],
    ],
    // West road: square → west house → farms → mill.
    [
      [4, 2],
      [-2, 4],
      [-8.4, 5],
      [-14, 7],
      [-18, 12],
      [-20, 17],
      [-23.3, 21.75],
    ],
    // North-west house.
    [
      [-14.5, -3.5],
      [-14.5, 2],
      [-14, 7],
    ],
  ],
  pathWidth: 2.2,
} as const satisfies SettlementLayout;
