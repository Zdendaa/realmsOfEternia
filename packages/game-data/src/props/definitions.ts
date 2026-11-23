import { MEDIEVAL_PACK } from '../assets/medievalPack.js';

export interface PropDefinition {
  id: string;
  /** Model file, relative to the client's public root. */
  modelPath: string;
  /** Base uniform scale (model units → world units). */
  scale: number;
}

const model = (file: string) => `${MEDIEVAL_PACK.modelDir}${file}.gltf.glb`;
const S = MEDIEVAL_PACK.worldScale;

/**
 * Small decorative models. The pack has no standalone village clutter (barrels,
 * crates and fences are baked into the buildings), so these are its only small details.
 */
export const PROPS = {
  rocksSmall: { id: 'rocksSmall', modelPath: model('detail_rocks_small'), scale: S },
  rocks: { id: 'rocks', modelPath: model('detail_rocks'), scale: S * 0.6 },
  // ~0.75 pack units tall → ~2.3 world units: garden-sized trees next to houses.
  gardenTreeA: { id: 'gardenTreeA', modelPath: model('detail_treeA'), scale: S },
  gardenTreeB: { id: 'gardenTreeB', modelPath: model('detail_treeB'), scale: S },
  gardenTreeC: { id: 'gardenTreeC', modelPath: model('detail_treeC'), scale: S },
} as const satisfies Record<string, PropDefinition>;

export type PropId = keyof typeof PROPS;
