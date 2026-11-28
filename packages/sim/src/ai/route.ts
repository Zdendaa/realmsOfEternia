import { AI_RULES } from '@roe/game-data';
import type { Vec2 } from '@roe/shared';
import { within } from './strength.js';

/**
 * The legs of a long march from \`from\` to \`to\`: through the corners of an inner square
 * (\`innerShare\` of the map's size from the middle), then to the target. It keeps scouts
 * and armies off the edges, where the deposits and their guards lie, and out of the
 * middle. Opposite corners are reached around a third one. Short ways go straight.
 */
export function marchLegs(from: Vec2, to: Vec2, mapSize: number): Vec2[] {
  const target = { x: to.x, z: to.z };
  if (within(from, to, AI_RULES.directMarch)) return [target];
  const half = Math.round(mapSize * AI_RULES.innerShare);
  const corner = (p: Vec2) => ({ x: p.x < 0 ? -half : half, z: p.z < 0 ? -half : half });
  const first = corner(from);
  const last = corner(to);
  const legs = [first];
  if (first.x !== last.x && first.z !== last.z) legs.push({ x: first.x, z: last.z });
  if (first.x !== last.x || first.z !== last.z) legs.push(last);
  return [...legs, target];
}
