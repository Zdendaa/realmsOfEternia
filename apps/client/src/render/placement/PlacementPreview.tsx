import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BUILDINGS,
  modelPathOf,
  tileOffsets,
  type BuildingDefinition,
  type BuildingId,
} from '@roe/game-data';
import {
  PLACEMENT_RULES,
  quarterTurnsToRadians,
  validateCommand,
  type PlaceBuildingCommand,
} from '@roe/sim';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { usePlacementInput } from '../../input/usePlacementInput';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { usePlacementStore } from '../../state/placementStore';
import { lowerCrop } from '../scene/settlement/cropHeight';
import { publicUrl } from '../scene/settlement/modelAssets';
import { pickGround } from './groundPick';

const VALID = '#7fe07a';
const INVALID = '#ff6b5a';
const hit = new Vector3();

function createGhostMaterials() {
  const ghost = (color: string) =>
    new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
  const plate = (color: string) =>
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: DoubleSide,
    });
  return {
    valid: { model: ghost(VALID), plate: plate(VALID) },
    invalid: { model: ghost(INVALID), plate: plate(INVALID) },
  };
}

/** The tiles of one model variant, all drawn with the ghost material. */
function addGhostTiles(
  variant: Group,
  scene: Object3D,
  definition: BuildingDefinition,
  material: MeshStandardMaterial,
) {
  for (const offset of tileOffsets(definition)) {
    const tile = scene.clone(true);
    tile.position.set(offset.x, 0, offset.z);
    tile.rotation.y = definition.rotationOffset;
    tile.scale.setScalar(definition.scale);
    lowerCrop(tile, definition);
    tile.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = material;
        object.castShadow = false;
        object.userData.ghostPart = 'model';
      }
    });
    variant.add(tile);
  }
}

/** Shows only the variant group of the given model. */
function showVariant(root: Object3D, modelPath: string) {
  root.traverse((object) => {
    if (typeof object.userData.modelPath === 'string') {
      object.visible = object.userData.modelPath === modelPath;
    }
  });
}

interface GhostProps {
  building: BuildingId;
  quarterTurns: number;
}

/**
 * Translucent preview of the building under the mouse, snapped to the grid and colored
 * by the same `validateCommand` the server runs (placement rules and the cost).
 * Validation re-runs only when the snapped cell, rotation, buildings or the player's
 * stock or the felled trees change, not every frame.
 */
function Ghost({ building, quarterTurns }: GhostProps) {
  const definition: BuildingDefinition = BUILDINGS[building];
  // Every model variant; the one the next building would get is shown (`modelPathOf`).
  const paths = definition.modelVariants ?? [definition.modelPath];
  const loaded = useGLTF(paths.map(publicUrl), false);
  const materials = useMemo(() => createGhostMaterials(), []);
  const groupRef = useRef<Group>(null);
  const lastKey = useRef('');
  const lastStock = useRef<unknown>(null);
  const lastNodes = useRef<unknown>(null);

  const model = useMemo(() => {
    const group = new Group();
    paths.forEach((path, i) => {
      const scene = loaded[i]?.scene;
      if (!scene) return;
      const variant = new Group();
      variant.userData.modelPath = path;
      group.add(variant);
      addGhostTiles(variant, scene, definition, materials.valid.model);
    });
    const plate = new Mesh(
      new PlaneGeometry(definition.footprint.w, definition.footprint.d),
      materials.valid.plate,
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0.08;
    plate.userData.ghostPart = 'plate';
    group.add(plate);
    return group;
    // `loaded` is a new array every render; the files behind it never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition, materials, loaded.length]);

  useEffect(
    () => () => {
      Object.values(materials).forEach((set) => {
        set.model.dispose();
        set.plate.dispose();
      });
    },
    [materials],
  );

  useFrame(({ camera, pointer, raycaster }) => {
    const group = groupRef.current;
    if (!group) return;
    const { ctx, state, heights } = useGameStore.getState();
    raycaster.setFromCamera(pointer, camera);
    if (!pickGround(raycaster.ray, heights, hit)) {
      group.visible = false;
      return;
    }

    const grid = PLACEMENT_RULES.gridSize;
    const x = Math.round(hit.x / grid) * grid;
    const z = Math.round(hit.z / grid) * grid;
    group.visible = true;
    group.position.set(x, heights.getHeightAt(x, z), z);
    showVariant(group, modelPathOf(definition, state.nextEntityId));
    group.rotation.y = quarterTurnsToRadians(quarterTurns);

    const key = `${building}:${x}:${z}:${quarterTurns}:${state.buildings.length}`;
    const stock = state.stocks[LOCAL_PLAYER];
    const nodes = state.resourceNodes;
    if (key === lastKey.current && stock === lastStock.current && nodes === lastNodes.current) {
      return;
    }
    lastKey.current = key;
    lastStock.current = stock;
    lastNodes.current = nodes;

    const command: PlaceBuildingCommand = { type: 'placeBuilding', building, x, z, quarterTurns };
    const check = validateCommand(ctx, state, LOCAL_PLAYER, command);
    usePlacementStore.getState().setCandidate(command, check);
    const set = check.ok ? materials.valid : materials.invalid;
    group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.material = object.userData.ghostPart === 'plate' ? set.plate : set.model;
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={model} />
    </group>
  );
}

/** Placement tool: input handling plus the ghost of the selected building. */
export function PlacementPreview() {
  const selected = usePlacementStore((s) => s.selected);
  const quarterTurns = usePlacementStore((s) => s.quarterTurns);
  usePlacementInput();

  if (!selected) return null;
  return (
    <Suspense fallback={null}>
      <Ghost key={selected} building={selected} quarterTurns={quarterTurns} />
    </Suspense>
  );
}
