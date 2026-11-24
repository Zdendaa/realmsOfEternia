import type { ResourceId } from '@roe/game-data';
import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarryAttachment } from './bakeCharacter';

/** Bundle shapes; every resource maps to one. */
export type BundleKind = 'logs' | 'stones' | 'sack';

export const BUNDLE_KINDS: readonly BundleKind[] = ['logs', 'stones', 'sack'];

export const BUNDLE_FOR: Record<ResourceId, BundleKind> = {
  wood: 'logs',
  stone: 'stones',
  iron: 'sack',
  gold: 'sack',
  food: 'sack',
  mana: 'sack',
};

/** Paints every vertex of `geometry`; caps (normals along local Y) get `capColor`. */
function paint(geometry: BufferGeometry, color: string, capColor = color) {
  const side = new Color(color);
  const cap = new Color(capColor);
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    (Math.abs(normals.getY(i)) > 0.9 ? cap : side).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** Same attribute layout for merging: non-indexed, position + normal + color. */
function prepare(geometry: BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  return flat;
}

/** A log lying across the arms (along X), bark sides and light cut ends. */
function log(length: number, radius: number, y: number, z: number, tilt: number) {
  const g = paint(new CylinderGeometry(radius, radius * 1.05, length, 7), '#7a5230', '#e0b277');
  g.rotateZ(Math.PI / 2)
    .rotateY(tilt)
    .translate(0, y, z);
  return prepare(g);
}

function stone(radius: number, x: number, y: number, z: number, turn: number) {
  const g = paint(new DodecahedronGeometry(radius, 0), '#a3a6a8');
  g.rotateX(turn)
    .rotateY(turn * 1.7)
    .scale(1.1, 0.8, 1)
    .translate(x, y, z);
  return prepare(g);
}

/**
 * Model-space shapes (character model units, ~2.3 tall), centered between the hands:
 * +X across the body, +Y up, +Z forward.
 */
function bundleShape(kind: BundleKind): BufferGeometry {
  switch (kind) {
    case 'logs':
      return mergeGeometries([
        log(0.8, 0.08, 0.04, -0.06, 0.04),
        log(0.76, 0.075, 0.04, 0.1, -0.05),
        log(0.72, 0.07, 0.17, 0.02, 0.02),
      ]);
    case 'stones':
      return mergeGeometries([
        stone(0.13, -0.09, 0.06, 0.02, 0.4),
        stone(0.11, 0.1, 0.05, 0.04, 1.1),
        stone(0.1, 0.01, 0.17, 0.0, 2.3),
      ]);
    case 'sack': {
      const body = paint(new SphereGeometry(0.17, 8, 6), '#c8a46e');
      body.scale(1.25, 1, 1).translate(0, 0.1, 0.02);
      const tie = paint(new CylinderGeometry(0.035, 0.05, 0.08, 6), '#8a6a3f');
      tie.translate(0, 0.27, 0.02);
      return mergeGeometries([prepare(body), prepare(tie)]);
    }
  }
}

/**
 * Bundle geometry in the character's bind space, rigidly skinned to the attachment bone
 * (skin index = bone, weight 1), so the baked-skin material animates it with the unit.
 */
export function createBundleGeometry(kind: BundleKind, attachment: CarryAttachment) {
  const geometry = bundleShape(kind);
  geometry.applyMatrix4(attachment.anchor);
  const count = geometry.getAttribute('position').count;
  const skinIndex = new Float32Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = attachment.bone;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  geometry.computeBoundingSphere();
  return geometry;
}
