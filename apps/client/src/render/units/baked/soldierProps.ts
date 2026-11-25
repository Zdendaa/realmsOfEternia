import type { SoldierModel, WeaponId } from '@roe/game-data';
import {
  ConeGeometry,
  CylinderGeometry,
  Matrix4,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { skinRigidly } from './attachedProps';
import type { BakedCharacter } from './bakeCharacter';
import type { PropSource, ToolModel } from './professionProps';
import { paint, prepare } from './propGeometry';

/**
 * Where gear sits in its bone's frame beyond what the model brings, in model units:
 * the quiver hangs on the back (behind the chest, slanted); hand-held weapons need
 * nothing (KayKit accessories are modelled for the hand slots).
 */
const GEAR_OFFSET: Partial<Record<WeaponId, Matrix4>> = {
  quiver: new Matrix4()
    .makeTranslation(0.12, 0.05, -0.32)
    .multiply(new Matrix4().makeRotationX(-0.25))
    .multiply(new Matrix4().makeRotationZ(-0.35)),
};

/**
 * A long spear in the hand slot's frame (grip at the origin, shaft along +Y): an ash
 * shaft reaching back behind the hand, an iron leaf blade at the front.
 */
function spearShape(): BufferGeometry {
  const shaft = paint(new CylinderGeometry(0.035, 0.04, 2.3, 6), '#8a5a33');
  shaft.translate(0, 0.45, 0);
  const socket = paint(new CylinderGeometry(0.05, 0.045, 0.14, 6), '#5f646a');
  socket.translate(0, 1.62, 0);
  const blade = paint(new ConeGeometry(0.085, 0.42, 4), '#9aa1a8', '#c4cad0');
  blade.scale(1, 1, 0.45).translate(0, 1.9, 0);
  const butt = paint(new SphereGeometry(0.05, 6, 4), '#5f646a');
  butt.translate(0, -0.7, 0);
  return mergeGeometries([prepare(shaft), prepare(socket), prepare(blade), prepare(butt)]);
}

/**
 * The soldier's gear as attached props: each item in its bone's bind frame, rigidly
 * skinned to that bone. Items whose bone or model is missing are skipped.
 */
export function createWeaponSources(
  baked: BakedCharacter<string>,
  soldier: SoldierModel,
  models: ReadonlyMap<WeaponId, ToolModel>,
): PropSource[] {
  const sources: PropSource[] = [];
  for (const { weapon, bone: boneName } of soldier.weapons) {
    const bone = baked.boneIndex(boneName);
    const bind = bone === null ? undefined : baked.boneBinds[bone];
    if (bone === null || !bind) continue;
    const place = (geometry: BufferGeometry) => {
      const offset = GEAR_OFFSET[weapon];
      if (offset) geometry.applyMatrix4(offset);
      return skinRigidly(geometry.applyMatrix4(bind), bone);
    };
    if (weapon === 'spear') {
      sources.push({
        geometry: place(spearShape()),
        material: new MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.8,
          flatShading: true,
        }),
      });
      continue;
    }
    const model = models.get(weapon);
    if (model) {
      sources.push({ geometry: place(model.geometry.clone()), material: model.material.clone() });
    }
  }
  return sources;
}
