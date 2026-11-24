import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BUILDINGS,
  HEXAGON_PACK,
  modelPathOf,
  tileOffsets,
  type BuildingDefinition,
} from '@roe/game-data';
import type { BuildingInstance, GameState } from '@roe/sim';
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Material, Object3D } from 'three';
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
import { singleTeamMaterial } from '../scene/settlement/teamColorMaterial';
import { ownerColor } from '../units/unitColors';

/** A construction site to draw, with its ground height. */
export interface SiteView {
  building: BuildingInstance;
  y: number;
}

const BAR_WIDTH = 2.4;
const BAR_HEIGHT = 0.22;
/** The first sliver of the building shows right away, as a foundation. */
const FOUNDATION = 0.04;
/** Stages fill this share of the footprint (the scaffolding yard takes all of it). */
const STAGE_FILL = 0.9;
/** The flag at 6× (~1.7 units tall), this far in from the footprint corner. */
const FLAG_SCALE = 6;
const FLAG_INSET = 0.4;

const CONSTRUCTION = HEXAGON_PACK.construction;
/** Stages A–C, then the scaffolding, then the flag (the order `useStageParts` reads). */
const CONSTRUCTION_URLS = [...CONSTRUCTION.stages, CONSTRUCTION.scaffolding, CONSTRUCTION.flag].map(
  publicUrl,
);
useGLTF.preload(CONSTRUCTION_URLS, false);

// Shared by every site; never disposed (module lifetime).
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

/**
 * The pack's building stages, its scaffolding and a flag for one site, scaled to the
 * footprint: one uniform scale for all stages (so they don't jump in size) and one for
 * the scaffolding yard around them. Returns the parts to toggle and the height (world).
 */
function useStageParts(definition: BuildingDefinition, owner: BuildingInstance['ownerId']) {
  const loaded = useGLTF(CONSTRUCTION_URLS, false);
  const built = useMemo(() => {
    const { w, d } = definition.footprint;
    const stageScale =
      Math.min(w / CONSTRUCTION.stageSize.w, d / CONSTRUCTION.stageSize.d) * STAGE_FILL;
    const scaffoldScale = Math.min(
      w / CONSTRUCTION.scaffoldingSize.w,
      d / CONSTRUCTION.scaffoldingSize.d,
    );
    const place = (index: number, scale: number) => {
      const scene = loaded[index]?.scene;
      if (!scene) throw new Error(`Construction model ${index} missing`);
      const object = scene.clone(true);
      object.scale.setScalar(scale);
      object.traverse((o) => {
        if (o instanceof Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return object;
    };
    const stages = CONSTRUCTION.stages.map((_, i) => place(i, stageScale));
    const scaffolding = place(CONSTRUCTION.stages.length, scaffoldScale);

    // A flag in the owner's color at the front right corner.
    const flag = place(CONSTRUCTION.stages.length + 1, FLAG_SCALE);
    flag.position.set(w / 2 - FLAG_INSET, 0, d / 2 - FLAG_INSET);
    const materials: Material[] = [];
    const team = owner === null ? null : ownerColor(owner);
    flag.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const material = singleTeamMaterial(o.material as Material, team);
      materials.push(material);
      o.material = material;
    });

    const group = new Group();
    group.add(...stages, scaffolding, flag);
    const height = new Box3().setFromObject(group).getSize(new Vector3()).y;
    return { group, stages, scaffolding, height, materials };
  }, [loaded, definition, owner]);

  useEffect(() => () => built.materials.forEach((m) => m.dispose()), [built]);
  return built;
}

/** The pack's stage for a share of the work done: A, then B, then C (thirds). */
const stageIndex = (progress: number) =>
  Math.min(CONSTRUCTION.stages.length - 1, Math.floor(progress * CONSTRUCTION.stages.length));

/** Shows the stage for `progress`, and the scaffolding from the second stage on. */
function showStage(
  parts: { stages: readonly Object3D[]; scaffolding: Object3D },
  progress: number,
) {
  const index = stageIndex(progress);
  parts.stages.forEach((stage, i) => {
    stage.visible = i === index;
  });
  parts.scaffolding.visible = index >= 1;
}

/** Dirt, the site's look (children) and a camera-facing progress bar above it. */
function SiteFrame({
  building,
  y,
  barHeight,
  onProgress,
  children,
}: SiteView & {
  barHeight: number;
  onProgress: (progress: number) => void;
  children: ReactNode;
}) {
  const definition: BuildingDefinition = BUILDINGS[building.type];
  const dirt = useMemo(
    () =>
      new PlaneGeometry(definition.footprint.w + 0.6, definition.footprint.d + 0.6).rotateX(
        -Math.PI / 2,
      ),
    [definition],
  );
  const barRef = useRef<Group>(null);
  const fillRef = useRef<Mesh>(null);
  useEffect(() => () => dirt.dispose(), [dirt]);

  useFrame(({ camera }) => {
    const { state, previous } = useGameStore.getState();
    const progress = progressOf(state, previous, building.id, simClock.alpha);
    onProgress(progress);
    if (fillRef.current) fillRef.current.scale.x = Math.max(0.001, BAR_WIDTH * progress);
    barRef.current?.quaternion.copy(camera.quaternion);
  });

  return (
    <group position={[building.x, y, building.z]}>
      <group rotation={[0, building.rotation, 0]}>
        <mesh geometry={dirt} material={dirtMaterial} position={[0, 0.03, 0]} receiveShadow />
        {children}
      </group>
      <group ref={barRef} position={[0, barHeight + 1.2, 0]}>
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
 * A building site: the pack's stage for the progress (materials, frame, walls), the
 * scaffolding yard from the second stage on, and the owner's flag.
 */
function StageSite({ building, y }: SiteView) {
  const definition: BuildingDefinition = BUILDINGS[building.type];
  const parts = useStageParts(definition, building.ownerId);
  const { group, height } = parts;
  const show = (progress: number) => showStage(parts, progress);
  return (
    <SiteFrame building={building} y={y} barHeight={height} onProgress={show}>
      <primitive object={group} />
    </SiteFrame>
  );
}

/** A field site: the finished field rises from the ground as work progresses. */
function RevealSite({ building, y }: SiteView) {
  const definition: BuildingDefinition = BUILDINGS[building.type];
  const { group, height, revealTo } = useClippedModel(
    definition,
    modelPathOf(definition, building.id),
  );
  const reveal = (progress: number) =>
    revealTo(y + height * (FOUNDATION + (1 - FOUNDATION) * progress));
  return (
    <SiteFrame building={building} y={y} barHeight={height} onProgress={reveal}>
      <primitive object={group} />
    </SiteFrame>
  );
}

/**
 * Construction sites: dirt, the site's look and a progress bar. Buildings show the Hexagon
 * pack's building stages A–C (switching by thirds of the work) with its scaffolding and
 * a flag in the owner's color; fields rise from the ground. Progress is read every frame
 * from the store (no React re-render per tick); a finished site leaves this list and
 * joins the instanced buildings.
 */
export function ConstructionSites({ sites }: { sites: readonly SiteView[] }) {
  return (
    <>
      {sites.map((site) => (
        <Suspense key={site.building.id} fallback={null}>
          {(BUILDINGS[site.building.type] as BuildingDefinition).construction === 'reveal' ? (
            <RevealSite building={site.building} y={site.y} />
          ) : (
            <StageSite building={site.building} y={site.y} />
          )}
        </Suspense>
      ))}
    </>
  );
}
