export type DecorationKind = 'tree' | 'rock';

export interface DecorationRule {
  kind: DecorationKind;
  count: number;
  minScale: number;
  maxScale: number;
  /**
   * `scatter`: uniform over the playable area.
   * `forest`: playable area, clustered by the map's forest mask.
   * `border`: dense forest on the non-playable border ring.
   */
  placement: 'scatter' | 'forest' | 'border';
  /** Minimum distance between two decorations of this rule, in world units. */
  minSpacing: number;
}

export interface TerrainSettings {
  /** Maximum hill height above the lowlands, in world units. */
  hillHeight: number;
  /** Approximate horizontal size of the largest hills, in world units. */
  hillScale: number;
}

/** The size of the square, flat, tree-free plateau at every start slot. */
export interface SettlementArea {
  /** Half the side length of the flat square (20 → 40×40 units). */
  halfSize: number;
  /** Width of the band where the flat area blends into the hills. */
  blend: number;
}

export interface ForestSettings {
  /** Approximate size of a forest patch, in world units. */
  scale: number;
  /** Mask value (0–1) above which forest starts; higher means fewer, smaller forests. */
  threshold: number;
  /** Chance for a lone tree outside forests (0–1). */
  strayChance: number;
}

/**
 * Non-playable ring around the playable area: mountains rising into the fog.
 * The terrain keeps going beyond it, so the world never visibly ends.
 */
export interface BorderSettings {
  /** Width of the ring, in world units. Border forest is placed only within it. */
  width: number;
  /** Peak height of the border mountains, in world units. */
  mountainHeight: number;
}

/** A hand-authored lake. Its water level is derived from the surrounding terrain. */
export interface LakeDefinition {
  x: number;
  z: number;
  /** Average shoreline radius, in world units. */
  radius: number;
  /** Depth below the water surface at the center. */
  depth: number;
  /** Shoreline wobble, 0 = perfect circle, ~0.25 = natural. */
  irregularity: number;
}

/** Ore found in a deposit. */
export type DepositKind = 'gold' | 'iron';

/**
 * A hand-authored ore deposit: mines of its kind must be built on it (their center within
 * `radius`). Trees and rocks keep clear of it.
 */
export interface DepositDefinition {
  kind: DepositKind;
  x: number;
  z: number;
  radius: number;
  /**
   * Ore in the deposit. Unused while deposits are infinite (Phase 5b); kept in the data so
   * they can become finite later.
   */
  amount: number;
}

/**
 * Neutral monsters guarding a spot from the start of the match. Unit kinds are game-data
 * ids (checked when the match starts); the guards stand around (x, z) and return there
 * after a fight.
 */
export interface CampDefinition {
  x: number;
  z: number;
  units: readonly { unit: string; count: number }[];
}

/**
 * A scripted attack: at `at` seconds into the match, these monsters appear around
 * (x, z) and attack-move to the nearest player's Town Hall.
 */
export interface WaveDefinition {
  at: number;
  x: number;
  z: number;
  units: readonly { unit: string; count: number }[];
}

export interface WaterSettings {
  lakes: readonly LakeDefinition[];
}

/** A hero a player starts the match with. */
export interface StartingHeroDefinition {
  /** A game-data hero id; unknown ones are skipped, like camps' unknown units. */
  hero: string;
  /** In the starting settlement's own coordinates (before its slot turns it). */
  x: number;
  z: number;
}

/** Quarter turns around the vertical axis (90° steps, the sense of three.js `rotation.y`). */
export type QuarterTurns = 0 | 1 | 2 | 3;

/**
 * One player's start position: the starting settlement is built around (x, z), turned by
 * `quarterTurns`, on its own flat plateau.
 */
export interface StartSlotDefinition {
  x: number;
  z: number;
  quarterTurns: QuarterTurns;
  /** Heroes of the player in this slot: each map or mission can give others, or none. */
  heroes?: readonly StartingHeroDefinition[];
}

export interface MapDefinition {
  /** Start positions, by slot number. Absent: one slot at the center, without heroes. */
  startSlots?: readonly StartSlotDefinition[];
  id: string;
  name: string;
  /** Width and depth of the square playable area, in world units. Centered at the origin. */
  size: number;
  /** Seed for all procedural generation on this map. */
  seed: number;
  terrain: TerrainSettings;
  settlement: SettlementArea;
  forest: ForestSettings;
  border: BorderSettings;
  /** Lakes. Water is never buildable and never gets decorations. */
  water?: WaterSettings;
  /** Ore deposits (gold, iron). */
  deposits?: readonly DepositDefinition[];
  /** Monster camps (skeletons). */
  camps?: readonly CampDefinition[];
  /** Scripted monster attacks, in time order. */
  waves?: readonly WaveDefinition[];
  /**
   * How a player wins (besides keeping their Town Hall, which every map requires):
   * `clearMonsters` = every wave has been sent and no monster (camps, waves) is left.
   * Absent: no victory, only defeat.
   */
  objective?: 'clearMonsters';
  decorations: readonly DecorationRule[];
}

export interface Decoration {
  /** Stable id: the index in the deterministic placement order of its map. */
  id: number;
  kind: DecorationKind;
  x: number;
  /** Ground height at (x, z). */
  y: number;
  z: number;
  /** Rotation around the vertical axis, in radians. */
  rotation: number;
  scale: number;
}
