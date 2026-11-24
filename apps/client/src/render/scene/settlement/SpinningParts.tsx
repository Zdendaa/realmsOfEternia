import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BUILDINGS, type BuildingDefinition, type BuildingId } from '@roe/game-data';
import type { BuildingInstance } from '@roe/sim';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Object3D,
} from 'three';
import { useGameStore } from '../../../state/gameStore';
import { busyBuildings } from './busyBuildings';
import { applyMaterialOverrides, publicUrl } from './modelAssets';
import { isTeamColorable, teamColorMaterial, writeTeamColor } from './teamColorMaterial';

/** A complete building with a spinning part, and its ground height. */
export interface AnimatedBuilding {
  building: BuildingInstance;
  y: number;
}

/** How quickly the part speeds up to working speed or slows to a halt (per second). */
const SPIN_EASE = 0.8;

interface SpinPart {
  geometry: BufferGeometry;
  material: Material;
  /** Uses the Hexagon atlas: takes the owner's color in the team cell. */
  teamColored: boolean;
  /** The mesh relative to the spinning node. */
  local: Matrix4;
}

/** The spinning node of a model: its transform in the model and its meshes. */
function useSpinningNode(modelPath: string, nodeName: string) {
  const { scene } = useGLTF(publicUrl(modelPath), false);
  return useMemo(() => {
    applyMaterialOverrides(scene);
    scene.updateMatrixWorld(true);
    let node: Object3D | undefined;
    scene.traverse((o) => {
      if (!node && o.name === nodeName) node = o;
    });
    if (!node) throw new Error(`Spinning part "${nodeName}" not found in ${modelPath}`);
    const hub = node.matrixWorld.clone();
    const toHub = hub.clone().invert();
    const parts: SpinPart[] = [];
    node.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const material = Array.isArray(o.material) ? o.material[0] : o.material;
      if (material) {
        parts.push({
          geometry: o.geometry,
          material: teamColorMaterial(material),
          teamColored: isTeamColorable(material),
          local: toHub.clone().multiply(o.matrixWorld),
        });
      }
    });
    return { hub, parts };
  }, [scene, modelPath, nodeName]);
}

const placement = new Matrix4();
const spin = new Matrix4();
const out = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();
/** Flags the instance matrices of the given meshes for upload. */
function markUpdated(meshes: readonly (InstancedMesh | null)[]) {
  for (const mesh of meshes) if (mesh) mesh.instanceMatrix.needsUpdate = true;
}

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

function SpinLayer({
  type,
  buildings,
}: {
  type: BuildingId;
  buildings: readonly AnimatedBuilding[];
}) {
  const definition = BUILDINGS[type] as BuildingDefinition;
  const part = definition.spinningPart;
  if (!part) throw new Error(`${type} has no spinning part`);
  const { hub, parts } = useSpinningNode(definition.modelPath, part.mesh);
  const refs = useRef<(InstancedMesh | null)[]>([]);
  // Per building: current angle and angular speed (radians, radians per second).
  const motion = useRef({ angle: new Float64Array(0), speed: new Float64Array(0) });

  useLayoutEffect(() => {
    motion.current = {
      angle: new Float64Array(buildings.length).map(
        (_, i) => (buildings[i]?.building.id ?? 0) * 0.7,
      ),
      speed: new Float64Array(buildings.length),
    };
    const colors = new Float32Array(buildings.length * 3);
    buildings.forEach(({ building }, i) => writeTeamColor(colors, i, building.ownerId));
    refs.current.forEach((mesh, k) => {
      if (!mesh) return;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      if (parts[k]?.teamColored) mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
    });
  }, [buildings, parts]);

  useFrame((_, delta) => {
    const busy = busyBuildings(useGameStore.getState().state.units);
    const { angle, speed } = motion.current;
    const full = part.turnsPerSecond * Math.PI * 2;
    const ease = Math.min(1, delta * SPIN_EASE);
    buildings.forEach(({ building, y }, i) => {
      const target = busy.has(building.id) ? full : 0;
      const s = (speed[i] ?? 0) + (target - (speed[i] ?? 0)) * ease;
      speed[i] = s;
      angle[i] = ((angle[i] ?? 0) + s * delta) % (Math.PI * 2);

      position.set(building.x, y, building.z);
      quaternion.setFromEuler(euler.set(0, building.rotation + definition.rotationOffset, 0));
      placement.compose(position, quaternion, scale.setScalar(definition.scale));
      spin.makeRotationAxis(AXES[part.axis], angle[i] ?? 0);
      parts.forEach((p, k) => {
        out.multiplyMatrices(placement, hub).multiply(spin).multiply(p.local);
        refs.current[k]?.setMatrixAt(i, out);
      });
    });
    markUpdated(refs.current);
  });

  return (
    <>
      {parts.map((p, k) => (
        <instancedMesh
          key={`${k}-${buildings.length}`}
          ref={(mesh) => {
            refs.current[k] = mesh;
          }}
          args={[p.geometry, p.material, buildings.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  );
}

/**
 * Parts that turn while the building's worker works (mill sails), one instanced mesh per
 * part and building type. They speed up and slow down smoothly; the angle is cosmetic.
 */
export function SpinningParts({ buildings }: { buildings: readonly AnimatedBuilding[] }) {
  const byType = useMemo(() => {
    const groups = new Map<BuildingId, AnimatedBuilding[]>();
    for (const b of buildings) {
      if (!(BUILDINGS[b.building.type] as BuildingDefinition).spinningPart) continue;
      const group = groups.get(b.building.type);
      if (group) group.push(b);
      else groups.set(b.building.type, [b]);
    }
    return [...groups];
  }, [buildings]);
  return (
    <>
      {byType.map(([type, group]) => (
        <SpinLayer key={type} type={type} buildings={group} />
      ))}
    </>
  );
}
