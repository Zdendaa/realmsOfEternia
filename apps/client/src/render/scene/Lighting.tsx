import { useSettingsStore } from '../../state/settingsStore';

/** Half-size of the area covered by the sun's shadow camera, in world units. */
const SHADOW_EXTENT = 100;

export function Lighting() {
  const shadows = useSettingsStore((s) => s.shadows);

  return (
    <>
      <hemisphereLight args={['#e4f0ff', '#4b5d33', 1.1]} />
      <directionalLight
        position={[-60, 75, 40]}
        intensity={2.4}
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
