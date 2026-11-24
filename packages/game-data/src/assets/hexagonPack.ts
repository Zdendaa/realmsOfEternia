/**
 * KayKit Medieval Hexagon Pack 1.0 FREE (CC0, Kay Lousberg). Only the models in use are
 * copied in (packed to GLB, the yellow color variant) and live in
 * apps/client/public/assets/models/hexagon/. Its models share one texture atlas, so
 * `MEDIEVAL_PACK.materialOverrides` (by material name) don't apply to them.
 */
export const HEXAGON_PACK = {
  /** Model folder, relative to the client's public root. */
  modelDir: 'assets/models/hexagon/',
  /**
   * Pack units → world units. 3.5× would match the doors to our characters exactly;
   * 4× makes buildings slightly larger than units, as RTS buildings usually are
   * (Builder Pack: 3×). Decided 2026-11-24.
   */
  worldScale: 4,
  /** Name of the shared atlas material in every model. */
  atlasMaterial: 'hexagons_medieval',
  /**
   * The atlas is an 8 × 4 grid of gradient swatches (columns, rows; row 0 at the top). The
   * pack's four color variants differ only in which swatch their roofs, banners and trims
   * use; in the yellow variant that is exactly cell [2, 3] (checked for every model in
   * use: those are the only vertices that change between variants). The renderer
   * recolors that cell with the owner's color.
   */
  atlasGrid: [8, 4] as const,
  teamCell: [2, 3] as const,
} as const;
