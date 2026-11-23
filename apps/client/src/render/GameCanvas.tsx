import { Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { PROTOTYPE_MAP } from '@roe/game-data';
import { createHeightField } from '@roe/shared';
import { useMemo } from 'react';
import { ACESFilmicToneMapping } from 'three';
import { useSettingsStore } from '../state/settingsStore';
import { RtsCameraControls } from './camera/RtsCameraControls';
import { ATMOSPHERE } from './scene/atmosphere';
import { World } from './scene/World';

/** Default view: about 50° pitch, 55 units from the map center. */
const CAMERA_START: [number, number, number] = [25, 42, 25];

/** Root of the 3D viewport. Owns the renderer, camera and scene graph. */
export function GameCanvas() {
  const showStats = useSettingsStore((s) => s.showStats);
  const heights = useMemo(() => createHeightField(PROTOTYPE_MAP), []);

  return (
    <Canvas
      className="game-canvas"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: CAMERA_START, fov: 45, near: 0.5, far: 1500 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = ATMOSPHERE.toneMappingExposure;
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <World map={PROTOTYPE_MAP} heights={heights} />
      <RtsCameraControls bounds={PROTOTYPE_MAP.size / 2} heights={heights} />
      {showStats && <Stats className="fps-stats" />}
    </Canvas>
  );
}
