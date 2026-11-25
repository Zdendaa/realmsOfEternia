import {
  attackOf,
  CHARACTER_PACK,
  UNITS,
  type AttackDefinition,
  type SoldierAnimation,
  type SoldierModel,
  type UnitKind,
} from '@roe/game-data';
import {
  Color,
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
import { createAttachedProp, type AttachedProp } from './attachedProps';
import type { BakedCharacter } from './bakeCharacter';
import {
  makeBakedSkinDepthMaterial,
  makeBakedSkinMaterial,
  type BakedSkinUniforms,
} from './bakedSkinMaterial';
import type { PropSource } from './professionProps';
import { atlasTint, bodyAttributes, onceAt, strideRate } from './villagerInstances';

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const up = new Vector3(0, 1, 0);
const scale = new Vector3();
const animValues: [number, number, number, number] = [0, 0, 0, 0];
/** Soldiers have no profession tint; the attribute is still written (white = unused). */
const NO_TINT = new Color(1, 1, 1);

export interface SoldierInstances {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  depthMaterial: Material;
  /** Weapons and gear: one instanced mesh each, written by `update`. */
  props: readonly InstancedMesh[];
  update(mesh: InstancedMesh, units: readonly RenderedUnit[], time: number): void;
  dispose(): void;
}

/**
 * GPU resources and per-frame instance writing for one kind of soldier. Like the
 * villagers (baked skinning, one instanced mesh, the owner's color in the atlas), plus:
 * - attacks are timed by the simulation: the attack clip is placed at the attack's
 *   elapsed time, played at the speed that brings its hit moment (`attackHitAt`) onto
 *   the strike (`windup`); after the clip, the `ready` stance loops until the next one;
 * - death plays once and holds its last frame (the corpse then sinks, see
 *   `UnitFrameDriver`);
 * - the soldier's gear is always shown.
 */
export function createSoldierInstances(
  baked: BakedCharacter<SoldierAnimation>,
  capacity: number,
  kind: UnitKind,
  soldier: SoldierModel,
  gear: readonly PropSource[],
): SoldierInstances {
  const fps = CHARACTER_PACK.bakeFps;
  const uniforms: BakedSkinUniforms = {
    uBones: { value: baked.boneTexture },
    uTime: { value: 0 },
    uFps: { value: fps },
  };
  const { anim, team, tint } = bodyAttributes(baked.geometry, capacity);
  const animArray = anim.array as Float32Array;
  const teamArray = team.array as Float32Array;
  const tintArray = tint.array as Float32Array;

  const walkRate = strideRate(baked.clips.walk, soldier, UNITS[kind].speed);
  const attack = attackOf(kind) as AttackDefinition;
  // Clip seconds per real second during an attack: the hit frame lands on the strike.
  const attackSpeed = soldier.attackHitAt / attack.windup;
  const attackClip = baked.clips.attack;

  const material = makeBakedSkinMaterial(
    baked.material,
    uniforms,
    atlasTint(soldier, baked.material.map),
  );
  const depthMaterial = makeBakedSkinDepthMaterial(uniforms);
  const props: AttachedProp[] = gear.map((source) =>
    createAttachedProp(source.geometry, source.material, uniforms, depthMaterial, capacity),
  );

  /** Writes the clip values for `unit` into `animValues`. */
  function animate(unit: RenderedUnit) {
    if (unit.activity === 'dying') {
      onceAt(baked.clips.death, unit.deathElapsed ?? 0, fps, animValues);
      return;
    }
    if (unit.activity === 'attacking' && unit.attackElapsed !== null) {
      const clipTime = unit.attackElapsed * attackSpeed;
      if (clipTime < attackClip.duration) {
        onceAt(attackClip, clipTime, fps, animValues);
        return;
      }
    }
    const name: SoldierAnimation =
      unit.activity === 'attacking' ? 'ready' : unit.activity === 'walking' ? 'walk' : 'idle';
    const clip = baked.clips[name];
    animValues[0] = clip.start;
    animValues[1] = clip.frames;
    animValues[2] = (unit.id * 0.37) % clip.duration;
    animValues[3] = name === 'walk' ? walkRate : 1;
  }

  return {
    geometry: baked.geometry,
    material,
    depthMaterial,
    props: props.map((p) => p.mesh),
    update(mesh, units, time) {
      uniforms.uTime.value = time;
      scale.setScalar(soldier.scale);
      let count = 0;
      for (const unit of units) {
        if (unit.type !== kind) continue;
        if (count >= capacity) break;
        const i = count++;
        position.set(unit.x, unit.y, unit.z);
        quaternion.setFromAxisAngle(up, unit.heading);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
        animate(unit);
        animArray.set(animValues, i * 4);
        ownerColor(unit.ownerId).toArray(teamArray, i * 3);
        NO_TINT.toArray(tintArray, i * 3);
        for (const prop of props) prop.write(matrix, animValues);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
      team.needsUpdate = true;
      tint.needsUpdate = true;
      for (const prop of props) prop.finish();
    },
    dispose() {
      baked.geometry.dispose();
      baked.boneTexture.dispose();
      material.dispose();
      depthMaterial.dispose();
      for (const prop of props) prop.dispose();
    },
  };
}
