import { useGLTF } from '@react-three/drei';
import { BUILDINGS, PROPS } from '@roe/game-data';
import { useMemo } from 'react';
import type { PlacedBuilding } from '@roe/sim';
import type { PlacedProp } from '../../../world/decorateWorld';
import { ModelInstances, type ModelInstance } from './ModelInstances';
import { publicUrl } from './modelAssets';

// Start downloading every settlement model as soon as this module loads.
for (const { modelPath } of [...Object.values(BUILDINGS), ...Object.values(PROPS)]) {
  useGLTF.preload(publicUrl(modelPath), false);
}

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
  const tiling = definition.modelTiling;
  if (!tiling) return [{ x: b.x, y: b.y, z: b.z, rotation, scale: definition.scale }];

  const cos = Math.cos(b.rotation);
  const sin = Math.sin(b.rotation);
  const tiles: ModelInstance[] = [];
  for (let c = 0; c < tiling.cols; c++) {
    for (let r = 0; r < tiling.rows; r++) {
      const lx = (c - (tiling.cols - 1) / 2) * tiling.stepX;
      const lz = (r - (tiling.rows - 1) / 2) * tiling.stepZ;
      tiles.push({
        x: b.x + lx * cos + lz * sin,
        y: b.y,
        z: b.z - lx * sin + lz * cos,
        rotation,
        scale: definition.scale,
      });
    }
  }
  return tiles;
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
        <ModelInstances key={modelPath} modelPath={modelPath} instances={instances} />
      ))}
    </>
  );
}
