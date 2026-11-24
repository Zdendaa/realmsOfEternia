import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BUILDINGS,
  productionOf,
  tileOffsets,
  type BuildingDefinition,
  type BuildingId,
} from '@roe/game-data';
import { SIMULATION_TICK_RATE } from '@roe/shared';
import { fieldOf, type BuildingInstance, type FieldState } from '@roe/sim';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from 'three';
import { useGameStore } from '../../../state/gameStore';
import { RIPE_CROP_HEIGHT } from './cropHeight';
import { applyMaterialOverrides, publicUrl } from './modelAssets';

/** A complete field to draw the crop of, with its ground height. */
export interface CropField {
  building: BuildingInstance;
  y: number;
}

/**
 * Crop stages per plot: 0 bare soil, 1 stubble (harvested), then `GROWTH_LEVELS` levels
 * from fresh sprouts to the ripe crop. Discrete, so instances are rewritten only when a
 * plot moves on to the next stage (a few times per minute), never per frame.
 */
const GROWTH_LEVELS = 6;
const BARE = 0;
const STUBBLE = 1;
const SPROUT = 2;
const RIPE = SPROUT + GROWTH_LEVELS - 1;

/** Crop height (share of the full-grown model) and color per stage. */
/**
 * Heights as a share of the model's crop: ripe as everywhere else (`RIPE_CROP_HEIGHT`),
 * sprouts and stubble low but clear of the soil ridges.
 */
const SPROUT_HEIGHT = 0.22;
const STUBBLE_HEIGHT = 0.15;
const YOUNG = new Color('#6f9a3e');
const STUBBLE_COLOR = new Color('#b39654');

function heightOf(stage: number, level: number): number {
  if (stage === BARE) return 0;
  if (stage === STUBBLE) return STUBBLE_HEIGHT;
  return SPROUT_HEIGHT + (RIPE_CROP_HEIGHT - SPROUT_HEIGHT) * level;
}

function stageOf(field: FieldState, plot: number, tick: number, growTicks: number): number {
  switch (field.phase) {
    case 'sowing':
      return plot < field.plotsDone ? SPROUT : BARE;
    case 'harvesting':
      return plot < field.plotsDone ? STUBBLE : RIPE;
    case 'growing': {
      const grown = 1 - Math.max(0, field.ripeAt - tick) / growTicks;
      return SPROUT + Math.min(GROWTH_LEVELS - 1, Math.floor(grown * (GROWTH_LEVELS - 1)));
    }
  }
}

/** The crop mesh of a model: geometry, its transform in the model, and its material. */
function useCropMesh(modelPath: string, meshName: string) {
  const { scene } = useGLTF(publicUrl(modelPath), false);
  return useMemo(() => {
    applyMaterialOverrides(scene);
    scene.updateMatrixWorld(true);
    let found: { geometry: BufferGeometry; matrix: Matrix4; ripe: Color } | null = null;
    scene.traverse((object) => {
      if (found || !(object instanceof Mesh) || object.name !== meshName) return;
      const material = object.material as unknown;
      if (!(material instanceof MeshStandardMaterial)) return;
      found = {
        geometry: object.geometry,
        matrix: object.matrixWorld.clone(),
        ripe: material.color.clone(),
      };
    });
    if (!found) throw new Error(`Crop mesh "${meshName}" not found in ${modelPath}`);
    return found as { geometry: BufferGeometry; matrix: Matrix4; ripe: Color };
  }, [scene, modelPath, meshName]);
}

const placement = new Matrix4();
const grow = new Matrix4();
const out = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();
const color = new Color();

interface CropLayerProps {
  type: BuildingId;
  fields: readonly CropField[];
}

/**
 * The crop of every complete field of one type: one instance per plot, scaled and tinted
 * by its stage (bare → sprouts → green → golden → stubble). One draw call per field type.
 */
function CropLayer({ type, fields }: CropLayerProps) {
  const definition = BUILDINGS[type] as BuildingDefinition;
  const crop = useCropMesh(definition.modelPath, definition.cropMesh as string);
  const production = productionOf(type);
  const growTicks =
    (production?.kind === 'farm' ? production.growSeconds : 1) * SIMULATION_TICK_RATE;
  const offsets = useMemo(() => tileOffsets(definition), [definition]);
  const count = fields.length * offsets.length;
  const ref = useRef<InstancedMesh>(null);
  const stages = useRef(new Int8Array(0));

  const material = useMemo(() => {
    // White base: each instance's color is the crop color of its stage.
    const m = new MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    m.color.set('#ffffff');
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  // The crop's base: growth scales it up from here, so sprouts stand on the soil.
  const base = useMemo(() => {
    crop.geometry.computeBoundingBox();
    return crop.geometry.boundingBox?.min.y ?? 0;
  }, [crop]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    stages.current = new Int8Array(count).fill(-1); // forces a full write next frame
  }, [count, fields]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { state } = useGameStore.getState();
    let changed = false;
    fields.forEach(({ building, y }, f) => {
      const field = fieldOf(state.fields, building.id);
      for (let p = 0; p < offsets.length; p++) {
        const i = f * offsets.length + p;
        const stage = stageOf(field, p, state.tick, growTicks);
        if (stages.current[i] === stage) continue;
        stages.current[i] = stage;
        changed = true;

        const offset = offsets[p] as { x: number; z: number };
        const cos = Math.cos(building.rotation);
        const sin = Math.sin(building.rotation);
        position.set(
          building.x + offset.x * cos + offset.z * sin,
          y,
          building.z - offset.x * sin + offset.z * cos,
        );
        quaternion.setFromEuler(euler.set(0, building.rotation + definition.rotationOffset, 0));
        placement.compose(position, quaternion, scale.setScalar(definition.scale));

        const level = (stage - SPROUT) / (GROWTH_LEVELS - 1);
        const height = heightOf(stage, level);
        // Scale the crop vertically about its base (y = base in model units).
        if (height === 0) {
          // Bare soil: hide the instance entirely (a flattened crop would z-fight the soil).
          out.makeScale(0, 0, 0);
        } else {
          grow.makeScale(1, height, 1).setPosition(0, base * (1 - height), 0);
          out.multiplyMatrices(placement, crop.matrix).multiply(grow);
        }
        mesh.setMatrixAt(i, out);

        if (stage === STUBBLE) color.copy(STUBBLE_COLOR);
        else color.copy(YOUNG).lerp(crop.ripe, Math.max(0, level));
        mesh.setColorAt(i, color);
      }
    });
    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  if (count === 0) return null;
  return (
    <instancedMesh
      key={count}
      ref={ref}
      args={[crop.geometry, material, count]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

/** Crops of all complete fields, grouped by field type. */
export function FieldCrops({ fields }: { fields: readonly CropField[] }) {
  const byType = useMemo(() => {
    const groups = new Map<BuildingId, CropField[]>();
    for (const field of fields) {
      const group = groups.get(field.building.type);
      if (group) group.push(field);
      else groups.set(field.building.type, [field]);
    }
    return [...groups];
  }, [fields]);
  return (
    <>
      {byType.map(([type, group]) => (
        <CropLayer key={type} type={type} fields={group} />
      ))}
    </>
  );
}
