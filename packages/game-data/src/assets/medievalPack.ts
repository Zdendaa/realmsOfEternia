export interface MaterialOverride {
  /** sRGB hex color. */
  color?: string;
  /** PBR roughness (0 = glossy, 1 = matte). */
  roughness?: number;
}

/**
 * KayKit Medieval Builder Pack 1.0 (CC0, Kay Lousberg).
 * Files live in apps/client/public/assets/models/medieval/.
 */
export const MEDIEVAL_PACK = {
  /** Model folder, relative to the client's public root. */
  modelDir: 'assets/models/medieval/objects/',
  /**
   * Pack units → world units. A pack house is ~1.69 units wide; ×3 makes it ~5 units,
   * which fits our trees and terrain.
   */
  worldScale: 3,
  /**
   * Material changes applied at load time, by material name. The pack's teal greens are
   * pulled toward our terrain and tree palette, and foliage is made matte like our own
   * trees (the pack uses roughness 0.4). GLB files stay untouched.
   */
  materialOverrides: {
    GreenDark: { color: '#2d5c2c', roughness: 0.85 },
    Green: { color: '#5a8a37', roughness: 0.9 },
    // farm_plot crops: the pack's saturated orange-yellow (#ff8105 linear) → muted wheat.
    Yellow: { color: '#c9a55c', roughness: 0.85 },
  } as Readonly<Record<string, MaterialOverride>>,
} as const;
