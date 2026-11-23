import { useSettingsStore } from '../../state/settingsStore';
import { ATMOSPHERE } from './atmosphere';

/** Half-size of the area covered by the sun's shadow camera, in world units. */
const SHADOW_EXTENT = 100;

export function Lighting() {
  const shadows = useSettingsStore((s) => s.shadows);

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
        position={ATMOSPHERE.sunPosition}
        color={ATMOSPHERE.sunColor}
        intensity={ATMOSPHERE.sunIntensity}
        castShadow={shadows}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        {/* Built via constructor args so the projection matrix is computed up front. */}
        <orthographicCamera
          attach="shadow-camera"
          args={[-SHADOW_EXTENT, SHADOW_EXTENT, SHADOW_EXTENT, -SHADOW_EXTENT, 1, 260]}
        />
      </directionalLight>
    </>
  );
}
