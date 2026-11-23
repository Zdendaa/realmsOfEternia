import { useFrame } from '@react-three/fiber';
import { clamp } from '@roe/shared';
import { useRef } from 'react';
import { Vector3, type DirectionalLight } from 'three';
import { useSettingsStore } from '../../state/settingsStore';
import { ATMOSPHERE } from './atmosphere';

const SHADOW_MAP_SIZE = 4096;
/** Shadow frustum half-size = camera distance × this factor (55 → ~120×120 units). */
const SHADOW_EXTENT_PER_DISTANCE = 1.1;
const MIN_SHADOW_EXTENT = 30;
const MAX_SHADOW_EXTENT = 110;
/** The extent changes in steps, so zooming doesn't rescale the shadow map every frame. */
const SHADOW_EXTENT_STEP = 10;
/**
 * The light sits this far from the focus point along the sun direction. With the near/far
 * planes below, the depth range covers the shadow area's full diagonal plus the tallest
 * mountains, so nothing inside the frustum is clipped.
 */
const LIGHT_DISTANCE = 260;
const SHADOW_NEAR = 40;
const SHADOW_FAR = 520;

// Fixed light-space basis. It matches the shadow camera's own orientation
// (Matrix4.lookAt with world up), which is what makes texel snapping work.
const sunDirection = new Vector3(...ATMOSPHERE.sunPosition).normalize();
const lightRight = new Vector3().crossVectors(new Vector3(0, 1, 0), sunDirection).normalize();
const lightUp = new Vector3().crossVectors(sunDirection, lightRight);
const ORIGIN = new Vector3();
const snappedCenter = new Vector3();

/** The RTS camera's focus point, read from the default controls. */
function getFocus(controls: unknown): Vector3 {
  if (controls && typeof controls === 'object' && 'target' in controls) {
    const { target } = controls;
    if (target instanceof Vector3) return target;
  }
  return ORIGIN;
}

/**
 * Sun and sky light. The sun follows the camera focus so shadows exist wherever the
 * player looks. The shadow frustum scales with zoom, and its position is snapped to
 * whole shadow-map texels so shadow edges don't shimmer while panning.
 */
export function Lighting() {
  const shadows = useSettingsStore((s) => s.shadows);
  const lightRef = useRef<DirectionalLight>(null);
  const currentExtent = useRef(0);

  useFrame(({ camera, controls }) => {
    const light = lightRef.current;
    if (!light) return;
    const focus = getFocus(controls);

    const wanted = clamp(
      camera.position.distanceTo(focus) * SHADOW_EXTENT_PER_DISTANCE,
      MIN_SHADOW_EXTENT,
      MAX_SHADOW_EXTENT,
    );
    const extent = Math.ceil(wanted / SHADOW_EXTENT_STEP) * SHADOW_EXTENT_STEP;
    if (extent !== currentExtent.current) {
      const shadowCamera = light.shadow.camera;
      shadowCamera.left = -extent;
      shadowCamera.right = extent;
      shadowCamera.top = extent;
      shadowCamera.bottom = -extent;
      shadowCamera.updateProjectionMatrix();
      currentExtent.current = extent;
    }

    // Snap the focus point to the shadow-map texel grid in light space. Movement
    // along the sun direction doesn't affect the texel grid and stays continuous.
    const texel = (2 * extent) / SHADOW_MAP_SIZE;
    const snap = (value: number) => Math.round(value / texel) * texel;
    snappedCenter
      .copy(lightRight)
      .multiplyScalar(snap(focus.dot(lightRight)))
      .addScaledVector(lightUp, snap(focus.dot(lightUp)))
      .addScaledVector(sunDirection, focus.dot(sunDirection));

    light.target.position.copy(snappedCenter);
    light.target.updateMatrixWorld();
    light.position.copy(snappedCenter).addScaledVector(sunDirection, LIGHT_DISTANCE);
  });

  return (
    <>
      <hemisphereLight
        args={[
          ATMOSPHERE.hemisphereSky,
          ATMOSPHERE.hemisphereGround,
          ATMOSPHERE.hemisphereIntensity,
        ]}
      />
      <directionalLight
        ref={lightRef}
        color={ATMOSPHERE.sunColor}
        intensity={ATMOSPHERE.sunIntensity}
        castShadow={shadows}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-intensity={ATMOSPHERE.shadowIntensity}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-60, 60, 60, -60, SHADOW_NEAR, SHADOW_FAR]}
        />
      </directionalLight>
    </>
  );
}
