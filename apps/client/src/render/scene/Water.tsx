import { useFrame } from '@react-three/fiber';
import { lakeDistance, type HeightField, type Lake } from '@roe/shared';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  type Mesh,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { VALUE_NOISE_GLSL } from '../shaders/noise.glsl';

const RINGS = 40;
const SEGMENTS = 96;
/** Depth (world units) at which the water reaches its deepest color. */
const FULL_DEPTH = 2.2;

const vertexShader = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vDepth = aDepth;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uTime;
uniform float uFullDepth;
varying float vDepth;
varying vec3 vWorld;
#include <fog_pars_fragment>
${VALUE_NOISE_GLSL}
void main() {
  float depth = max(vDepth, 0.0);
  float deep = smoothstep(0.0, uFullDepth, depth);
  // Calm open water: just the depth gradient, no surface pattern.
  vec3 color = mix(uShallow, uDeep, deep);

  // Thin foam line along the shore. Its position (in depth) breathes slowly in and
  // out, phase-shifted along the shore, like lapping water. It never travels along
  // its own length, and broken segments keep it from looking ruled.
  vec2 p = vWorld.xz;
  float phase = roeNoise(p * 0.12) * 6.2832;
  float edge = 0.07 + 0.035 * sin(uTime * 0.9 + phase);
  float line = 1.0 - smoothstep(0.0, 0.055, abs(depth - edge));
  float broken = smoothstep(0.25, 0.6, roeNoise(p * 0.7));
  float foam = line * mix(0.55, 1.0, broken);
  color = mix(color, uFoam, foam * 0.5);

  // Fade out over the last 0.25 units of depth, hiding the jagged terrain intersection;
  // the foam line stays visible on top of that fade.
  float alpha = mix(0.62, 0.93, deep) * smoothstep(0.0, 0.25, depth);
  alpha = max(alpha, foam * 0.55);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Polar grid over each lake at its water level; `aDepth` = water depth per vertex. */
function buildWaterGeometry(lakes: readonly Lake[], heights: HeightField): BufferGeometry {
  const positions: number[] = [];
  const depths: number[] = [];
  const indices: number[] = [];

  for (const lake of lakes) {
    const base = positions.length / 3;
    // Reach a bit past the widest possible shoreline; terrain hides the rest.
    const outer = lake.radius * (1 + lake.irregularity) * 1.1;
    positions.push(lake.x, lake.level, lake.z);
    depths.push(lake.level - heights.getHeightAt(lake.x, lake.z));

    for (let ring = 1; ring <= RINGS; ring++) {
      const r = (ring / RINGS) * outer;
      for (let s = 0; s < SEGMENTS; s++) {
        const angle = (s / SEGMENTS) * Math.PI * 2;
        const x = lake.x + Math.cos(angle) * r;
        const z = lake.z + Math.sin(angle) * r;
        positions.push(x, lake.level, z);
        depths.push(lakeDistance(lake, x, z) < 1.4 ? lake.level - heights.getHeightAt(x, z) : -1);
      }
    }

    const vertex = (ring: number, s: number) =>
      ring === 0 ? base : base + 1 + (ring - 1) * SEGMENTS + (s % SEGMENTS);
    for (let ring = 0; ring < RINGS; ring++) {
      for (let s = 0; s < SEGMENTS; s++) {
        // Counter-clockwise seen from above, so the surface faces up.
        if (ring === 0) {
          indices.push(vertex(0, 0), vertex(1, s + 1), vertex(1, s));
          continue;
        }
        indices.push(vertex(ring, s), vertex(ring, s + 1), vertex(ring + 1, s));
        indices.push(vertex(ring, s + 1), vertex(ring + 1, s + 1), vertex(ring + 1, s));
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aDepth', new BufferAttribute(new Float32Array(depths), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

interface WaterProps {
  lakes: readonly Lake[];
  heights: HeightField;
}

/** Stylized low-poly water: calm depth gradient and a thin, gently moving shoreline foam line. */
export function Water({ lakes, heights }: WaterProps) {
  const geometry = useMemo(() => buildWaterGeometry(lakes, heights), [lakes, heights]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: UniformsUtils.merge([
          UniformsLib.fog,
          {
            uShallow: { value: new Color('#4f9c95') },
            uDeep: { value: new Color('#1d4f63') },
            uFoam: { value: new Color('#cfe3d6') },
            uTime: { value: 0 },
            uFullDepth: { value: FULL_DEPTH },
          },
        ]),
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const meshRef = useRef<Mesh>(null);
  useFrame((_, delta) => {
    const surface = meshRef.current?.material;
    if (surface instanceof ShaderMaterial && surface.uniforms.uTime) {
      surface.uniforms.uTime.value += delta;
    }
  });

  if (lakes.length === 0) return null;
  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}
