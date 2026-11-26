import { Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { PROTOTYPE_SETTLEMENT } from '@roe/game-data';
import { Suspense, useMemo } from 'react';
import { ACESFilmicToneMapping } from 'three';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { decorateWorld } from '../world/decorateWorld';
import { RtsCameraControls } from './camera/RtsCameraControls';
import { HealthBars } from './combat/HealthBars';
import { FogPass } from './fog/FogPass';
import { Projectiles } from './combat/Projectiles';
import { RockShots } from './combat/RockShots';
import { CommandMarkers } from './commands/CommandMarkers';
import { PlacementPreview } from './placement/PlacementPreview';
import { ATMOSPHERE } from './scene/atmosphere';
import { World } from './scene/World';
import { SelectionMarkers } from './selection/SelectionMarkers';
import { SelectionRings } from './selection/SelectionRings';
import { SimulationDriver } from './simulation/SimulationDriver';
import { StatusEffects } from './towers/StatusEffects';
import { SiegeUnits } from './units/siege/SiegeUnits';
import { UnitFrameDriver } from './units/UnitFrameDriver';
import { Units } from './units/Units';

/** Default view: about 50° pitch, 55 units from the map center. */
const CAMERA_START: [number, number, number] = [25, 42, 25];

/** Root of the 3D viewport. Owns the renderer, camera and scene graph. */
export function GameCanvas() {
  const showStats = useSettingsStore((s) => s.showStats);
  const simWorld = useGameStore((s) => s.world);
  const heights = useGameStore((s) => s.heights);
  const buildings = useGameStore((s) => s.state.buildings);
  // Changes only when a unit of wood or stone is taken.
  const resourceNodes = useGameStore((s) => s.state.resourceNodes);
  const ruins = useGameStore((s) => s.state.ruins);
  const world = useMemo(() => decorateWorld(simWorld, PROTOTYPE_SETTLEMENT), [simWorld]);

  return (
    <Canvas
      className="game-canvas"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: CAMERA_START, fov: 45, near: 0.5, far: 1500 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = ATMOSPHERE.toneMappingExposure;
        // Construction sites reveal their model with per-material clipping planes.
        gl.localClippingEnabled = true;
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* The driver must come first: its frame callback advances the tick before others read it. */}
      <SimulationDriver />
      {/* Then the per-frame unit data that unit renderers, rings and picking read. */}
      <UnitFrameDriver />
      <World
        world={world}
        heights={heights}
        buildings={buildings}
        resourceNodes={resourceNodes}
        ruins={ruins}
      />
      <Units />
      <Suspense fallback={null}>
        <SiegeUnits />
      </Suspense>
      <Suspense fallback={null}>
        <Projectiles />
        <RockShots />
      </Suspense>
      <SelectionRings />
      <HealthBars />
      <StatusEffects />
      <SelectionMarkers />
      <CommandMarkers />
      <PlacementPreview />
      <RtsCameraControls bounds={world.map.size / 2} heights={heights} />
      <FogPass />
      {showStats && <Stats className="fps-stats" />}
    </Canvas>
  );
}
