import { useMemo } from 'react';
import { BackSide, Color, ShaderMaterial } from 'three';
import { ATMOSPHERE } from './atmosphere';

const SKY_RADIUS = 600;

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  varying vec3 vDirection;
  void main() {
    float t = pow(clamp(vDirection.y, 0.0, 1.0), 0.45);
    gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Gradient sky dome. Its horizon color matches the fog. */
export function Sky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uZenith: { value: new Color(ATMOSPHERE.skyZenith) },
          uHorizon: { value: new Color(ATMOSPHERE.skyHorizon) },
        },
        side: BackSide,
        depthWrite: false,
      }),
    [],
  );

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
    </mesh>
  );
}
