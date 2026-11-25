import { useGLTF } from '@react-three/drei';
import {
  BUILDINGS,
  modelPathOf,
  PROPS,
  tileOffsets,
  type BuildingDefinition,
} from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import type { PlacedBuilding } from '@roe/sim';
import { useMemo } from 'react';
import type { PlacedProp } from '../../../world/decorateWorld';
import { ModelInstances, type ModelInstance } from './ModelInstances';
import { publicUrl } from './modelAssets';
import { modelFilesOf } from './modelFiles';

// Start downloading every settlement model as soon as this module loads.
for (const definition of Object.values(BUILDINGS) as BuildingDefinition[]) {
  for (const path of modelFilesOf(definition)) {
    useGLTF.preload(publicUrl(path), false);
  }
}
for (const { modelPath } of Object.values(PROPS)) useGLTF.preload(publicUrl(modelPath), false);

/**
 * Model parts left out of the static models, by model file: crops (`FieldCrops` draws
 * them) and spinning parts (`SpinningParts`).
 */
const SKIPPED_MESHES = new Map(
  (Object.values(BUILDINGS) as BuildingDefinition[]).flatMap((d) => {
    const names = [d.cropMesh, d.spinningPart?.mesh].filter((n): n is string => n !== undefined);
    return names.length > 0 ? [[d.modelPath, names] as const] : [];
  }),
);

/** A complete building to draw, with its id (model variant) and owner (roof color). */
export type OwnedBuilding = PlacedBuilding & { id: number; ownerId: PlayerId | null };

interface SettlementProps {
  buildings: readonly OwnedBuilding[];
  props: readonly PlacedProp[];
}

/**
 * One model instance per building, or one per tile for tiled buildings (fields).
 * Tile offsets are rotated with the building.
 */
function buildingInstances(b: OwnedBuilding): DrawnModel[] {
  const { definition } = b;
  const rotation = b.rotation + definition.rotationOffset;
  const cos = Math.cos(b.rotation);
  const sin = Math.sin(b.rotation);
  const at = (x: number, z: number) => ({
    x: b.x + x * cos + z * sin,
    z: b.z - x * sin + z * cos,
  });
  // Assembled buildings (the storehouse): one instance per part, in the part's model.
  if (definition.parts) {
    return definition.parts.map((part) => ({
      modelPath: part.modelPath,
      instance: {
        ...at(part.x, part.z),
        y: b.y + (part.y ?? 0),
        rotation: rotation + (part.rotation ?? 0),
        scale: part.scale,
        owner: b.ownerId,
      },
    }));
  }
  const modelPath = modelPathOf(definition, b.id);
  return tileOffsets(definition).map((t) => ({
    modelPath,
    tint: definition.tint,
    instance: { ...at(t.x, t.z), y: b.y, rotation, scale: definition.scale, owner: b.ownerId },
  }));
}

interface DrawnModel {
  modelPath: string;
  instance: ModelInstance;
  tint?: string | undefined;
}

/** Groups instances by model file and tint, so each such pair is drawn instanced once. */
function groupByModel(items: readonly DrawnModel[]) {
  const groups = new Map<
    string,
    { modelPath: string; tint: string | undefined; instances: ModelInstance[] }
  >();
  for (const { modelPath, instance, tint } of items) {
    const key = `${modelPath}|${tint ?? ''}`;
    const group = groups.get(key);
    if (group) group.instances.push(instance);
    else groups.set(key, { modelPath, tint, instances: [instance] });
  }
  return [...groups];
}

/** Renders settlement buildings and their small props. */
export function Settlement({ buildings, props }: SettlementProps) {
  const groups = useMemo(
    () =>
      groupByModel([
        ...buildings.flatMap(buildingInstances),
        ...props.map((p) => ({ modelPath: p.definition.modelPath, instance: p })),
      ]),
    [buildings, props],
  );

  return (
    <>
      {groups.map(([key, group]) => (
        <ModelInstances
          key={key}
          modelPath={group.modelPath}
          instances={group.instances}
          tint={group.tint}
          skipMeshes={SKIPPED_MESHES.get(group.modelPath)}
        />
      ))}
    </>
  );
}
