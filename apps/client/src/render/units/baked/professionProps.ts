import type { CharacterModel, HatStyle } from '@roe/game-data';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Matrix4,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { UnitWork } from '../renderedUnits';
import { skinRigidly } from './attachedProps';
import type { BakedCharacter } from './bakeCharacter';
import { paint, prepare } from './propGeometry';

/** Tools held while working; which one follows the kind of work. */
export type ToolKind = 'hammer' | 'axe' | 'pickaxe';

export const TOOL_FOR_WORK: Record<UnitWork, ToolKind> = {
  build: 'hammer',
  chop: 'axe',
  mine: 'pickaxe',
};

/** Geometry (in the character's bind space, rigidly skinned) and material of one prop. */
export interface PropSource {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
}

/** A tool model loaded from a file (KayKit accessory), in its own (hand slot) frame. */
export interface ToolModel {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
}

const propMaterial = () =>
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });

/**
 * Top center and radius of the head, measured on the vertices mostly skinned to the head
 * bone (head and hair), in bind space.
 */
function measureHead(geometry: BufferGeometry, headBone: number) {
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    let best = 0;
    let bestBone = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w > best) {
        best = w;
        bestBone = skinIndex.getComponent(i, k);
      }
    }
    if (bestBone !== headBone) continue;
    point.fromBufferAttribute(position, i);
    min.min(point);
    max.max(point);
  }
  if (!Number.isFinite(min.x)) return null;
  return {
    top: new Vector3((min.x + max.x) / 2, max.y, (min.z + max.z) / 2),
    radius: Math.max(max.x - min.x, max.z - min.z) / 2,
  };
}

/**
 * Hat shapes in head units (r = head radius), origin at the top center of the head,
 * +Y up, +Z the way the character faces. Each sits a little into the hair.
 */
function hatShape(style: HatStyle, r: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry) => parts.push(prepare(geometry));
  switch (style) {
    case 'woolCap': {
      // A knitted cap with a folded rim and a bobble.
      const dome = paint(
        new SphereGeometry(0.86 * r, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        '#9c4a2f',
      );
      dome.scale(1, 0.95, 1).translate(0, -0.3 * r, 0);
      add(dome);
      add(
        paint(new CylinderGeometry(0.89 * r, 0.89 * r, 0.2 * r, 9), '#7d3a25').translate(
          0,
          -0.3 * r,
          0,
        ),
      );
      add(paint(new SphereGeometry(0.17 * r, 6, 4), '#e8dcc4').translate(0, 0.55 * r, 0));
      break;
    }
    case 'clothCap': {
      // A flat cloth cap with a short peak at the front.
      const crown = paint(
        new SphereGeometry(0.92 * r, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        '#a59a84',
      );
      crown.scale(1.02, 0.55, 1.05).translate(0, -0.18 * r, 0);
      add(crown);
      add(
        paint(new BoxGeometry(0.9 * r, 0.06 * r, 0.42 * r), '#8a7f6a').translate(
          0,
          -0.16 * r,
          0.95 * r,
        ),
      );
      break;
    }
    case 'strawHat': {
      // A wide straw brim, a low cone and a brown band.
      add(
        paint(new CylinderGeometry(1.5 * r, 1.5 * r, 0.06 * r, 12), '#d9b65d').translate(
          0,
          -0.12 * r,
          0,
        ),
      );
      add(
        paint(new ConeGeometry(0.78 * r, 0.62 * r, 10), '#d9b65d', '#c9a24c').translate(
          0,
          0.2 * r,
          0,
        ),
      );
      add(
        paint(new CylinderGeometry(0.74 * r, 0.78 * r, 0.12 * r, 10), '#8a5a2b').translate(
          0,
          -0.03 * r,
          0,
        ),
      );
      break;
    }
    case 'millerCap': {
      // A soft, floppy white cap leaning back.
      const cap = paint(new SphereGeometry(0.95 * r, 9, 6), '#efeae0');
      cap
        .scale(1.05, 0.5, 1.15)
        .rotateX(-0.25)
        .translate(0, 0.02 * r, -0.15 * r);
      add(cap);
      break;
    }
    case 'toque': {
      // A tall white baker's hat with a puffed top.
      add(
        paint(new CylinderGeometry(0.66 * r, 0.7 * r, 0.85 * r, 10), '#f4f1ea').translate(
          0,
          0.2 * r,
          0,
        ),
      );
      const puff = paint(new SphereGeometry(0.82 * r, 10, 6), '#fbf9f4');
      puff.scale(1, 0.55, 1).translate(0, 0.7 * r, 0);
      add(puff);
      break;
    }
    case 'minerHelmet': {
      // A dark metal helmet with a rim and a lamp at the front.
      const dome = paint(
        new SphereGeometry(0.9 * r, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        '#5b5e63',
      );
      dome.scale(1, 0.85, 1).translate(0, -0.25 * r, 0);
      add(dome);
      add(
        paint(new CylinderGeometry(1.02 * r, 1.02 * r, 0.08 * r, 10), '#44474b').translate(
          0,
          -0.25 * r,
          0,
        ),
      );
      const lamp = paint(
        new CylinderGeometry(0.17 * r, 0.2 * r, 0.16 * r, 8),
        '#ffd75a',
        '#fff1b0',
      );
      lamp.rotateX(Math.PI / 2).translate(0, 0.12 * r, 0.86 * r);
      add(lamp);
      break;
    }
  }
  return mergeGeometries(parts);
}

/**
 * Code-built tools in the hand slot's frame (KayKit accessories use the same: the grip at
 * the origin, the handle along +Y, the head across X), in model units.
 */
function toolShape(tool: Exclude<ToolKind, 'axe'>): BufferGeometry {
  const handle = paint(new CylinderGeometry(0.035, 0.04, 0.95, 6), '#8a5a33');
  handle.translate(0, 0.27, 0);
  if (tool === 'hammer') {
    const head = paint(new BoxGeometry(0.34, 0.16, 0.16), '#7b8188', '#9aa1a8');
    head.translate(0.03, 0.72, 0);
    return mergeGeometries([prepare(handle), prepare(head)]);
  }
  // Pickaxe: two tapered points across the top of the handle.
  const point = (side: number) => {
    const g = paint(new ConeGeometry(0.06, 0.36, 6), '#7b8188');
    g.rotateZ((-side * Math.PI) / 2 - side * 0.25).translate(side * 0.2, 0.72, 0);
    return prepare(g);
  };
  const collar = paint(new BoxGeometry(0.12, 0.12, 0.12), '#5f646a');
  collar.translate(0, 0.74, 0);
  return mergeGeometries([prepare(handle), point(1), point(-1), prepare(collar)]);
}

/** Hats for every style, placed on the character's head. Null if the head can't be found. */
export function createHatSources(
  baked: BakedCharacter<string>,
  character: CharacterModel,
): Map<HatStyle, PropSource> | null {
  const bone = baked.boneIndex(character.headBone);
  if (bone === null) return null;
  const head = measureHead(baked.geometry, bone);
  if (!head) return null;
  const styles: HatStyle[] = [
    'woolCap',
    'clothCap',
    'strawHat',
    'millerCap',
    'toque',
    'minerHelmet',
  ];
  const at = new Matrix4().makeTranslation(head.top);
  return new Map(
    styles.map((style) => {
      const geometry = hatShape(style, head.radius).applyMatrix4(at);
      return [style, { geometry: skinRigidly(geometry, bone), material: propMaterial() }];
    }),
  );
}

/** Tools in the character's tool hand: code-built hammer and pickaxe, the loaded axe. */
export function createToolSources(
  baked: BakedCharacter<string>,
  character: CharacterModel,
  axe: ToolModel,
): Map<ToolKind, PropSource> | null {
  const bone = baked.boneIndex(character.toolBone);
  const bind = bone === null ? undefined : baked.boneBinds[bone];
  if (bone === null || !bind) return null;
  const place = (geometry: BufferGeometry) => skinRigidly(geometry.applyMatrix4(bind), bone);
  return new Map<ToolKind, PropSource>([
    ['hammer', { geometry: place(toolShape('hammer')), material: propMaterial() }],
    ['pickaxe', { geometry: place(toolShape('pickaxe')), material: propMaterial() }],
    ['axe', { geometry: place(axe.geometry.clone()), material: axe.material.clone() }],
  ]);
}
