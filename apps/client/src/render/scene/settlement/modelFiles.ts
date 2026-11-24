import type { BuildingDefinition } from '@roe/game-data';

/** Every model file a building is drawn with (variants, or the parts of an assembled one). */
export function modelFilesOf(definition: BuildingDefinition): string[] {
  if (definition.parts) return [...new Set(definition.parts.map((p) => p.modelPath))];
  return [...(definition.modelVariants ?? [definition.modelPath])];
}
