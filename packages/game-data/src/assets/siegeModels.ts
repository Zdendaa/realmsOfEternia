import { HEXAGON_PACK } from './hexagonPack.js';

const hexagon = (file: string) => `${HEXAGON_PACK.modelDir}${file}.glb`;

/**
 * How big the siege engines are, in one place: what is drawn and what the simulation
 * collides with.
 */
export const SIEGE_SIZE = {
  /**
   * Scales the engines as modeled below (and the catapult's rock, and the turret and
   * rocks shown in the Siege Workshop). At 0.7 an engine is about as tall as a soldier
   * (1.7) and 2 × 1.35 on the ground.
   */
  modelScale: 0.7,
  /** The engines' collision and reach radius (world units). */
  radius: 0.75,
} as const;

/**
 * How the siege engines look (client). The catapult's turret and throwing arm come from
 * the Hexagon pack's catapult tower (only those two nodes are drawn), on a wheeled frame
 * built in code; its rock is the pack's catapult projectile. The pack has no ram: it is
 * built in code from simple shapes, a **temporary** stand-in until a model is found.
 */
export const SIEGE_MODELS = {
  catapult: {
    model: hexagon('building_tower_catapult'),
    turret: 'catapult_turret_yellow',
    arm: 'catapult_arm_yellow',
    /** Pack units → world units for the turret and arm, before `SIEGE_SIZE.modelScale`. */
    scale: 3,
    /** Standing height before `SIEGE_SIZE.modelScale` (health bars, picking). */
    height: 2.4,
  },
  ram: {
    temporary: true,
    height: 2.3,
  },
  rock: {
    model: hexagon('projectile_catapult'),
    scale: 2.6,
  },
} as const;
