import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BUILDINGS, type BuildingDefinition, type BuildingId } from '@roe/game-data';
import type { EntityId, PlayerId } from '@roe/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import type { ModelInstance } from '../scene/settlement/ModelInstances';
import { instanceMatrix } from '../scene/settlement/instanceMatrix';
import { extractModelParts, publicUrl } from '../scene/settlement/modelAssets';
import { renderedUnitList } from '../units/renderedUnits';

/** The doors swing open while one of the owner's units is this close to the gate. */
const OPEN_DISTANCE = 3;
/** How fast the doors swing (share of the full angle per second). */
const SWING_SPEED = 3.5;

export interface DrawnGate {
  id: EntityId;
  ownerId: PlayerId | null;
  x: number;
  z: number;
  /** False while under construction: the doors stay shut. */
  complete: boolean;
  instance: ModelInstance;
}

const placement = new Matrix4();
const hinge = new Matrix4();
const swing = new Matrix4();
const back = new Matrix4();
const result = new Matrix4();
const pivot = new Vector3();

const wantsOpen = (gate: DrawnGate) =>
  gate.complete &&
  renderedUnitList.some(
    (u) =>
      u.ownerId === gate.ownerId &&
      u.deathElapsed === null &&
      (u.x - gate.x) ** 2 + (u.z - gate.z) ** 2 < OPEN_DISTANCE ** 2,
  );

/** One instanced mesh per door part of a gate model, rewritten only while a door moves. */
function createDoors(
  parts: readonly { mesh: InstancedMesh; matrix: Matrix4; pivot: Vector3; openAngle: number }[],
) {
  return {
    meshes: parts.map((p) => p.mesh),
    update(gates: readonly DrawnGate[], open: ReadonlyMap<EntityId, number>) {
      for (const part of parts) {
        gates.forEach((gate, i) => {
          instanceMatrix(gate.instance, placement);
          // Around the door's hinge, in the model's own space.
          pivot.copy(part.pivot);
          hinge.makeTranslation(pivot.x, pivot.y, pivot.z);
          swing.makeRotationY(part.openAngle * (open.get(gate.id) ?? 0));
          back.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
          result.copy(placement).multiply(hinge).multiply(swing).multiply(back);
          part.mesh.setMatrixAt(i, result.multiply(part.matrix));
        });
        part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.computeBoundingSphere();
      }
    },
    dispose() {
      for (const part of parts) part.mesh.dispose();
    },
  };
}

/** The doors of every gate of one type (the rest of the model is drawn with the walls). */
export function GateDoors({ type, gates }: { type: BuildingId; gates: readonly DrawnGate[] }) {
  const definition = BUILDINGS[type] as BuildingDefinition;
  const { scene } = useGLTF(publicUrl(definition.modelPath), false);
  const doors = useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts = (definition.wallModel?.doors ?? []).flatMap((door) => {
      const node = scene.getObjectByName(door.node);
      if (!node) return [];
      const at = new Vector3().setFromMatrixPosition(node.matrixWorld);
      return extractModelParts(node).map((part) => {
        const mesh = new InstancedMesh(part.geometry, part.material, gates.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // `extractModelParts` updates world matrices from `node`, keeping the model's.
        return { mesh, matrix: part.matrix, pivot: at, openAngle: door.openAngle };
      });
    });
    return createDoors(parts);
  }, [scene, definition, gates.length]);

  const open = useRef(new Map<EntityId, number>());
  const drawn = useRef<unknown>(null);

  useLayoutEffect(() => {
    drawn.current = null;
    return () => doors.dispose();
  }, [doors]);

  useFrame((_, delta) => {
    let moved = drawn.current !== gates;
    for (const gate of gates) {
      const now = open.current.get(gate.id) ?? 0;
      const target = wantsOpen(gate) ? 1 : 0;
      if (now === target) continue;
      const step = SWING_SPEED * delta;
      open.current.set(gate.id, target > now ? Math.min(1, now + step) : Math.max(0, now - step));
      moved = true;
    }
    if (!moved) return;
    drawn.current = gates;
    doors.update(gates, open.current);
  });

  return (
    <>
      {doors.meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
