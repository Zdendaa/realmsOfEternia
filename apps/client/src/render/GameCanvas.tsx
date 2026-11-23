import { Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { PROTOTYPE_MAP } from '@roe/game-data';
import { useSettingsStore } from '../state/settingsStore';
import { RtsCameraControls } from './camera/RtsCameraControls';
import { World } from './scene/World';

/** Root of the 3D viewport. Owns the renderer, camera and scene graph. */
export function GameCanvas() {
  const showStats = useSettingsStore((s) => s.showStats);

  return (
    <Canvas
      className="game-canvas"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [45, 50, 45], fov: 45, near: 0.5, far: 1000 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <World map={PROTOTYPE_MAP} />
      <RtsCameraControls bounds={PROTOTYPE_MAP.size / 2} />
      {showStats && <Stats />}
    </Canvas>
  );
}
