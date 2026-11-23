import { MeshStandardMaterial } from 'three';
import { VALUE_NOISE_GLSL } from '../shaders/noise.glsl';

/**
 * Modulates the vertex colors with world-space noise so the ground isn't flat plastic:
 * broad patches (~5 units) everywhere, and fine tufts (~1 unit) that fade out with
 * camera distance so the RTS overview stays calm. Vertex-color zones stay the base.
 */
const DETAIL_GLSL = /* glsl */ `
{
  vec2 p = vRoeWorld.xz;
  float fineFade = 1.0 - smoothstep(45.0, 140.0, length(vViewPosition));
  float broad = roeNoise(p * 0.19) - 0.5;
  float fine = (roeNoise(p * 0.95) - 0.5) * 0.6 + (roeNoise(p * 2.3) - 0.5) * 0.4;
  diffuseColor.rgb *= 1.0 + broad * 0.13 + fine * 0.11 * fineFade;
}
`;

export function createTerrainMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoeWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRoeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vRoeWorld;\n${VALUE_NOISE_GLSL}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${DETAIL_GLSL}`);
  };
  // Patched shaders must not share a cached program with plain standard materials.
  material.customProgramCacheKey = () => 'roe-terrain-detail-v1';
  return material;
}
