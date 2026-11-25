import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { Matrix4 } from 'three';
import { StaticInstances } from '../StaticInstances';
import type { PlayerId } from '@roe/shared';
import { instanceMatrix } from './instanceMatrix';
import { tintedMaterial } from './tintedMaterial';
import { applyMaterialOverrides, extractModelParts, publicUrl } from './modelAssets';
import { isTeamColorable, teamColorMaterial, writeTeamColor } from './teamColorMaterial';

/** One placement of a model: position, Y rotation (radians) and uniform scale. */
export interface ModelInstance {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  /** Per-axis factors on top of `scale`, along the rotated axes (walls). */
  stretch?: { x: number; y: number; z: number };
  /** Applied to the model before placing it (turning and centering a wall model). */
  local?: Matrix4;
  /** Owner whose color the roof takes (Hexagon models); null or absent keeps it. */
  owner?: PlayerId | null;
}

interface ModelInstancesProps {
  /** Model file, relative to the public root. */
  modelPath: string;
  instances: readonly ModelInstance[];
  /** Meshes of the model drawn elsewhere (a field's crop). Must be a stable array. */
  skipMeshes?: readonly string[];
  /** Multiplied over the model's colors (the team color stays as it is). */
  tint?: string | undefined;
}

const placementMatrix = new Matrix4();
const partMatrix = new Matrix4();

/**
 * Draws every instance of one GLB model. Each mesh part of the model becomes one
 * instanced mesh, so N copies cost as many draw calls as a single copy. Parts with the
 * Hexagon atlas take their owner's color in the team cell (roofs, banners).
 */
export function ModelInstances({ modelPath, instances, skipMeshes, tint }: ModelInstancesProps) {
  const { scene } = useGLTF(publicUrl(modelPath), false);

  const parts = useMemo(() => {
    applyMaterialOverrides(scene);
    return extractModelParts(scene, skipMeshes).map((part) => ({
      ...part,
      teamColored: isTeamColorable(part.material),
      material: teamColorMaterial(tintedMaterial(part.material, tint)),
    }));
  }, [scene, skipMeshes, tint]);

  // Team colors per instance, for the parts that use them.
  const teamColors = useMemo(() => {
    if (!parts.some((p) => p.teamColored)) return undefined;
    const out = new Float32Array(instances.length * 3);
    instances.forEach((instance, i) => writeTeamColor(out, i, instance.owner ?? null));
    return out;
  }, [parts, instances]);

  const matricesPerPart = useMemo(
    () =>
      parts.map((part) => {
        const out = new Float32Array(instances.length * 16);
        instances.forEach((instance, i) => {
          instanceMatrix(instance, placementMatrix);
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
          colors={part.teamColored ? teamColors : undefined}
        />
      ))}
    </>
  );
}
