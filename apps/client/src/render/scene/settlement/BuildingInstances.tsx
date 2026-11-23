import { useGLTF } from '@react-three/drei';
import type { BuildingDefinition } from '@roe/game-data';
import { useMemo } from 'react';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { PlacedBuilding } from '../../../world/createWorld';
import { StaticInstances } from '../StaticInstances';
import { applyMaterialColorOverrides, extractModelParts, publicUrl } from './modelAssets';

interface BuildingInstancesProps {
  definition: BuildingDefinition;
  placements: readonly PlacedBuilding[];
}

const placementMatrix = new Matrix4();
const partMatrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();

/**
 * All placements of one building type: each model part (mesh) becomes one instanced
 * mesh, so N houses cost as many draw calls as one house.
 */
export function BuildingInstances({ definition, placements }: BuildingInstancesProps) {
  const { scene } = useGLTF(publicUrl(definition.modelPath), false);

  const parts = useMemo(() => {
    applyMaterialColorOverrides(scene);
    return extractModelParts(scene);
  }, [scene]);

  const matricesPerPart = useMemo(
    () =>
      parts.map((part) => {
        const out = new Float32Array(placements.length * 16);
        placements.forEach((p, i) => {
          position.set(p.x, p.y, p.z);
          quaternion.setFromEuler(euler.set(0, p.rotation + definition.rotationOffset, 0));
          scale.setScalar(definition.scale);
          placementMatrix.compose(position, quaternion, scale);
          partMatrix.multiplyMatrices(placementMatrix, part.matrix).toArray(out, i * 16);
        });
        return out;
      }),
    [parts, placements, definition],
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
