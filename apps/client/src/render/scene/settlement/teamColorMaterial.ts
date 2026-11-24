import { HEXAGON_PACK } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import { MeshStandardMaterial, type Material } from 'three';
import { measureCellLuma } from '../../units/baked/bakedSkinMaterial';
import { ownerColor } from '../../units/unitColors';

/** Brightness gain where the atlas can't be measured (about right for mid-tone swatches). */
const FALLBACK_GAIN = 2.2;

/** Instance color that keeps a building's own (yellow) team cell: neutral buildings. */
export const KEEP_TEAM_COLOR = [-1, -1, -1] as const;

const [COLUMNS, ROWS] = HEXAGON_PACK.atlasGrid;
const [TEAM_COLUMN, TEAM_ROW] = HEXAGON_PACK.teamCell;

/**
 * Replaces `color_fragment`: for texels in the atlas's team cell, the instance color
 * (`vColor`, from `instanceColor`) becomes the color, keeping the swatch's shading (its
 * brightness relative to the cell's mean). Every other texel keeps the atlas color; the
 * instance color is never multiplied in. A negative instance color keeps the cell as is.
 */
const TEAM_FRAGMENT = /* glsl */ `
// three.js defines only USE_COLOR in the fragment shader for instance colors; vColor is a vec4.
#if defined( USE_MAP ) && defined( USE_COLOR )
if (vColor.r >= 0.0) {
  vec2 teamCell = floor(vMapUv * vec2(${COLUMNS}.0, ${ROWS}.0));
  if (teamCell == vec2(${TEAM_COLUMN}.0, ${TEAM_ROW}.0)) {
    float teamLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = vColor.rgb * clamp(teamLuma * uTeamGain, 0.0, 1.5);
  }
}
#endif
`;

const cache = new WeakMap<Material, Material>();

/** True for the Hexagon pack's shared atlas material (its roofs can take a team color). */
export const isTeamColorable = (material: Material): material is MeshStandardMaterial =>
  material instanceof MeshStandardMaterial && material.name === HEXAGON_PACK.atlasMaterial;

/**
 * The material to draw `base` with on instanced buildings: for the Hexagon atlas, a
 * clone that recolors the team cell per instance (`instanceColor` must then be set on
 * the mesh); any other material unchanged. Cached per base material.
 */
export function teamColorMaterial(base: Material): Material {
  if (!isTeamColorable(base)) return base;
  const cached = cache.get(base);
  if (cached) return cached;
  const luma = measureCellLuma(
    base.map?.image as CanvasImageSource | undefined,
    HEXAGON_PACK.atlasGrid,
  );
  const cellLuma = luma?.[TEAM_ROW * COLUMNS + TEAM_COLUMN] ?? 0;
  const gain = cellLuma > 0.01 ? 1 / cellLuma : FALLBACK_GAIN;
  const material = base.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTeamGain = { value: gain };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTeamGain;')
      .replace('#include <color_fragment>', TEAM_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'hexagon-team-color';
  cache.set(base, material);
  return material;
}

/** Writes the team color of an owner (or "keep" for neutral) into `out` at `index`. */
export function writeTeamColor(out: Float32Array, index: number, owner: PlayerId | null): void {
  if (owner === null) out.set(KEEP_TEAM_COLOR, index * 3);
  else ownerColor(owner).toArray(out, index * 3);
}
