import { useGLTF } from '@react-three/drei';
import { BUILDINGS, PROPS, tileOffsets, type BuildingDefinition } from '@roe/game-data';
import type { PlacedBuilding } from '@roe/sim';
import { useMemo } from 'react';
import type { PlacedProp } from '../../../world/decorateWorld';
import { ModelInstances, type ModelInstance } from './ModelInstances';
import { publicUrl } from './modelAssets';

// Start downloading every settlement model as soon as this module loads.
for (const { modelPath } of [...Object.values(BUILDINGS), ...Object.values(PROPS)]) {
  useGLTF.preload(publicUrl(modelPath), false);
}

/** Crop meshes left out of the static models (`FieldCrops` draws them), by model file. */
const SKIPPED_MESHES = new Map(
  (Object.values(BUILDINGS) as BuildingDefinition[]).flatMap((d) =>
    d.cropMesh ? [[d.modelPath, [d.cropMesh]] as const] : [],
  ),
);

interface SettlementProps {
  buildings: readonly PlacedBuilding[];
  props: readonly PlacedProp[];
}

/**
 * One model instance per building, or one per tile for tiled buildings (fields).
 * Tile offsets are rotated with the building.
 */
function buildingInstances(b: PlacedBuilding): ModelInstance[] {
  const { definition } = b;
  const rotation = b.rotation + definition.rotationOffset;
  const cos = Math.cos(b.rotation);
  const sin = Math.sin(b.rotation);
  return tileOffsets(definition).map((t) => ({
    x: b.x + t.x * cos + t.z * sin,
    y: b.y,
    z: b.z - t.x * sin + t.z * cos,
    rotation,
    scale: definition.scale,
  }));
}

/** Groups instances by model file, so each model is drawn instanced once. */
function groupByModel(items: readonly { modelPath: string; instance: ModelInstance }[]) {
  const groups = new Map<string, ModelInstance[]>();
  for (const { modelPath, instance } of items) {
    const group = groups.get(modelPath);
    if (group) group.push(instance);
    else groups.set(modelPath, [instance]);
  }
  return [...groups];
}

/** Renders settlement buildings and their small props. */
export function Settlement({ buildings, props }: SettlementProps) {
  const groups = useMemo(
    () =>
      groupByModel([
        ...buildings.flatMap((b) =>
          buildingInstances(b).map((instance) => ({ modelPath: b.definition.modelPath, instance })),
        ),
        ...props.map((p) => ({ modelPath: p.definition.modelPath, instance: p })),
      ]),
    [buildings, props],
  );

  return (
    <>
      {groups.map(([modelPath, instances]) => (
        <ModelInstances
          key={modelPath}
          modelPath={modelPath}
          instances={instances}
          skipMeshes={SKIPPED_MESHES.get(modelPath)}
        />
      ))}
    </>
  );
}
