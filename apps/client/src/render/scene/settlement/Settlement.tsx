import { useGLTF } from '@react-three/drei';
import { BUILDINGS, PROPS } from '@roe/game-data';
import { useMemo } from 'react';
import type { PlacedBuilding, PlacedProp } from '../../../world/createWorld';
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
        ...buildings.map((b) => ({
          modelPath: b.definition.modelPath,
          instance: {
            x: b.x,
            y: b.y,
            z: b.z,
            rotation: b.rotation + b.definition.rotationOffset,
            scale: b.definition.scale,
          },
        })),
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
