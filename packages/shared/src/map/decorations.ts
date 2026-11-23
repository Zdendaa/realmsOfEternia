import { createRng, randomRange } from '../random.js';
import type { Decoration, MapDefinition } from './types.js';

/** Distance kept free along the map border. */
const BORDER_MARGIN = 4;

/**
 * Deterministically scatters decorations across a map.
 * Identical input always yields identical output, so the server and all clients agree.
 */
export function scatterDecorations(map: MapDefinition): Decoration[] {
  const rng = createRng(map.seed);
  const half = map.size / 2 - BORDER_MARGIN;
  const result: Decoration[] = [];

  for (const rule of map.decorations) {
    let placed = 0;
    let attempts = 0;
    const maxAttempts = rule.count * 20;

    while (placed < rule.count && attempts < maxAttempts) {
      attempts++;
      const x = randomRange(rng, -half, half);
      const z = randomRange(rng, -half, half);
      if (Math.hypot(x, z) < map.clearRadius) continue;

      result.push({
        kind: rule.kind,
        x,
        z,
        rotation: randomRange(rng, 0, Math.PI * 2),
        scale: randomRange(rng, rule.minScale, rule.maxScale),
      });
      placed++;
    }
  }

  return result;
}
