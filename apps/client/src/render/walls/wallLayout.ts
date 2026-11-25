import { BUILDINGS, isWall, type BuildingDefinition, type BuildingId } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import type { BuildingInstance } from '@roe/sim';

/** Pure layout of what a set of wall segments looks like: where the posts stand. */

/** Direction of each of the 4 axes a segment runs along (axis = rotation / 45°). */
const AXES = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
] as const;

const axisOf = (rotation: number) => ((Math.round(rotation / (Math.PI / 4)) % 4) + 4) % 4;

/** The two grid points a segment runs between. */
export function segmentEnds(segment: Pick<BuildingInstance, 'x' | 'z' | 'rotation'>) {
  const [dx, dz] = AXES[axisOf(segment.rotation)] as readonly [number, number];
  // Half a segment along either axis it spans.
  return [
    { x: segment.x - dx, z: segment.z - dz },
    { x: segment.x + dx, z: segment.z + dz },
  ];
}

export interface WallPost {
  x: number;
  z: number;
  /** Decides the post's look: stone wins where tiers meet. */
  type: BuildingId;
  ownerId: PlayerId | null;
  /** A segment that meets here: the post rises with the most finished one. */
  segmentIds: number[];
}

const isStronger = (a: BuildingId, b: BuildingId) =>
  ((BUILDINGS[a] as BuildingDefinition).health ?? 0) >
  ((BUILDINGS[b] as BuildingDefinition).health ?? 0);

/**
 * Posts stand where a wall ends, turns, branches or changes its material; straight runs
 * have none.
 */
export function wallPosts(buildings: readonly BuildingInstance[]): WallPost[] {
  const nodes = new Map<string, { post: WallPost; axes: number[]; types: Set<BuildingId> }>();
  for (const wall of buildings) {
    if (!isWall(wall.type)) continue;
    for (const end of segmentEnds(wall)) {
      const key = `${end.x},${end.z}`;
      let node = nodes.get(key);
      if (!node) {
        const post = { ...end, type: wall.type, ownerId: wall.ownerId, segmentIds: [] };
        node = { post, axes: [], types: new Set() };
        nodes.set(key, node);
      }
      node.axes.push(axisOf(wall.rotation));
      node.types.add(wall.type);
      node.post.segmentIds.push(wall.id);
      if (isStronger(wall.type, node.post.type)) node.post.type = wall.type;
    }
  }
  return [...nodes.values()]
    .filter(({ axes, types }) => !(axes.length === 2 && axes[0] === axes[1] && types.size === 1))
    .map((node) => node.post);
}
