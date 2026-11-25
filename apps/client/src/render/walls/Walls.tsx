import { useGLTF } from '@react-three/drei';
import { BUILDINGS, isGate, isWall, type BuildingDefinition, type WallModel } from '@roe/game-data';
import type { HeightField } from '@roe/shared';
import { footprintOf, type BuildingInstance, type GameState } from '@roe/sim';
import { Suspense, useEffect, useMemo } from 'react';
import { CylinderGeometry, Matrix4, MeshStandardMaterial } from 'three';
import { useGameStore } from '../../state/gameStore';
import { groupIntoChunks, packMatrices } from '../scene/instanceData';
import { ModelInstances, type ModelInstance } from '../scene/settlement/ModelInstances';
import { publicUrl } from '../scene/settlement/modelAssets';
import { StaticInstances } from '../scene/StaticInstances';
import { GateDoors, type DrawnGate } from './GateDoors';
import { wallPosts, type WallPost } from './wallLayout';

/** Walls are instanced in square chunks of this size, so off-screen ones are culled. */
const CHUNK = 24;
/** A construction site grows in this many steps (each step is one re-upload). */
const SITE_STEPS = 8;
/** How tall a segment is when its site has just been marked out (share of its height). */
const SITE_START = 0.12;

const wallModelOf = (type: BuildingInstance['type']) =>
  (BUILDINGS[type] as BuildingDefinition).wallModel as WallModel;

/** Door nodes of each gate model, drawn by `GateDoors` (stable arrays). */
const DOOR_NODES = new Map(
  (Object.values(BUILDINGS) as BuildingDefinition[]).flatMap((d) => {
    const doors = d.wallModel?.doors;
    return doors ? [[d.id, doors.map((door) => door.node)] as const] : [];
  }),
);

for (const definition of Object.values(BUILDINGS) as BuildingDefinition[]) {
  const post = definition.wallModel?.post;
  if (post?.kind === 'model') useGLTF.preload(publicUrl(post.modelPath), false);
}

/** Turns the model along local X and centers it (pack units), one matrix per wall type. */
const localMatrices = new Map<string, Matrix4>();
function localMatrix(type: BuildingInstance['type']): Matrix4 {
  let matrix = localMatrices.get(type);
  if (!matrix) {
    const { turn, center } = wallModelOf(type);
    matrix = new Matrix4()
      .makeRotationY(turn)
      .multiply(new Matrix4().makeTranslation(-center.x, 0, -center.z));
    localMatrices.set(type, matrix);
  }
  return matrix;
}

/** The instance of one segment, `rise` (0–1) of its full height. */
function segmentInstance(
  wall: Pick<BuildingInstance, 'type' | 'x' | 'z' | 'rotation' | 'ownerId'>,
  y: number,
  rise: number,
): ModelInstance {
  const model = wallModelOf(wall.type);
  const length = footprintOf(wall.type, wall.rotation).w;
  return {
    x: wall.x,
    y,
    z: wall.z,
    rotation: wall.rotation,
    scale: 1,
    stretch: {
      x: length / model.size.length,
      y: (model.height / model.size.height) * rise,
      z: model.depth / model.size.depth,
    },
    local: localMatrix(wall.type),
    owner: wall.ownerId,
  };
}

/**
 * The construction steps of the wall sites as one string ("12:3,13:0"), so the walls
 * re-render only when some segment grows a step, not every tick.
 */
function siteSteps(state: GameState): string {
  let out = '';
  for (const b of state.buildings) {
    if (b.status !== 'construction' || !isWall(b.type)) continue;
    const progress = state.construction[b.id];
    const step = progress
      ? Math.floor((progress.workDone / progress.workRequired) * SITE_STEPS)
      : SITE_STEPS;
    out += `${b.id}:${step},`;
  }
  return out;
}

const logMaterials = new Map<string, MeshStandardMaterial>();
function logMaterial(color: string) {
  let material = logMaterials.get(color);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    logMaterials.set(color, material);
  }
  return material;
}

type RaisedPost = WallPost & { y: number; rise: number };

/** Posts that are tapered logs (the palisade's stand-in), one instanced mesh per chunk. */
function LogPosts({ posts, type }: { posts: readonly RaisedPost[]; type: RaisedPost['type'] }) {
  const post = wallModelOf(type).post as Extract<WallModel['post'], { kind: 'log' }>;
  const geometry = useMemo(
    () =>
      new CylinderGeometry(post.radius * 0.7, post.radius, post.height, 7).translate(
        0,
        post.height / 2,
        0,
      ),
    [post],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const matrices = useMemo(
    () => packMatrices(posts, (p) => ({ position: [p.x, p.y, p.z], scale: [1, p.rise, 1] })),
    [posts],
  );
  return (
    <StaticInstances geometry={geometry} material={logMaterial(post.color)} matrices={matrices} />
  );
}

function ModelPosts({ posts, type }: { posts: readonly RaisedPost[]; type: RaisedPost['type'] }) {
  const post = wallModelOf(type).post as Extract<WallModel['post'], { kind: 'model' }>;
  const instances = useMemo(
    () =>
      posts.map((p): ModelInstance => ({
        x: p.x,
        y: p.y,
        z: p.z,
        rotation: 0,
        scale: post.scale,
        stretch: { x: 1, y: post.stretchY * p.rise, z: 1 },
        owner: p.ownerId,
      })),
    [posts, post],
  );
  return <ModelInstances modelPath={post.modelPath} instances={instances} />;
}

/** Items by wall type and chunk: one group per instanced draw. */
function byTypeAndChunk<T extends { x: number; z: number; type: BuildingInstance['type'] }>(
  items: readonly T[],
) {
  return groupIntoChunks(items, CHUNK).flatMap((chunk) => {
    const types = [...new Set(chunk.items.map((item) => item.type))];
    return types.map((type) => ({
      key: `${type}:${chunk.key}`,
      type,
      items: chunk.items.filter((item) => item.type === type),
    }));
  });
}

/**
 * The walls the player knows about: segments (instanced per model and chunk) and posts.
 * A segment under construction is the same model, grown as far as the work has come.
 */
export function Walls({
  walls,
  heights,
}: {
  walls: readonly BuildingInstance[];
  heights: HeightField;
}) {
  const steps = useGameStore((s) => siteSteps(s.state));
  const { segments, posts, gates } = useMemo(() => {
    const stepOf = new Map(
      steps
        .split(',')
        .filter(Boolean)
        .map((entry) => entry.split(':').map(Number) as [number, number]),
    );
    const riseOf = (wall: BuildingInstance) =>
      wall.status === 'complete'
        ? 1
        : SITE_START + (1 - SITE_START) * ((stepOf.get(wall.id) ?? 0) / SITE_STEPS);
    const rises = new Map(walls.map((wall) => [wall.id, riseOf(wall)]));
    const segments = walls.map((wall) => ({
      id: wall.id,
      ownerId: wall.ownerId,
      complete: wall.status === 'complete',
      x: wall.x,
      z: wall.z,
      type: wall.type,
      instance: segmentInstance(wall, heights.getHeightAt(wall.x, wall.z), rises.get(wall.id) ?? 1),
    }));
    const gateTypes = [...new Set(segments.map((s) => s.type).filter(isGate))];
    const posts = wallPosts(walls).map((post) => ({
      ...post,
      y: heights.getHeightAt(post.x, post.z),
      rise: Math.max(...post.segmentIds.map((id) => rises.get(id) ?? 1)),
    }));
    return {
      segments: byTypeAndChunk(segments).map((group) => ({
        ...group,
        instances: group.items.map((item) => item.instance),
      })),
      posts: byTypeAndChunk(posts),
      gates: gateTypes.map((type) => ({
        type,
        gates: segments.filter((s): s is typeof s & DrawnGate => s.type === type),
      })),
    };
  }, [walls, heights, steps]);

  return (
    <Suspense fallback={null}>
      {segments.map((group) => (
        <ModelInstances
          key={group.key}
          modelPath={BUILDINGS[group.type].modelPath}
          instances={group.instances}
          skipMeshes={DOOR_NODES.get(group.type)}
        />
      ))}
      {gates.map((group) => (
        // Remounted when the count changes: the door meshes are sized to it.
        <GateDoors key={`${group.type}:${group.gates.length}`} {...group} />
      ))}
      {posts.map((group) =>
        wallModelOf(group.type).post.kind === 'log' ? (
          <LogPosts key={group.key} type={group.type} posts={group.items} />
        ) : (
          <ModelPosts key={group.key} type={group.type} posts={group.items} />
        ),
      )}
    </Suspense>
  );
}
