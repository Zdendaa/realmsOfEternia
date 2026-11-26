import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The parts of the siege engines built in code, in world units, facing +Z, standing on
 * y = 0, colored by vertex: the wheeled frames, and the whole battering ram (temporary:
 * the packs have no ram model).
 */

const TIMBER = '#7a5636';
const TIMBER_DARK = '#583c25';
const PLANK = '#96704a';
const HIDE = '#6d4a34';
const IRON = '#565a60';

export const WHEEL_RADIUS = 0.4;
/** Where the four wheels sit: x to each side, z front and back, at axle height. */
export const WHEELS = [
  [-0.82, 0.68],
  [0.82, 0.68],
  [-0.82, -0.68],
  [0.82, -0.68],
] as const;

/** One color for the whole geometry; the shapes become non-indexed so they can merge. */
function paint(geometry: BufferGeometry, color: string): BufferGeometry {
  const plain = geometry.toNonIndexed();
  geometry.dispose();
  plain.deleteAttribute('uv');
  const count = plain.getAttribute('position').count;
  const { r, g, b } = new Color(color);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
  plain.setAttribute('color', new BufferAttribute(colors, 3));
  return plain;
}

const box = (
  size: [number, number, number],
  at: [number, number, number],
  color: string,
  roll = 0,
) => {
  const geometry = new BoxGeometry(...size);
  geometry.rotateZ(roll).translate(...at);
  return paint(geometry, color);
};

/** A cylinder lying along `axis`. */
function rod(
  radius: number,
  length: number,
  at: [number, number, number],
  color: string,
  axis: 'x' | 'z',
  endRadius = radius,
) {
  const geometry = new CylinderGeometry(endRadius, radius, length, 10);
  if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
  else geometry.rotateX(Math.PI / 2);
  geometry.translate(...at);
  return paint(geometry, color);
}

/** A wheel around its own center, turning about X; the spokes show that it turns. */
export function wheelGeometry(): BufferGeometry {
  return mergeGeometries([
    rod(WHEEL_RADIUS, 0.16, [0, 0, 0], TIMBER_DARK, 'x'),
    rod(WHEEL_RADIUS * 0.78, 0.18, [0, 0, 0], PLANK, 'x'),
    box([0.2, WHEEL_RADIUS * 1.5, 0.09], [0, 0, 0], TIMBER_DARK),
    box([0.2, 0.09, WHEEL_RADIUS * 1.5], [0, 0, 0], TIMBER_DARK),
    rod(0.09, 0.26, [0, 0, 0], IRON, 'x'),
  ]);
}

/** Two long beams, cross beams and the axles. */
const chassis = () => [
  box([0.2, 0.2, 2.05], [-0.6, 0.52, 0], TIMBER),
  box([0.2, 0.2, 2.05], [0.6, 0.52, 0], TIMBER),
  box([1.4, 0.16, 0.2], [0, 0.52, 0.9], TIMBER_DARK),
  box([1.4, 0.16, 0.2], [0, 0.52, -0.9], TIMBER_DARK),
  rod(0.07, 1.75, [0, WHEEL_RADIUS, 0.68], IRON, 'x'),
  rod(0.07, 1.75, [0, WHEEL_RADIUS, -0.68], IRON, 'x'),
];

/** The catapult's frame: the chassis with a plank deck, and the pole of its pennant. */
export const catapultFrameGeometry = () =>
  mergeGeometries([
    ...chassis(),
    box([1.2, 0.1, 1.5], [0, 0.63, 0], PLANK),
    box([0.07, 1.25, 0.07], [-0.55, 1.25, -0.85], TIMBER_DARK),
  ]);

/** The ram's frame: four posts and a pitched roof of hides over the log. */
export function ramFrameGeometry(): BufferGeometry {
  const parts = chassis();
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.75, 0.75]) parts.push(box([0.15, 1.35, 0.15], [x, 1.27, z], TIMBER));
    parts.push(box([0.12, 0.12, 1.65], [x, 1.9, 0], TIMBER_DARK));
  }
  for (const side of [-1, 1]) {
    parts.push(box([0.98, 0.1, 2.05], [side * 0.39, 2.14, 0], HIDE, side * -0.55));
    // Battens over the hides.
    for (const z of [-0.8, 0, 0.8]) {
      parts.push(box([1, 0.05, 0.1], [side * 0.41, 2.2, z], TIMBER_DARK, side * -0.55));
    }
  }
  return mergeGeometries(parts);
}

/** The swinging log with its iron head and bands, hanging from two straps. */
export const ramLogGeometry = () =>
  mergeGeometries([
    rod(0.22, 2.3, [0, 1.12, 0.1], TIMBER_DARK, 'z'),
    rod(0.27, 0.38, [0, 1.12, 1.36], IRON, 'z'),
    rod(0.27, 0.22, [0, 1.12, 1.62], IRON, 'z', 0.1),
    rod(0.245, 0.1, [0, 1.12, 0.65], IRON, 'z'),
    rod(0.245, 0.1, [0, 1.12, -0.55], IRON, 'z'),
    box([0.06, 0.75, 0.06], [0, 1.65, 0.5], '#3b3128'),
    box([0.06, 0.75, 0.06], [0, 1.65, -0.4], '#3b3128'),
  ]);

/** Pieces in the owner's color (white here; the instance color tints them). */
export const catapultPennantGeometry = () =>
  mergeGeometries([box([0.04, 0.34, 0.55], [-0.55, 1.68, -1.14], '#ffffff')]);

export const ramColorsGeometry = () =>
  mergeGeometries([
    // The ridge of the roof and a cloth along each side.
    box([0.24, 0.14, 2.12], [0, 2.43, 0], '#ffffff'),
    box([0.05, 0.3, 1.5], [-0.86, 1.78, 0], '#ffffff'),
    box([0.05, 0.3, 1.5], [0.86, 1.78, 0], '#ffffff'),
  ]);
