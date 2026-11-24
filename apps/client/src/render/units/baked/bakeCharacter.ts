import {
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  PropertyBinding,
  RGBAFormat,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
  type Material,
  type Object3D,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Where one clip lives in the bone texture. */
export interface BakedClip {
  /** First texture row of the clip. */
  start: number;
  /** Number of rows (frames). The clip loops from the last frame back to the first. */
  frames: number;
  duration: number;
  /**
   * Ground distance (model units) one cycle of the clip covers with planted feet; see
   * `measureStride`. Playback rate for a ground speed v: v · duration / stride.
   * 0 for clips where no foot is planted and moving (idle, work).
   */
  stride: number;
}

export interface BakedCharacter<K extends string> {
  /** All visible body parts merged into one geometry, in bind pose, with skin attributes. */
  geometry: BufferGeometry;
  /** The character's own material (texture atlas), cloned. */
  material: MeshStandardMaterial;
  /** One row per frame, 4 RGBA texels (matrix columns) per bone: the skinning matrices. */
  boneTexture: DataTexture;
  boneCount: number;
  clips: Record<K, BakedClip>;
}

/**
 * Foot bones used to measure strides. GLTFLoader sanitizes node names ('.' is reserved
 * in property paths), so 'foot.l' is loaded as 'footl'.
 */
const FOOT_BONES = ['foot.l', 'foot.r'].map((name) => PropertyBinding.sanitizeNodeName(name));
/** Stride measurement samples the clip at this rate (finer than the bake). */
const MEASURE_FPS = 120;
/** A foot counts as planted within this fraction of its height range above its lowest point. */
const CONTACT_BAND = 0.08;

/**
 * Ground distance one cycle of `clip` covers. A walk cycle is played in place: while a
 * foot is planted, it moves backwards relative to the body exactly as fast as the body
 * would move over the ground. So the ground speed is the foot's horizontal speed during
 * its contact frames (the lowest part of its height range), averaged over both feet;
 * times the clip duration that is the stride per cycle.
 */
function measureStride(root: Object3D, feet: Object3D[], clip: AnimationClip): number {
  if (feet.length === 0) return 0;
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  const samples = Math.max(2, Math.round(clip.duration * MEASURE_FPS));
  const tracks = feet.map(() => [] as Vector3[]);
  for (let f = 0; f <= samples; f++) {
    mixer.setTime((f / samples) * clip.duration);
    root.updateMatrixWorld(true);
    feet.forEach((foot, i) => tracks[i]?.push(foot.getWorldPosition(new Vector3())));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);

  let distance = 0;
  let time = 0;
  const dt = clip.duration / samples;
  for (const track of tracks) {
    const ys = track.map((p) => p.y);
    const low = Math.min(...ys);
    const contact = low + (Math.max(...ys) - low) * CONTACT_BAND;
    for (let f = 1; f < track.length; f++) {
      const a = track[f - 1] as Vector3;
      const b = track[f] as Vector3;
      if (a.y > contact || b.y > contact) continue;
      distance += Math.hypot(b.x - a.x, b.z - a.z);
      time += dt;
    }
  }
  return time > 0 ? (distance / time) * clip.duration : 0;
}

/**
 * Prepares a skinned character for instanced drawing ("baked" animation): samples each
 * clip at `fps` and stores every bone's skinning matrix per frame in a float texture, so
 * a vertex shader can animate any number of instances without a skeleton per unit.
 *
 * Skinning in three.js (attached bind mode) is v' = Σ wᵢ · (boneᵢ.matrixWorld · boneInverseᵢ)
 * · bindMatrix · v. The bind matrix is applied to the merged geometry up front, so the
 * texture only stores boneᵢ.matrixWorld · boneInverseᵢ (relative to the character root).
 */
export function bakeCharacter<K extends string>(
  source: Object3D,
  clips: Record<K, AnimationClip>,
  options: { hiddenMeshes: readonly string[]; fps: number },
): BakedCharacter<K> {
  // The loaded scene is cached and shared; animate a private copy with its own skeleton.
  const root = cloneSkinned(source);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const meshes: SkinnedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof SkinnedMesh && !options.hiddenMeshes.includes(object.name)) {
      meshes.push(object);
    }
  });
  const first = meshes[0];
  if (!first) throw new Error('Character has no skinned meshes');
  const bones = first.skeleton.bones;
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));

  const geometry = mergeSkinnedMeshes(meshes, boneIndex);
  const material = (first.material as Material).clone();
  if (!(material instanceof MeshStandardMaterial)) {
    throw new Error('Expected a MeshStandardMaterial on the character');
  }

  const fps = options.fps;
  const entries = Object.entries(clips) as [K, AnimationClip][];
  const frameCounts = entries.map(([, clip]) => Math.max(1, Math.round(clip.duration * fps)));
  const rows = frameCounts.reduce((a, b) => a + b, 0);
  const width = bones.length * 4;
  const data = new Float32Array(width * rows * 4);
  const boneInverses = first.skeleton.boneInverses;
  const skinMatrix = new Matrix4();
  const feet = bones.filter((b) => FOOT_BONES.includes(b.name));

  const baked = {} as Record<K, BakedClip>;
  let row = 0;
  entries.forEach(([key, clip], c) => {
    const frames = frameCounts[c] as number;
    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    for (let f = 0; f < frames; f++) {
      mixer.setTime(f / fps);
      root.updateMatrixWorld(true);
      bones.forEach((bone, b) => {
        skinMatrix.multiplyMatrices(bone.matrixWorld, boneInverses[b] as Matrix4);
        skinMatrix.toArray(data, ((row + f) * width + b * 4) * 4);
      });
    }
    action.stop();
    mixer.uncacheRoot(root);
    const stride = measureStride(root, feet, clip);
    baked[key] = { start: row, frames, duration: clip.duration, stride };
    row += frames;
  });

  const boneTexture = new DataTexture(data, width, rows, RGBAFormat, FloatType);
  boneTexture.minFilter = NearestFilter;
  boneTexture.magFilter = NearestFilter;
  boneTexture.generateMipmaps = false;
  boneTexture.needsUpdate = true;

  return { geometry, material, boneTexture, boneCount: bones.length, clips: baked };
}

/**
 * Merges skinned meshes into one geometry: positions and normals pre-transformed by each
 * mesh's bind matrix, skin indices remapped to the first skeleton's bone order by name.
 */
function mergeSkinnedMeshes(meshes: SkinnedMesh[], boneIndex: Map<string, number>): BufferGeometry {
  const parts = meshes.map((mesh) => {
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.bindMatrix);
    const remap = mesh.skeleton.bones.map((bone) => {
      const index = boneIndex.get(bone.name);
      if (index === undefined) throw new Error(`Bone "${bone.name}" missing from the base rig`);
      return index;
    });
    return { g, remap };
  });

  let vertexCount = 0;
  let indexCount = 0;
  for (const { g } of parts) {
    const count = g.getAttribute('position').count;
    vertexCount += count;
    indexCount += g.index ? g.index.count : count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const skinIndex = new Float32Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  const index = new Uint32Array(indexCount);

  let v = 0;
  let k = 0;
  for (const { g, remap } of parts) {
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const tex = g.getAttribute('uv');
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    for (let i = 0; i < pos.count; i++) {
      const o = v + i;
      position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], o * 3);
      normal.set([nrm.getX(i), nrm.getY(i), nrm.getZ(i)], o * 3);
      if (tex) uv.set([tex.getX(i), tex.getY(i)], o * 2);
      skinIndex.set(
        [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)].map((b) => remap[b] ?? 0),
        o * 4,
      );
      skinWeight.set([sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], o * 4);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[k++] = v + g.index.getX(i);
    } else {
      for (let i = 0; i < pos.count; i++) index[k++] = v + i;
    }
    v += pos.count;
    g.dispose();
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(position, 3));
  merged.setAttribute('normal', new BufferAttribute(normal, 3));
  merged.setAttribute('uv', new BufferAttribute(uv, 2));
  merged.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  merged.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  merged.setIndex(new BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}
