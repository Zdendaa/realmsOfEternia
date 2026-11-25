import {
  AnimationClip,
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
  type KeyframeTrack,
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
  /** Where carried goods attach (see `BakeOptions.attach`), or null. */
  attachment: CarryAttachment | null;
  /**
   * Index of a bone by its name in the GLB ('handslot.r'), or null. Indices match the
   * geometry's skin indices and the bone texture.
   */
  boneIndex(name: string): number | null;
  /**
   * The bone's frame in bind pose (the inverse of its bind inverse), in the space of
   * `geometry`: something modelled in the bone's local frame goes to `bind · v`.
   */
  boneBinds: readonly Matrix4[];
}

/**
 * Rigid attachment of carried goods to one bone. A vertex `v` of a bundle modelled
 * around the hands (origin between them, +X to the character's left, +Y up, +Z forward)
 * goes to `anchor · v` in bind space; skinned with weight 1 on `bone`, it then follows
 * the animation exactly like the hands.
 */
export interface CarryAttachment {
  bone: number;
  anchor: Matrix4;
}

export interface BakeOptions<K extends string> {
  hiddenMeshes: readonly string[];
  fps: number;
  /** Compute a `CarryAttachment` on `bone`, between `hands` as posed in clip `clip`. */
  attach?: { clip: K; bone: string; hands: readonly [string, string] };
}

/**
 * A clip with the legs and hips of `lower` and the `upperBones` of `upper` (names as in
 * the GLB; GLTFLoader sanitizes them the same way here). Lasts as long as `lower`; a
 * shorter upper clip holds its last frame, which suits static poses.
 */
export function combineClips(
  name: string,
  lower: AnimationClip,
  upper: AnimationClip,
  upperBones: readonly string[],
): AnimationClip {
  const upperSet = new Set(upperBones.map((b) => PropertyBinding.sanitizeNodeName(b)));
  const isUpper = (trackName: string) => upperSet.has(trackName.split('.')[0] ?? '');
  return new AnimationClip(name, lower.duration, [
    ...lower.tracks.filter((t) => !isUpper(t.name)),
    ...upper.tracks.filter((t) => isUpper(t.name)),
  ]);
}

/** Gap between the two halves of a sequence, so their boundary keys don't share a time. */
const SEQUENCE_GAP = 1e-3;

/**
 * `first` followed by `second` as one clip (the archer's draw, then release). Tracks are
 * joined by name; a bone animated in only one half keeps its keys there.
 */
export function sequenceClips(
  name: string,
  first: AnimationClip,
  second: AnimationClip,
): AnimationClip {
  const offset = first.duration + SEQUENCE_GAP;
  const shifted = (track: KeyframeTrack) => {
    const copy = track.clone();
    copy.shift(offset);
    return copy;
  };
  const seconds = new Map(second.tracks.map((t) => [t.name, t]));
  const tracks = first.tracks.map((track) => {
    const next = seconds.get(track.name);
    if (!next) return track.clone();
    seconds.delete(track.name);
    const later = shifted(next);
    const times = new Float32Array(track.times.length + later.times.length);
    times.set(track.times);
    times.set(later.times, track.times.length);
    const values = new Float32Array(track.values.length + later.values.length);
    values.set(track.values);
    values.set(later.values, track.values.length);
    const Track = track.constructor as new (
      name: string,
      times: Float32Array,
      values: Float32Array,
    ) => KeyframeTrack;
    return new Track(track.name, times, values);
  });
  for (const track of seconds.values()) tracks.push(shifted(track));
  return new AnimationClip(name, offset + second.duration, tracks);
}

/** `CarryAttachment` from the first frame of `clip`. */
function measureAttachment(
  root: Object3D,
  bones: readonly Object3D[],
  boneInverses: readonly Matrix4[],
  clip: AnimationClip,
  boneName: string,
  hands: readonly [string, string],
): CarryAttachment | null {
  const find = (name: string) => {
    const key = PropertyBinding.sanitizeNodeName(name);
    const index = bones.findIndex((b) => b.name === key);
    return index >= 0 ? index : null;
  };
  const bone = find(boneName);
  const left = find(hands[0]);
  const right = find(hands[1]);
  if (bone === null || left === null || right === null) return null;

  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(0);
  root.updateMatrixWorld(true);
  const between = (bones[left] as Object3D)
    .getWorldPosition(new Vector3())
    .add((bones[right] as Object3D).getWorldPosition(new Vector3()))
    .multiplyScalar(0.5);
  const skin = new Matrix4().multiplyMatrices(
    (bones[bone] as Object3D).matrixWorld,
    boneInverses[bone] as Matrix4,
  );
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  const anchor = skin.invert().multiply(new Matrix4().makeTranslation(between));
  return { bone, anchor };
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
  options: BakeOptions<K>,
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

  const attach = options.attach;
  const attachment = attach
    ? measureAttachment(root, bones, boneInverses, clips[attach.clip], attach.bone, attach.hands)
    : null;

  const boneBinds = boneInverses.map((inverse) => inverse.clone().invert());
  const boneIndexOf = (name: string) => {
    const index = boneIndex.get(PropertyBinding.sanitizeNodeName(name));
    return index ?? null;
  };
  return {
    geometry,
    material,
    boneTexture,
    boneCount: bones.length,
    clips: baked,
    attachment,
    boneIndex: boneIndexOf,
    boneBinds,
  };
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
