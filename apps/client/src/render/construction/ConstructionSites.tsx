import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BUILDINGS, modelPathOf, tileOffsets, type BuildingDefinition } from '@roe/game-data';
import type { BuildingInstance, GameState } from '@roe/sim';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { Material } from 'three';
import {
  Box3,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Plane,
  Vector3,
} from 'three';
import { useGameStore } from '../../state/gameStore';
import { lowerCrop } from '../scene/settlement/cropHeight';
import { applyMaterialOverrides, publicUrl } from '../scene/settlement/modelAssets';
import { simClock } from '../simulation/simClock';
import { createScaffoldGeometry } from './scaffold';

/** A construction site to draw, with its ground height. */
export interface SiteView {
  building: BuildingInstance;
  y: number;
}

const BAR_WIDTH = 2.4;
const BAR_HEIGHT = 0.22;
/** The first sliver of the building shows right away, as a foundation. */
const FOUNDATION = 0.04;
/** Scaffolds stop at this height: tall parts (mill sails, towers) rise above them. */
const MAX_SCAFFOLD_HEIGHT = 4.5;

// Shared by every site; never disposed (module lifetime).
const woodMaterial = new MeshStandardMaterial({ color: '#8b6a43', roughness: 0.9 });
const dirtMaterial = new MeshStandardMaterial({
  color: '#8a6d4a',
  roughness: 1,
  polygonOffset: true,
  polygonOffsetFactor: -2,
});
const barBackMaterial = new MeshBasicMaterial({
  color: '#1c201c',
  transparent: true,
  opacity: 0.75,
});
const barFillMaterial = new MeshBasicMaterial({ color: '#e0c45c' });
const barGeometry = new PlaneGeometry(1, 1).translate(0.5, 0, 0);

/** Fraction of a site's work done, interpolated between the previous and current tick. */
function progressOf(state: GameState, previous: GameState, id: number, alpha: number): number {
  const now = state.construction[id];
  if (!now) return 1;
  const before = previous.construction[id] ?? { workDone: 0, workRequired: now.workRequired };
  const done = before.workDone + (now.workDone - before.workDone) * alpha;
  return Math.min(1, done / now.workRequired);
}

/**
 * The building model of a site, its materials cloned with one clipping plane, so it can
 * be revealed from the ground up. Returns the model group, its height and `revealTo`,
 * which clips everything above a world-space height.
 */
function useClippedModel(definition: BuildingDefinition, modelPath: string) {
  const { scene } = useGLTF(publicUrl(modelPath), false);
  const built = useMemo(() => {
    applyMaterialOverrides(scene);
    const plane = new Plane(new Vector3(0, -1, 0), 0);
    const materials: Material[] = [];
    const group = new Group();
    for (const offset of tileOffsets(definition)) {
      const tile = scene.clone(true);
      tile.position.set(offset.x, 0, offset.z);
      tile.rotation.y = definition.rotationOffset;
      tile.scale.setScalar(definition.scale);
      lowerCrop(tile, definition);
      tile.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const material = (object.material as Material).clone();
        material.clippingPlanes = [plane];
        material.clipShadows = true;
        // The cut shows the inside of the walls instead of holes.
        material.side = DoubleSide;
        materials.push(material);
        object.material = material;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      group.add(tile);
    }
    // Measured on the assembled tiles (world units), so a lowered crop counts as it is drawn.
    const height = new Box3().setFromObject(group).getSize(new Vector3()).y;
    const revealTo = (worldY: number) => {
      plane.constant = worldY;
    };
    return { group, height, revealTo, materials };
  }, [scene, definition]);

  useEffect(() => () => built.materials.forEach((m) => m.dispose()), [built]);
  return built;
}

function ConstructionSite({ building, y }: SiteView) {
  const definition: BuildingDefinition = BUILDINGS[building.type];
  const { group, height, revealTo } = useClippedModel(
    definition,
    modelPathOf(definition, building.id),
  );
  const scaffoldHeight = Math.min(Math.max(height * 1.02, 1), MAX_SCAFFOLD_HEIGHT);
  const scaffold = useMemo(
    () => createScaffoldGeometry(definition.footprint, scaffoldHeight),
    [definition, scaffoldHeight],
  );
  const dirt = useMemo(
    () =>
      new PlaneGeometry(definition.footprint.w + 0.6, definition.footprint.d + 0.6).rotateX(
        -Math.PI / 2,
      ),
    [definition],
  );
  const barRef = useRef<Group>(null);
  const fillRef = useRef<Mesh>(null);

  useEffect(
    () => () => {
      scaffold.dispose();
      dirt.dispose();
    },
    [scaffold, dirt],
  );

  useFrame(({ camera }) => {
    const { state, previous } = useGameStore.getState();
    const progress = progressOf(state, previous, building.id, simClock.alpha);
    revealTo(y + height * (FOUNDATION + (1 - FOUNDATION) * progress));
    if (fillRef.current) fillRef.current.scale.x = Math.max(0.001, BAR_WIDTH * progress);
    barRef.current?.quaternion.copy(camera.quaternion);
  });

  return (
    <group position={[building.x, y, building.z]}>
      <group rotation={[0, building.rotation, 0]}>
        <mesh geometry={dirt} material={dirtMaterial} position={[0, 0.03, 0]} receiveShadow />
        <primitive object={group} />
        <mesh geometry={scaffold} material={woodMaterial} castShadow receiveShadow />
      </group>
      <group ref={barRef} position={[0, scaffoldHeight + 1.2, 0]}>
        <mesh
          geometry={barGeometry}
          material={barBackMaterial}
          position={[-BAR_WIDTH / 2 - 0.05, 0, -0.01]}
          scale={[BAR_WIDTH + 0.1, BAR_HEIGHT + 0.1, 1]}
        />
        <mesh
          ref={fillRef}
          geometry={barGeometry}
          material={barFillMaterial}
          position={[-BAR_WIDTH / 2, 0, 0]}
          scale={[0.001, BAR_HEIGHT, 1]}
        />
      </group>
    </group>
  );
}

/**
 * Construction sites: dirt, scaffold, the real model revealed from the ground up as work
 * progresses, and a progress bar. Progress is read every frame from the store (no React
 * re-render per tick); a finished site leaves this list and joins the instanced buildings.
 */
export function ConstructionSites({ sites }: { sites: readonly SiteView[] }) {
  return (
    <>
      {sites.map((site) => (
        <Suspense key={site.building.id} fallback={null}>
          <ConstructionSite building={site.building} y={site.y} />
        </Suspense>
      ))}
    </>
  );
}
