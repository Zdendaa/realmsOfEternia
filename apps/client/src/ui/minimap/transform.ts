import type { Vec2 } from '@roe/shared';

/**
 * World ↔ minimap pixels. The minimap shows the playable area, north up (-Z at the top,
 * +X to the right).
 */
export interface MinimapTransform {
  /** Canvas pixels per world unit. */
  scale: number;
  toPixelX: (x: number) => number;
  toPixelY: (z: number) => number;
  /** The world point at a position given as fractions (0..1) of the minimap's edges. */
  toWorld: (u: number, v: number) => Vec2;
}

export function minimapTransform(mapSize: number, pixels: number): MinimapTransform {
  const half = mapSize / 2;
  const scale = pixels / mapSize;
  const inside = (t: number) => Math.min(1, Math.max(0, t)) * mapSize - half;
  return {
    scale,
    toPixelX: (x) => (x + half) * scale,
    toPixelY: (z) => (z + half) * scale,
    toWorld: (u, v) => ({ x: inside(u), z: inside(v) }),
  };
}
