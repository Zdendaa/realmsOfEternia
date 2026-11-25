import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BUILDINGS,
  isWall,
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
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { usePlacementInput } from '../../input/usePlacementInput';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { usePlacementStore } from '../../state/placementStore';
import { lowerCrop } from '../scene/settlement/cropHeight';
import { applyMaterialOverrides, publicUrl } from '../scene/settlement/modelAssets';
import { modelFilesOf } from '../scene/settlement/modelFiles';
import { singleTeamMaterial, type TintUniform } from '../scene/settlement/teamColorMaterial';
import { ownerColor } from '../units/unitColors';
import { createRangeRing } from '../combat/rangeRing';
import { pickGround } from './groundPick';
import { WallTool } from './WallTool';

const VALID = '#7fe07a';
const INVALID = '#ff6b5a';
const hit = new Vector3();

/** How strongly the valid / invalid color is mixed over the ghost's own colors. */
const GHOST_TINT = 0.25;
const GHOST_OPACITY = 0.7;

/**
 * The ghost's materials: per model material a translucent clone with the roof in the
 * local player's color and the shared validity tint mixed in (created on demand, cached);
 * plates in plain valid / invalid colors. `tint.value` switches the model's color.
 */
function createGhostMaterials() {
  const tint: TintUniform = { value: new Color(VALID) };
  const team = ownerColor(LOCAL_PLAYER);
  const models = new Map<Material, Material>();
  const model = (base: Material) => {
    let material = models.get(base);
    if (!material) {
      material = singleTeamMaterial(base, team, {
        tint: { uniform: tint, amount: GHOST_TINT },
        opacity: GHOST_OPACITY,
      });
      models.set(base, material);
    }
    return material;
  };
  const plate = (color: string) =>
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: DoubleSide,
    });
  return {
    tint,
    model,
    plates: { valid: plate(VALID), invalid: plate(INVALID) },
    dispose() {
      for (const m of models.values()) m.dispose();
      this.plates.valid.dispose();
      this.plates.invalid.dispose();
    },
  };
}

type GhostMaterials = ReturnType<typeof createGhostMaterials>;

/** Swaps an object's materials for their ghost versions. */
function ghostify(root: Object3D, materials: GhostMaterials) {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.material = materials.model(object.material as Material);
      object.castShadow = false;
    }
  });
}

/** The tiles of one model variant, drawn with the ghost versions of their materials. */
function addGhostTiles(
  variant: Group,
  scene: Object3D,
  definition: BuildingDefinition,
  materials: GhostMaterials,
) {
  for (const offset of tileOffsets(definition)) {
    const tile = scene.clone(true);
    tile.position.set(offset.x, 0, offset.z);
    tile.rotation.y = definition.rotationOffset;
    tile.scale.setScalar(definition.scale);
    lowerCrop(tile, definition);
    ghostify(tile, materials);
    variant.add(tile);
  }
}

/** Valid / invalid: the model's tint and the plate's color. */
function showValidity(root: Object3D, materials: GhostMaterials, ok: boolean) {
  materials.tint.value.set(ok ? VALID : INVALID);
  const plate = ok ? materials.plates.valid : materials.plates.invalid;
  root.traverse((object) => {
    if (object instanceof Mesh && object.userData.ghostPart === 'plate') object.material = plate;
  });
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
  // Every model variant (the one the next building would get is shown, `modelPathOf`), or
  // every part model of an assembled building.
  const paths = modelFilesOf(definition);
  const loaded = useGLTF(paths.map(publicUrl), false);
  const materials = useMemo(() => createGhostMaterials(), []);
  const groupRef = useRef<Group>(null);
  const lastKey = useRef('');
  const lastStock = useRef<unknown>(null);
  const lastNodes = useRef<unknown>(null);
  // A tower's ghost shows its range.
  const range = definition.tower?.attack.range;
  const ring = useMemo(() => createRangeRing(), []);
  useEffect(() => () => ring.dispose(), [ring]);

  const model = useMemo(() => {
    const group = new Group();
    if (definition.parts) {
      const assembled = new Group();
      assembled.userData.modelPath = definition.modelPath;
      group.add(assembled);
      for (const part of definition.parts) {
        const scene = loaded[paths.indexOf(part.modelPath)]?.scene;
        if (!scene) continue;
        applyMaterialOverrides(scene);
        const object = scene.clone(true);
        object.position.set(part.x, part.y ?? 0, part.z);
        object.rotation.y = definition.rotationOffset + (part.rotation ?? 0);
        object.scale.setScalar(part.scale);
        ghostify(object, materials);
        assembled.add(object);
      }
    }
    if (!definition.parts)
      paths.forEach((path, i) => {
        const scene = loaded[i]?.scene;
        if (!scene) return;
        const variant = new Group();
        variant.userData.modelPath = path;
        group.add(variant);
        applyMaterialOverrides(scene);
        addGhostTiles(variant, scene, definition, materials);
      });
    const plate = new Mesh(
      new PlaneGeometry(definition.footprint.w, definition.footprint.d),
      materials.plates.valid,
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0.08;
    plate.userData.ghostPart = 'plate';
    group.add(plate);
    return group;
    // `loaded` is a new array every render; the files behind it never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition, materials, loaded.length]);

  useEffect(() => () => materials.dispose(), [materials]);

  useFrame(({ camera, pointer, raycaster }) => {
    const group = groupRef.current;
    if (!group) return;
    const { ctx, state, heights } = useGameStore.getState();
    raycaster.setFromCamera(pointer, camera);
    if (!pickGround(raycaster.ray, heights, hit)) {
      group.visible = false;
      ring.show(undefined, 0, 0, heights);
      return;
    }

    const grid = PLACEMENT_RULES.gridSize;
    const x = Math.round(hit.x / grid) * grid;
    const z = Math.round(hit.z / grid) * grid;
    group.visible = true;
    ring.show(range, x, z, heights);
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
    showValidity(group, materials, check.ok);
  });

  return (
    <>
      <group ref={groupRef} visible={false}>
        <primitive object={model} />
      </group>
      <primitive object={ring.mesh} />
    </>
  );
}

/** Placement tool: input handling plus the ghost of the selected building. */
export function PlacementPreview() {
  const selected = usePlacementStore((s) => s.selected);
  const quarterTurns = usePlacementStore((s) => s.quarterTurns);
  usePlacementInput();

  if (!selected) return null;
  // Walls are drawn as lines, with their own input and preview.
  if (isWall(selected)) return <WallTool key={selected} building={selected} />;
  return (
    <Suspense fallback={null}>
      <Ghost key={selected} building={selected} quarterTurns={quarterTurns} />
    </Suspense>
  );
}
