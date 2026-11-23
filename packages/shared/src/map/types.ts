export type DecorationKind = 'tree' | 'rock';

export interface DecorationRule {
  kind: DecorationKind;
  count: number;
  minScale: number;
  maxScale: number;
}

export interface MapDefinition {
  id: string;
  name: string;
  /** Width and depth of the square map, in world units. Map is centered at the origin. */
  size: number;
  /** Seed for all procedural placement on this map. */
  seed: number;
  /** Radius around the map center kept free of decorations (future start area). */
  clearRadius: number;
  decorations: readonly DecorationRule[];
}

export interface Decoration {
  kind: DecorationKind;
  x: number;
  z: number;
  /** Rotation around the vertical axis, in radians. */
  rotation: number;
  scale: number;
}
