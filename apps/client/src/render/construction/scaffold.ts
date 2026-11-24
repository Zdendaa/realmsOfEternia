import type { Footprint } from '@roe/shared';
import { BoxGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const POST = 0.16;
const BEAM = 0.11;
/** Posts stand this far inside the footprint edge. */
const INSET = 0.25;

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * Wooden scaffold around a construction site, in the site's local frame: corner posts,
 * a ring of beams at mid height and at the top, plus a middle post on long sides.
 */
export function createScaffoldGeometry(footprint: Footprint, height: number): BufferGeometry {
  const hw = footprint.w / 2 - INSET;
  const hd = footprint.d / 2 - INSET;
  const parts: BufferGeometry[] = [];
  const posts: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  if (footprint.w > 6) posts.push([0, -hd], [0, hd]);
  if (footprint.d > 6) posts.push([-hw, 0], [hw, 0]);
  for (const [x, z] of posts) parts.push(box(POST, height, POST, x, height / 2, z));
  for (const y of [height * 0.5, height]) {
    parts.push(box(hw * 2 + POST, BEAM, BEAM, 0, y, -hd));
    parts.push(box(hw * 2 + POST, BEAM, BEAM, 0, y, hd));
    parts.push(box(BEAM, BEAM, hd * 2 + POST, -hw, y, 0));
    parts.push(box(BEAM, BEAM, hd * 2 + POST, hw, y, 0));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('Could not build scaffold geometry');
  return merged;
}
