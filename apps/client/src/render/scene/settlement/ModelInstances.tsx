import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { StaticInstances } from '../StaticInstances';
import { applyMaterialOverrides, extractModelParts, publicUrl } from './modelAssets';

/** One placement of a model: position, Y rotation (radians) and uniform scale. */
export interface ModelInstance {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}

interface ModelInstancesProps {
  /** Model file, relative to the public root. */
  modelPath: string;
  instances: readonly ModelInstance[];
  /** Meshes of the model drawn elsewhere (a field's crop). Must be a stable array. */
  skipMeshes?: readonly string[];
}

const placementMatrix = new Matrix4();
const partMatrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();

/**
 * Draws every instance of one GLB model. Each mesh part of the model becomes one
 * instanced mesh, so N copies cost as many draw calls as a single copy.
 */
export function ModelInstances({ modelPath, instances, skipMeshes }: ModelInstancesProps) {
  const { scene } = useGLTF(publicUrl(modelPath), false);

  const parts = useMemo(() => {
    applyMaterialOverrides(scene);
    return extractModelParts(scene, skipMeshes);
  }, [scene, skipMeshes]);

  const matricesPerPart = useMemo(
    () =>
      parts.map((part) => {
        const out = new Float32Array(instances.length * 16);
        instances.forEach((instance, i) => {
          position.set(instance.x, instance.y, instance.z);
          quaternion.setFromEuler(euler.set(0, instance.rotation, 0));
          scale.setScalar(instance.scale);
          placementMatrix.compose(position, quaternion, scale);
          partMatrix.multiplyMatrices(placementMatrix, part.matrix).toArray(out, i * 16);
        });
        return out;
      }),
    [parts, instances],
  );

  return (
    <>
      {parts.map((part, i) => (
        <StaticInstances
          key={i}
          geometry={part.geometry}
          material={part.material}
          matrices={matricesPerPart[i] as Float32Array}
        />
      ))}
    </>
  );
}
