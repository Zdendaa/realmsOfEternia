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

/**
 * Player color: texels where blue clearly dominates (the serf's scarf) take the owner's
 * color at the texel's brightness. Everything else keeps the texture color.
 */
const TEAM_FRAGMENT = /* glsl */ `
float teamMask = smoothstep(0.06, 0.2, diffuseColor.b - max(diffuseColor.r, diffuseColor.g));
float teamLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(diffuseColor.rgb, vTeam * clamp(teamLuma * 2.2, 0.0, 1.2), teamMask);
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
 * Turns the character's standard material into one that skins each instance from the
 * bone texture and recolors the team area. Lighting, shadows receiving and fog stay
 * three.js's own.
 */
export function makeBakedSkinMaterial(
  material: MeshStandardMaterial,
  uniforms: BakedSkinUniforms,
): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    patchVertex(shader, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aTeam;\nvarying vec3 vTeam;')
      .replace(
        '#include <skinnormal_vertex>',
        'objectNormal = normalize((bakedSkin * vec4(objectNormal, 0.0)).xyz);\nvTeam = aTeam;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTeam;')
      .replace('#include <map_fragment>', `#include <map_fragment>\n${TEAM_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'baked-skin-color-v1';
  return material;
}

/** Depth material for shadows, animated exactly like the color material. */
export function makeBakedSkinDepthMaterial(uniforms: BakedSkinUniforms): Material {
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = (shader) => patchVertex(shader, uniforms);
  depth.customProgramCacheKey = () => 'baked-skin-depth-v1';
  return depth;
}
