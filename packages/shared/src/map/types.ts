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

/** Square area at the map center that is kept flat and free of decorations. */
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

export interface MapDefinition {
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
  decorations: readonly DecorationRule[];
}

export interface Decoration {
  kind: DecorationKind;
  x: number;
  /** Ground height at (x, z). */
  y: number;
  z: number;
  /** Rotation around the vertical axis, in radians. */
  rotation: number;
  scale: number;
}
