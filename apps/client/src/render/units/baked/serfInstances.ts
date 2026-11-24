import { CHARACTER_PACK, UNITS, type CharacterAnimation } from '@roe/game-data';
import type { UnitActivity } from '@roe/sim';
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import type { RenderedUnit } from '../renderedUnits';
import { ownerColor } from '../unitColors';
import type { BakedCharacter } from './bakeCharacter';
import { makeBakedSkinDepthMaterial, makeBakedSkinMaterial } from './bakedSkinMaterial';

const SERF = CHARACTER_PACK.serf;

/** Which clip shows which activity. */
const CLIP_FOR: Record<UnitActivity, CharacterAnimation> = {
  idle: 'idle',
  walking: 'walk',
  working: 'build',
};

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const up = new Vector3(0, 1, 0);
const scale = new Vector3(SERF.scale, SERF.scale, SERF.scale);

export interface SerfInstances {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  depthMaterial: Material;
  /** Writes every unit's transform, clip, phase, playback rate and color. */
  update(mesh: InstancedMesh, units: readonly RenderedUnit[], time: number): void;
  dispose(): void;
}

/**
 * GPU resources and per-frame instance writing for baked serfs. Per instance: the
 * transform, the clip for its activity, a phase offset so units don't move in sync, the
 * walk playback rate matched to the walking speed, and the owner's color.
 */
export function createSerfInstances(baked: BakedCharacter<CharacterAnimation>, capacity: number) {
  const uniforms = {
    uBones: { value: baked.boneTexture },
    uTime: { value: 0 },
    uFps: { value: CHARACTER_PACK.bakeFps },
  };
  const anim = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const team = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  anim.setUsage(DynamicDrawUsage);
  team.setUsage(DynamicDrawUsage);
  baked.geometry.setAttribute('aAnim', anim);
  baked.geometry.setAttribute('aTeam', team);

  // Feet don't slide: cycles per second = speed / stride per cycle (in world units), so
  // the playback rate is speed · duration / stride. Clamped only as a safety net.
  const walk = baked.clips.walk;
  const worldStride = walk.stride * SERF.scale;
  const walkRate =
    worldStride > 0
      ? Math.min(4, Math.max(0.25, (UNITS.serf.speed * walk.duration) / worldStride))
      : 1;

  const material = makeBakedSkinMaterial(baked.material, uniforms);
  const depthMaterial = makeBakedSkinDepthMaterial(uniforms);
  const animArray = anim.array as Float32Array;
  const teamArray = team.array as Float32Array;

  return {
    geometry: baked.geometry,
    material,
    depthMaterial,
    update(mesh, units, time) {
      uniforms.uTime.value = time;
      const count = Math.min(units.length, capacity);
      for (let i = 0; i < count; i++) {
        const unit = units[i] as RenderedUnit;
        position.set(unit.x, unit.y, unit.z);
        quaternion.setFromAxisAngle(up, unit.heading);
        mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
        const clip = baked.clips[unit.activity === 'working' ? unit.work : CLIP_FOR[unit.activity]];
        animArray[i * 4] = clip.start;
        animArray[i * 4 + 1] = clip.frames;
        animArray[i * 4 + 2] = (unit.id * 0.37) % clip.duration;
        animArray[i * 4 + 3] = unit.activity === 'walking' ? walkRate : 1;
        ownerColor(unit.ownerId).toArray(teamArray, i * 3);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
      team.needsUpdate = true;
    },
    dispose() {
      baked.geometry.dispose();
      baked.boneTexture.dispose();
      material.dispose();
      depthMaterial.dispose();
    },
  } satisfies SerfInstances;
}
