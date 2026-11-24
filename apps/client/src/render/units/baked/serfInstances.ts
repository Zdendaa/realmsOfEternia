import { CHARACTER_PACK, UNITS, type CharacterAnimation } from '@roe/game-data';
import type { UnitActivity } from '@roe/sim';
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { RenderedUnit } from '../renderedUnits';
import { ownerColor } from '../unitColors';
import type { BakedCharacter, BakedClip } from './bakeCharacter';
import {
  makeBakedSkinDepthMaterial,
  makeBakedSkinMaterial,
  type BakedSkinUniforms,
} from './bakedSkinMaterial';
import { BUNDLE_FOR, BUNDLE_KINDS, createBundleGeometry, type BundleKind } from './carryBundles';

const SERF = CHARACTER_PACK.serf;

/** Which clip shows which activity (working units pick theirs from `RenderedUnit.work`). */
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
  /** Carried goods: one instanced mesh per bundle shape, written by `update`. */
  bundles: readonly InstancedMesh[];
  /** Writes every unit's transform, clip, phase, playback rate and color, and their loads. */
  update(mesh: InstancedMesh, units: readonly RenderedUnit[], time: number): void;
  dispose(): void;
}

/**
 * Feet don't slide: cycles per second = speed / stride per cycle (in world units), so
 * the playback rate is speed · duration / stride. Clamped only as a safety net.
 */
function strideRate(clip: BakedClip) {
  const worldStride = clip.stride * SERF.scale;
  return worldStride > 0
    ? Math.min(4, Math.max(0.25, (UNITS.serf.speed * clip.duration) / worldStride))
    : 1;
}

/** Per-instance animation attributes (clip row, frames, phase, rate) and team colors. */
function animAttributes(capacity: number) {
  const anim = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const team = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  anim.setUsage(DynamicDrawUsage);
  team.setUsage(DynamicDrawUsage);
  return { anim, team, animArray: anim.array as Float32Array };
}

interface Bundle {
  kind: BundleKind;
  mesh: InstancedMesh;
  animArray: Float32Array;
  anim: InstancedBufferAttribute;
  count: number;
}

/** One instanced mesh per bundle shape, skinned like the serfs (see `carryBundles`). */
function createBundles(
  baked: BakedCharacter<CharacterAnimation>,
  uniforms: BakedSkinUniforms,
  depthMaterial: Material,
  capacity: number,
): Bundle[] {
  const attachment = baked.attachment;
  if (!attachment) return [];
  return BUNDLE_KINDS.map((kind) => {
    const geometry = createBundleGeometry(kind, attachment);
    const { anim, team, animArray } = animAttributes(capacity);
    geometry.setAttribute('aAnim', anim);
    geometry.setAttribute('aTeam', team); // unused: bundle colors have no team area
    const material = makeBakedSkinMaterial(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
      uniforms,
    );
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = depthMaterial;
    return { kind, mesh, animArray, anim, count: 0 };
  });
}

/**
 * GPU resources and per-frame instance writing for baked serfs. Per instance: the
 * transform, the clip for its activity, a phase offset so units don't move in sync, the
 * stride-matched playback rate while walking, and the owner's color. Units carrying
 * goods walk with the `carry` clip (stand with `hold`), and their bundle is written to
 * the matching bundle mesh with the same transform and animation.
 */
export function createSerfInstances(
  baked: BakedCharacter<CharacterAnimation>,
  capacity: number,
): SerfInstances {
  const uniforms: BakedSkinUniforms = {
    uBones: { value: baked.boneTexture },
    uTime: { value: 0 },
    uFps: { value: CHARACTER_PACK.bakeFps },
  };
  const { anim, team, animArray } = animAttributes(capacity);
  baked.geometry.setAttribute('aAnim', anim);
  baked.geometry.setAttribute('aTeam', team);
  const teamArray = team.array as Float32Array;

  const walkRate = strideRate(baked.clips.walk);
  const carryRate = strideRate(baked.clips.carry);

  const material = makeBakedSkinMaterial(baked.material, uniforms);
  const depthMaterial = makeBakedSkinDepthMaterial(uniforms);
  const bundles = createBundles(baked, uniforms, depthMaterial, capacity);
  const bundleByKind = new Map(bundles.map((b) => [b.kind, b]));

  return {
    geometry: baked.geometry,
    material,
    depthMaterial,
    bundles: bundles.map((b) => b.mesh),
    update(mesh, units, time) {
      uniforms.uTime.value = time;
      for (const b of bundles) b.count = 0;
      const count = Math.min(units.length, capacity);
      for (let i = 0; i < count; i++) {
        const unit = units[i] as RenderedUnit;
        position.set(unit.x, unit.y, unit.z);
        quaternion.setFromAxisAngle(up, unit.heading);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);

        // Loads show while walking or standing; working units put them down.
        const bundle =
          unit.carrying && unit.activity !== 'working'
            ? bundleByKind.get(BUNDLE_FOR[unit.carrying])
            : undefined;
        const name: CharacterAnimation =
          unit.activity === 'working'
            ? unit.work
            : bundle
              ? unit.activity === 'walking'
                ? 'carry'
                : 'hold'
              : CLIP_FOR[unit.activity];
        const clip = baked.clips[name];
        const rate = name === 'walk' ? walkRate : name === 'carry' ? carryRate : 1;
        const phase = (unit.id * 0.37) % clip.duration;
        animArray.set([clip.start, clip.frames, phase, rate], i * 4);
        ownerColor(unit.ownerId).toArray(teamArray, i * 3);

        if (bundle) {
          bundle.mesh.setMatrixAt(bundle.count, matrix);
          bundle.animArray.set([clip.start, clip.frames, phase, rate], bundle.count * 4);
          bundle.count++;
        }
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
      team.needsUpdate = true;
      for (const b of bundles) {
        b.mesh.count = b.count;
        if (b.count === 0) continue;
        b.mesh.instanceMatrix.needsUpdate = true;
        b.anim.needsUpdate = true;
      }
    },
    dispose() {
      baked.geometry.dispose();
      baked.boneTexture.dispose();
      material.dispose();
      depthMaterial.dispose();
      for (const b of bundles) {
        b.mesh.geometry.dispose();
        (b.mesh.material as Material).dispose();
      }
    },
  };
}
