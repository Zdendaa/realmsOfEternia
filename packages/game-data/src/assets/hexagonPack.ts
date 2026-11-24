/**
 * KayKit Medieval Hexagon Pack 1.0 FREE (CC0, Kay Lousberg). Only the models in use are
 * copied in (packed to GLB) and live in apps/client/public/assets/models/hexagon/.
 * Its models share one texture atlas, so `MEDIEVAL_PACK.materialOverrides` (by material
 * name) don't apply to them.
 */
export const HEXAGON_PACK = {
  /** Model folder, relative to the client's public root. */
  modelDir: 'assets/models/hexagon/',
  /**
   * Pack units → world units. Hexagon buildings are smaller than Builder Pack ones;
   * ~3.5× matches their doors to our characters (Builder Pack: 3×).
   */
  worldScale: 3.5,
} as const;
