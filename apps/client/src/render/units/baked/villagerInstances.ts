import {
  CHARACTER_PACK,
  PROFESSIONS,
  UNITS,
  type CharacterAnimation,
  type CharacterModel,
  type HatStyle,
  type UnitKind,
} from '@roe/game-data';
import type { UnitActivity } from '@roe/sim';
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Texture,
} from 'three';
import type { RenderedUnit } from '../renderedUnits';
import { ownerColor } from '../unitColors';
import { createAttachedProp, type AttachedProp } from './attachedProps';
import type { BakedCharacter, BakedClip } from './bakeCharacter';
import {
  makeBakedSkinDepthMaterial,
  makeBakedSkinMaterial,
  measureCellLuma,
  type AtlasTint,
  type BakedSkinUniforms,
} from './bakedSkinMaterial';
import { BUNDLE_FOR, BUNDLE_KINDS, createBundleGeometry, type BundleKind } from './carryBundles';
import { TOOL_FOR_WORK, type PropSource, type ToolKind } from './professionProps';

/** Which clip shows which activity (working units pick theirs from `RenderedUnit.work`). */
const CLIP_FOR: Record<UnitActivity, CharacterAnimation> = {
  idle: 'idle',
  walking: 'walk',
  working: 'build',
  // Villagers don't fight; the death clip comes with the soldier visuals (6.2).
  attacking: 'idle',
  dying: 'idle',
};

/** Tunic color per profession; units without one keep this neutral brown-green. */
const TUNIC = new Map(Object.values(PROFESSIONS).map((p) => [p.id, new Color(p.tunic)]));
const DEFAULT_TUNIC = new Color('#4f5a46');

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const up = new Vector3(0, 1, 0);
const scale = new Vector3();
const animValues: [number, number, number, number] = [0, 0, 0, 0];

/** Hats and tools this kind of villager can show (built by `professionProps`). */
export interface VillagerProps {
  hats: ReadonlyMap<HatStyle, PropSource> | null;
  tools: ReadonlyMap<ToolKind, PropSource> | null;
}

export interface VillagerInstances {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  depthMaterial: Material;
  /** Loads, hats and tools: one instanced mesh each, written by `update`. */
  props: readonly InstancedMesh[];
  /**
   * Writes the transform, clip, phase, playback rate and colors of every unit of this
   * villager kind among `units`, and their loads, hats and tools.
   */
  update(mesh: InstancedMesh, units: readonly RenderedUnit[], time: number): void;
  dispose(): void;
}

/**
 * Feet don't slide: cycles per second = speed / stride per cycle (in world units), so
 * the playback rate is speed · duration / stride. Clamped only as a safety net.
 */
function strideRate(clip: BakedClip, character: CharacterModel, speed: number) {
  const worldStride = clip.stride * character.scale;
  return worldStride > 0 ? Math.min(4, Math.max(0.25, (speed * clip.duration) / worldStride)) : 1;
}

/** Brightness gain where the atlas can't be measured (about right for mid-tone swatches). */
const FALLBACK_GAIN = 2.2;

/**
 * Atlas cell roles of a character (1 = team color, 2 = profession color) and per-cell
 * gains measured from its texture.
 */
function atlasTint(character: CharacterModel, map: Texture | null): AtlasTint {
  const [columns, rows] = character.tint.grid;
  const roles = new Array<number>(columns * rows).fill(0);
  for (const [c, r] of character.tint.team) roles[r * columns + c] = 1;
  for (const [c, r] of character.tint.profession) roles[r * columns + c] = 2;
  const luma = measureCellLuma(map?.image as CanvasImageSource | undefined, character.tint.grid);
  const gains = roles.map((_, i) => {
    const l = luma?.[i] ?? 0;
    return l > 0.01 ? 1 / l : FALLBACK_GAIN;
  });
  return { grid: character.tint.grid, roles, gains };
}

/** Per-instance attributes of the body: animation (row, frames, phase, rate) and colors. */
function bodyAttributes(geometry: BufferGeometry, capacity: number) {
  const make = (size: number) => {
    const attribute = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attribute.setUsage(DynamicDrawUsage);
    return attribute;
  };
  const anim = make(4);
  const team = make(3);
  const tint = make(3);
  geometry.setAttribute('aAnim', anim);
  geometry.setAttribute('aTeam', team);
  geometry.setAttribute('aTint', tint);
  return { anim, team, tint };
}

/**
 * GPU resources and per-frame instance writing for one kind of baked villager (serfs or
 * workers). Per instance: the transform, the clip for its activity, a phase offset so
 * units don't move in sync, the stride-matched playback rate while walking, the owner's
 * color and the profession's tunic color. Units carrying goods walk with the `carry`
 * clip (stand with `hold`) and their load is drawn in their arms; workers wear their
 * profession's hat; working units hold the tool for their work. Attached props share
 * the unit's transform and animation.
 */
export function createVillagerInstances(
  baked: BakedCharacter<CharacterAnimation>,
  capacity: number,
  kind: UnitKind,
  character: CharacterModel,
  extras: VillagerProps,
): VillagerInstances {
  const uniforms: BakedSkinUniforms = {
    uBones: { value: baked.boneTexture },
    uTime: { value: 0 },
    uFps: { value: CHARACTER_PACK.bakeFps },
  };
  const { anim, team, tint } = bodyAttributes(baked.geometry, capacity);
  const animArray = anim.array as Float32Array;
  const teamArray = team.array as Float32Array;
  const tintArray = tint.array as Float32Array;

  const speed = UNITS[kind].speed;
  const walkRate = strideRate(baked.clips.walk, character, speed);
  const carryRate = strideRate(baked.clips.carry, character, speed);
  const characterScale = character.scale;

  const material = makeBakedSkinMaterial(
    baked.material,
    uniforms,
    atlasTint(character, baked.material.map),
  );
  const depthMaterial = makeBakedSkinDepthMaterial(uniforms);
  const attach = (source: PropSource) =>
    createAttachedProp(source.geometry, source.material, uniforms, depthMaterial, capacity);

  const attachment = baked.attachment;
  const bundles = new Map<BundleKind, AttachedProp>(
    attachment
      ? BUNDLE_KINDS.map((bundle) => [
          bundle,
          attach({
            geometry: createBundleGeometry(bundle, attachment),
            material: new MeshStandardMaterial({
              vertexColors: true,
              roughness: 0.9,
              flatShading: true,
            }),
          }),
        ])
      : [],
  );
  const hats = new Map([...(extras.hats ?? [])].map(([style, s]) => [style, attach(s)]));
  const tools = new Map([...(extras.tools ?? [])].map(([tool, s]) => [tool, attach(s)]));
  const allProps = [...bundles.values(), ...hats.values(), ...tools.values()];

  return {
    geometry: baked.geometry,
    material,
    depthMaterial,
    props: allProps.map((p) => p.mesh),
    update(mesh, units, time) {
      uniforms.uTime.value = time;
      scale.setScalar(characterScale);
      let count = 0;
      for (const unit of units) {
        if (unit.type !== kind || unit.inside) continue;
        if (count >= capacity) break;
        const i = count++;
        position.set(unit.x, unit.y, unit.z);
        quaternion.setFromAxisAngle(up, unit.heading);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);

        const working = unit.activity === 'working';
        // Loads show while walking or standing; working units put them down.
        const bundle =
          unit.carrying && !working ? bundles.get(BUNDLE_FOR[unit.carrying]) : undefined;
        let name: CharacterAnimation = CLIP_FOR[unit.activity];
        if (working) name = unit.work;
        else if (bundle) name = unit.activity === 'walking' ? 'carry' : 'hold';
        const clip = baked.clips[name];
        let rate = 1;
        if (name === 'walk') rate = walkRate;
        else if (name === 'carry') rate = carryRate;
        animValues[0] = clip.start;
        animValues[1] = clip.frames;
        animValues[2] = (unit.id * 0.37) % clip.duration;
        animValues[3] = rate;
        animArray.set(animValues, i * 4);
        ownerColor(unit.ownerId).toArray(teamArray, i * 3);
        const profession = unit.profession ? PROFESSIONS[unit.profession] : null;
        ((profession && TUNIC.get(profession.id)) ?? DEFAULT_TUNIC).toArray(tintArray, i * 3);

        bundle?.write(matrix, animValues);
        if (profession) hats.get(profession.hat)?.write(matrix, animValues);
        const tool = working ? TOOL_FOR_WORK[unit.work] : null;
        if (tool) tools.get(tool)?.write(matrix, animValues);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
      team.needsUpdate = true;
      tint.needsUpdate = true;
      for (const prop of allProps) prop.finish();
    },
    dispose() {
      baked.geometry.dispose();
      baked.boneTexture.dispose();
      material.dispose();
      depthMaterial.dispose();
      for (const prop of allProps) prop.dispose();
    },
  };
}
