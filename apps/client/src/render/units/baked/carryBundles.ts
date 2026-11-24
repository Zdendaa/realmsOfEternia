import type { ResourceId } from '@roe/game-data';
import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { skinRigidly } from './attachedProps';
import type { CarryAttachment } from './bakeCharacter';
import { paint, prepare } from './propGeometry';

/** Bundle shapes; every resource maps to one. */
export type BundleKind = 'logs' | 'stones' | 'sack' | 'bread' | 'goldOre' | 'ironOre';

export const BUNDLE_KINDS: readonly BundleKind[] = [
  'logs',
  'stones',
  'sack',
  'bread',
  'goldOre',
  'ironOre',
];

export const BUNDLE_FOR: Record<ResourceId, BundleKind> = {
  wood: 'logs',
  stone: 'stones',
  iron: 'ironOre',
  gold: 'goldOre',
  food: 'bread',
  mana: 'sack',
};

/** A log lying across the arms (along X), bark sides and light cut ends. */
function log(length: number, radius: number, y: number, z: number, tilt: number) {
  const g = paint(new CylinderGeometry(radius, radius * 1.05, length, 7), '#7a5230', '#e0b277');
  g.rotateZ(Math.PI / 2)
    .rotateY(tilt)
    .translate(0, y, z);
  return prepare(g);
}

function stone(radius: number, x: number, y: number, z: number, turn: number, color = '#a3a6a8') {
  const g = paint(new DodecahedronGeometry(radius, 0), color);
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
    case 'bread': {
      // A shallow wicker basket with two loaves.
      const basket = paint(new CylinderGeometry(0.2, 0.15, 0.12, 8), '#9a6f3c', '#7a5530');
      basket.scale(1.3, 1, 1).translate(0, 0.06, 0.02);
      const loaf = (x: number, turn: number) => {
        const g = paint(new SphereGeometry(0.1, 7, 5), '#d08a3e');
        g.scale(1.5, 0.75, 1).rotateY(turn).translate(x, 0.15, 0.02);
        return prepare(g);
      };
      return mergeGeometries([prepare(basket), loaf(-0.08, 0.3), loaf(0.09, -0.2)]);
    }
    case 'goldOre':
    case 'ironOre': {
      // Dark rock with veins: gold glints yellow, iron ore is rusty.
      const vein = kind === 'goldOre' ? '#e2b53a' : '#a0522d';
      const fleck = (x: number, y: number, z: number) => {
        const g = paint(new BoxGeometry(0.06, 0.04, 0.06), vein);
        g.rotateY(0.6).translate(x, y, z);
        return prepare(g);
      };
      return mergeGeometries([
        stone(0.12, -0.08, 0.06, 0.02, 0.7, '#5d5752'),
        stone(0.11, 0.09, 0.05, 0.03, 1.9, '#5d5752'),
        fleck(-0.06, 0.16, 0.08),
        fleck(0.11, 0.13, 0.1),
        fleck(0.0, 0.08, 0.13),
      ]);
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
  return skinRigidly(geometry, attachment.bone);
}
