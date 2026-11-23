/**
 * KayKit Medieval Builder Pack 1.0 (CC0, Kay Lousberg).
 * Files live in apps/client/public/assets/models/medieval/.
 */
export const MEDIEVAL_PACK = {
  /** Model folder, relative to the client's public root. */
  modelDir: 'assets/models/medieval/objects/',
  /**
   * Pack units → world units. A pack house is ~1.69 units wide; ×3 makes it ~5 units,
   * which fits our trees (3.5–6.5 units tall) and terrain.
   */
  worldScale: 3,
  /**
   * Material colors replaced at load time, by material name (sRGB hex). The pack's
   * teal greens are pulled toward our terrain and tree palette. GLB files stay untouched.
   */
  materialColorOverrides: {
    GreenDark: '#2d5c2c',
    Green: '#5a8a37',
  } as Readonly<Record<string, string>>,
} as const;
