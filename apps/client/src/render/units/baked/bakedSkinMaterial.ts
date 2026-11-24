import {
  MeshDepthMaterial,
  RGBADepthPacking,
  type DataTexture,
  type Material,
  type MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * Shared uniforms of every baked-skin material: the bone texture and the animation clock.
 * Updating `uTime.value` once per frame animates all instances.
 */
export interface BakedSkinUniforms {
  uBones: { value: DataTexture };
  uTime: { value: number };
  uFps: { value: number };
}

/**
 * Vertex code shared by the color and the depth (shadow) material.
 *
 * Per instance, `aAnim` = (first row, frame count, time offset in seconds, playback rate).
 * The frame is (uTime · rate + offset) · fps, looped; the two neighbouring frames are
 * blended so slow playback stays smooth.
 */
const VERTEX_PARS = /* glsl */ `
uniform sampler2D uBones;
uniform float uTime;
uniform float uFps;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec4 aAnim;

mat4 bakedBone(float bone, float row) {
  int x = int(bone) * 4;
  int y = int(row);
  return mat4(
    texelFetch(uBones, ivec2(x, y), 0),
    texelFetch(uBones, ivec2(x + 1, y), 0),
    texelFetch(uBones, ivec2(x + 2, y), 0),
    texelFetch(uBones, ivec2(x + 3, y), 0)
  );
}

mat4 blendedBone(float bone, float r0, float r1, float t) {
  return bakedBone(bone, r0) * (1.0 - t) + bakedBone(bone, r1) * t;
}
`;

const SKIN_MATRIX = /* glsl */ `
float bakedFrame = mod((uTime * aAnim.w + aAnim.z) * uFps, aAnim.y);
float bakedF0 = floor(bakedFrame);
float bakedT = bakedFrame - bakedF0;
float bakedR0 = aAnim.x + bakedF0;
float bakedR1 = aAnim.x + mod(bakedF0 + 1.0, aAnim.y);
mat4 bakedSkin =
  skinWeight.x * blendedBone(skinIndex.x, bakedR0, bakedR1, bakedT) +
  skinWeight.y * blendedBone(skinIndex.y, bakedR0, bakedR1, bakedT) +
  skinWeight.z * blendedBone(skinIndex.z, bakedR0, bakedR1, bakedT) +
  skinWeight.w * blendedBone(skinIndex.w, bakedR0, bakedR1, bakedT);
`;

/** Largest atlas grid the tint supports (cells = columns × rows). */
const MAX_TINT_CELLS = 64;

/**
 * Recolored swatches of a character's texture atlas: per cell (row-major, row 0 at the
 * top) 0 = keep, 1 = the owner's color, 2 = the instance's profession color. `gains`
 * (1 / the cell's mean brightness) make a cell's average texel take exactly the new
 * color, whether the original swatch was bright or dark.
 */
export interface AtlasTint {
  grid: readonly [number, number];
  roles: readonly number[];
  gains: readonly number[];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Mean linear brightness of every cell of an atlas texture (row-major, row 0 at the top),
 * sampled from a small downscaled copy. Null when the image can't be read.
 */
export function measureCellLuma(
  image: CanvasImageSource | undefined,
  grid: readonly [number, number],
): number[] | null {
  if (!image || typeof document === 'undefined') return null;
  const [columns, rows] = grid;
  const per = 8;
  const canvas = document.createElement('canvas');
  canvas.width = columns * per;
  canvas.height = rows * per;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const luma: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let sum = 0;
      for (let y = 0; y < per; y++) {
        for (let x = 0; x < per; x++) {
          const i = ((row * per + y) * canvas.width + column * per + x) * 4;
          sum +=
            0.299 * toLinear((pixels[i] ?? 0) / 255) +
            0.587 * toLinear((pixels[i + 1] ?? 0) / 255) +
            0.114 * toLinear((pixels[i + 2] ?? 0) / 255);
        }
      }
      luma.push(sum / (per * per));
    }
  }
  return luma;
}

/**
 * Team and profession colors: the atlas cell under the texel picks the role, and the
 * new color keeps the swatch's shading (its brightness). Cells are exact, so no other
 * part of the character changes color.
 */
const TINT_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
{
  ivec2 tintGrid = ivec2(uTintGrid);
  ivec2 tintCell = clamp(ivec2(floor(vMapUv * uTintGrid)), ivec2(0), tintGrid - 1);
  int tintRole = uTintRoles[tintCell.y * tintGrid.x + tintCell.x];
  if (tintRole > 0) {
    float tintLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float tintGain = uTintGains[tintCell.y * tintGrid.x + tintCell.x];
    vec3 tintColor = tintRole == 1 ? vTeam : vTint;
    diffuseColor.rgb = tintColor * clamp(tintLuma * tintGain, 0.0, 1.5);
  }
}
#endif
`;

function patchVertex(shader: WebGLProgramParametersWithUniforms, uniforms: BakedSkinUniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <skinbase_vertex>', SKIN_MATRIX)
    .replace(
      '#include <skinning_vertex>',
      'transformed = (bakedSkin * vec4(transformed, 1.0)).xyz;',
    );
}

/**
 * Turns a standard material into one that skins each instance from the bone texture.
 * With `tint`, it also recolors atlas cells per instance (`aTeam` / `aTint` attributes);
 * without, it is used for attached props (loads, hats, tools) as they are. Lighting,
 * shadow receiving and fog stay three.js's own.
 */
export function makeBakedSkinMaterial(
  material: MeshStandardMaterial,
  uniforms: BakedSkinUniforms,
  tint: AtlasTint | null = null,
): MeshStandardMaterial {
  const roles = new Int32Array(MAX_TINT_CELLS);
  const gains = new Float32Array(MAX_TINT_CELLS);
  if (tint) {
    if (tint.roles.length > MAX_TINT_CELLS) throw new Error('Atlas tint grid too large');
    roles.set(tint.roles);
    gains.set(tint.gains);
  }
  material.onBeforeCompile = (shader) => {
    patchVertex(shader, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinnormal_vertex>',
      'objectNormal = normalize((bakedSkin * vec4(objectNormal, 0.0)).xyz);',
    );
    if (!tint) return;
    shader.uniforms.uTintGrid = { value: [tint.grid[0], tint.grid[1]] };
    shader.uniforms.uTintRoles = { value: roles };
    shader.uniforms.uTintGains = { value: gains };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aTeam;\nattribute vec3 aTint;\nvarying vec3 vTeam;\nvarying vec3 vTint;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTeam = aTeam;\nvTint = aTint;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec2 uTintGrid;\nuniform int uTintRoles[${MAX_TINT_CELLS}];\nuniform float uTintGains[${MAX_TINT_CELLS}];\nvarying vec3 vTeam;\nvarying vec3 vTint;`,
      )
      .replace('#include <map_fragment>', `#include <map_fragment>\n${TINT_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => (tint ? 'baked-skin-tint-v2' : 'baked-skin-v2');
  return material;
}

/** Depth material for shadows, animated exactly like the color material. */
export function makeBakedSkinDepthMaterial(uniforms: BakedSkinUniforms): Material {
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = (shader) => patchVertex(shader, uniforms);
  depth.customProgramCacheKey = () => 'baked-skin-depth-v1';
  return depth;
}
