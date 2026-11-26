import { isWalkableBuilding, isWall } from '@roe/game-data';
import type { PlayerId } from '@roe/shared';
import {
  isAlive,
  type BuildingInstance,
  type SimWorld,
  type UnitInstance,
  type Vision,
} from '@roe/sim';
import { Color } from 'three';
import { createTerrainColorizer } from '../../render/scene/terrainGeometry';
import { ownerColor } from '../../render/units/unitColors';
import { segmentEnds } from '../../render/walls/wallLayout';
import { LOCAL_PLAYER } from '../../state/gameStore';
import type { MinimapTransform } from './transform';

/** The minimap's layers, each drawn into a 2D context. */

const WATER = '#3a6f86';
const PATH = '#8d7650';
const TREE = '#22451c';
const ROCK = '#9a968a';
const VIEW = '#f4efdc';
/** How dark explored ground out of sight is (0..255); unexplored ground is black. */
const EXPLORED_ALPHA = 130;
/** Unit dots and building outlines in CSS pixels. */
const UNIT_DOT = 3.25;
const WALL_WIDTH = 2;

/** An offscreen canvas of `width` × `height` pixels with its context. */
export function offscreen(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext('2d') as CanvasRenderingContext2D };
}

/** The ground and water, one pixel per world unit. It never changes, so it is made once. */
export function createGroundImage(world: SimWorld): HTMLCanvasElement {
  const { map, heights, water } = world;
  const size = map.size;
  const { canvas, context } = offscreen(size, size);
  const image = context.createImageData(size, size);
  const colorize = createTerrainColorizer(map, [], water.lakes);
  const color = new Color();
  const waterColor = new Color(WATER);
  for (let row = 0; row < size; row++) {
    const z = row + 0.5 - size / 2;
    for (let column = 0; column < size; column++) {
      const x = column + 0.5 - size / 2;
      const y = heights.getHeightAt(x, z);
      const slopeX = heights.getHeightAt(x + 0.5, z) - heights.getHeightAt(x - 0.5, z) || 0;
      const slopeZ = heights.getHeightAt(x, z + 0.5) - heights.getHeightAt(x, z - 0.5) || 0;
      const flatness = 1 / Math.hypot(slopeX, 1, slopeZ);
      if (water.isWater(x, z)) color.copy(waterColor);
      else {
        colorize(x, y, z, flatness, color);
        // A light from the north-west, so hills read on a flat map.
        color.multiplyScalar(1 + (slopeX + slopeZ) * 0.35);
      }
      const hex = color.getHex();
      const i = (row * size + column) * 4;
      image.data[i] = (hex >> 16) & 255;
      image.data[i + 1] = (hex >> 8) & 255;
      image.data[i + 2] = hex & 255;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** The ground with the paths, trees and rocks; depleted trees and rocks are left out. */
export function drawTerrain(
  context: CanvasRenderingContext2D,
  world: SimWorld,
  ground: HTMLCanvasElement,
  resourceNodes: Readonly<Record<number, number>>,
  transform: MinimapTransform,
): void {
  const { toPixelX, toPixelY, scale } = transform;
  const { width, height } = context.canvas;
  context.drawImage(ground, 0, 0, width, height);
  context.strokeStyle = PATH;
  context.lineWidth = world.pathWidth * scale;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const path of world.paths) {
    context.beginPath();
    for (const point of path) context.lineTo(toPixelX(point.x), toPixelY(point.z));
    context.stroke();
  }
  const half = world.map.size / 2;
  for (const d of world.decorations) {
    if (Math.abs(d.x) > half || Math.abs(d.z) > half || resourceNodes[d.id] === 0) continue;
    context.fillStyle = d.kind === 'tree' ? TREE : ROCK;
    const dot = (d.kind === 'tree' ? 1.8 : 1.5) * d.scale * scale;
    context.fillRect(toPixelX(d.x) - dot / 2, toPixelY(d.z) - dot / 2, dot, dot);
  }
}

const tints = new Map<string, string>();

/** The owner's color, lightened so it stands out from the ground. */
function mapColor(owner: PlayerId | null, lighten: number): string {
  const key = `${String(owner)}:${lighten}`;
  let style = tints.get(key);
  if (!style) {
    style = ownerColor(owner).clone().lerp(new Color('#ffffff'), lighten).getStyle();
    tints.set(key, style);
  }
  return style;
}

/** Buildings as their footprints, walls and gates as lines, in the owner's color. */
export function drawBuildings(
  context: CanvasRenderingContext2D,
  buildings: readonly BuildingInstance[],
  footprintOf: (building: BuildingInstance) => { w: number; d: number },
  transform: MinimapTransform,
  pixelRatio: number,
): void {
  const { toPixelX, toPixelY, scale } = transform;
  context.lineCap = 'square';
  context.lineWidth = WALL_WIDTH * pixelRatio;
  for (const building of buildings) {
    if (isWall(building.type)) {
      const [from, to] = segmentEnds(building) as [
        { x: number; z: number },
        { x: number; z: number },
      ];
      context.strokeStyle = mapColor(building.ownerId, 0.4);
      context.beginPath();
      context.moveTo(toPixelX(from.x), toPixelY(from.z));
      context.lineTo(toPixelX(to.x), toPixelY(to.z));
      context.stroke();
      continue;
    }
    const { w, d } = footprintOf(building);
    const field = isWalkableBuilding(building.type);
    context.save();
    context.translate(toPixelX(building.x), toPixelY(building.z));
    context.rotate(-building.rotation);
    context.globalAlpha = field ? 0.55 : 1;
    context.fillStyle = mapColor(building.ownerId, 0.15);
    context.fillRect((-w / 2) * scale, (-d / 2) * scale, w * scale, d * scale);
    context.lineWidth = pixelRatio;
    context.strokeStyle = 'rgb(0 0 0 / 65%)';
    context.strokeRect((-w / 2) * scale, (-d / 2) * scale, w * scale, d * scale);
    context.restore();
    context.lineWidth = WALL_WIDTH * pixelRatio;
  }
}

/** Living units as dots; `shown` hides what the fog hides. */
export function drawUnits(
  context: CanvasRenderingContext2D,
  units: readonly UnitInstance[],
  shown: (unit: UnitInstance) => boolean,
  transform: MinimapTransform,
  pixelRatio: number,
): void {
  const dot = UNIT_DOT * pixelRatio;
  const border = pixelRatio * 0.5;
  for (const unit of units) {
    if (!isAlive(unit) || !shown(unit)) continue;
    const x = transform.toPixelX(unit.x) - dot / 2;
    const y = transform.toPixelY(unit.z) - dot / 2;
    context.fillStyle = '#0b0d0b';
    context.fillRect(x - border, y - border, dot + border * 2, dot + border * 2);
    context.fillStyle = mapColor(unit.ownerId, unit.ownerId === LOCAL_PLAYER ? 0.35 : 0.2);
    context.fillRect(x, y, dot, dot);
  }
}

/** Writes the fog into a vision-sized image: black unexplored, dimmed explored. */
export function paintFog(context: CanvasRenderingContext2D, vision: Vision): void {
  const image = context.createImageData(vision.columns, vision.rows);
  for (let i = 0; i < vision.columns * vision.rows; i++) {
    const seen = (vision.counts[i] ?? 0) > 0;
    image.data[i * 4 + 3] = seen ? 0 : vision.explored[i] ? EXPLORED_ALPHA : 255;
  }
  context.putImageData(image, 0, 0);
}

/** The outline of the ground the camera shows. */
export function drawView(
  context: CanvasRenderingContext2D,
  corners: readonly { x: number; z: number }[],
  transform: MinimapTransform,
  pixelRatio: number,
): void {
  context.strokeStyle = VIEW;
  context.lineWidth = 1.25 * pixelRatio;
  context.lineJoin = 'miter';
  context.beginPath();
  for (const corner of corners) {
    context.lineTo(transform.toPixelX(corner.x), transform.toPixelY(corner.z));
  }
  context.closePath();
  context.stroke();
}
