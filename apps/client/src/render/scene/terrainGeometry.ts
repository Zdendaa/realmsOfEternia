import {
  fractalNoise2D,
  lakeDistance,
  smoothstep,
  type HeightField,
  type Bounds2D,
  type Lake,
  type MapDefinition,
} from '@roe/shared';
import { BufferAttribute, Color, PlaneGeometry } from 'three';
import type { WornPatch } from '../../world/decorateWorld';
import { createWearSampler } from '../../world/wear';

/** Grid spacing in the border ring; mountains don't need playable-area detail. */
const BORDER_SPACING = 2;
/**
 * Number of extra grid rows on each side beyond the border ring. Their spacing
 * grows quadratically, so the terrain reaches FAR_EXTENT and fades into the fog
 * instead of ending at a visible edge.
 */
const FAR_ROWS = 20;
/** Half-size of the whole terrain mesh, well beyond the fog's far distance. */
const FAR_EXTENT = 700;

const GRASS_DARK = new Color('#3b6829');
const GRASS_LIGHT = new Color('#588a35');
const GRASS_DRY = new Color('#86924a');
const DIRT = new Color('#6e5d3d');
const ROCK = new Color('#7a776c');
/** Trampled ground around entrances and squares; close to the path color, a bit greener. */
const WORN = new Color('#76694c');
/** Sandy banks just above the water line, and muddy lake beds below it. */
const SAND = new Color('#a3956d');
const LAKE_BED = new Color('#4d5038');

/**
 * Maps a grid row offset from the center to a world coordinate. Rows are 1 unit apart
 * in the playable area, BORDER_SPACING apart in the border ring, then grow
 * quadratically out to FAR_EXTENT.
 */
function createGridMapping(map: MapDefinition) {
  const playableRows = map.size / 2;
  const borderRows = map.border.width / BORDER_SPACING;
  const borderEnd = map.size / 2 + map.border.width;

  return {
    rowsPerSide: playableRows + borderRows + FAR_ROWS,
    toWorld(row: number): number {
      const n = Math.abs(row);
      let distance: number;
      if (n <= playableRows) {
        distance = n;
      } else if (n <= playableRows + borderRows) {
        distance = playableRows + (n - playableRows) * BORDER_SPACING;
      } else {
        const t = (n - playableRows - borderRows) / FAR_ROWS;
        distance = borderEnd + (FAR_EXTENT - borderEnd) * t * t;
      }
      return Math.sign(row) * distance;
    },
  };
}

/**
 * Builds the terrain mesh from the shared height field: playable area, border ring
 * and far surroundings, all in one seamless geometry with per-vertex colors.
 */
export type TerrainColorizer = (
  x: number,
  y: number,
  z: number,
  flatness: number,
  target: Color,
) => Color;

/**
 * Vertex color of the ground at a point: grass, dry hilltops, dirt and rock on slopes,
 * worn ground, sandy banks and lake beds. `flatness` is the normal's Y component.
 */
export function createTerrainColorizer(
  map: MapDefinition,
  wornPatches: readonly WornPatch[] = [],
  lakes: readonly Lake[] = [],
): TerrainColorizer {
  const wearAt = createWearSampler(map, wornPatches);
  const { hillHeight } = map.terrain;
  const { mountainHeight } = map.border;

  return (x, y, z, flatness, color) => {
    // Mid-green base with only gentle variation; grass tufts provide the detail.
    const patches = fractalNoise2D(map.seed + 101, x / 22, z / 22, 3);
    const detail = fractalNoise2D(map.seed + 202, x / 3, z / 3, 2);
    color.copy(GRASS_DARK).lerp(GRASS_LIGHT, 0.55 + (patches - 0.5) * 0.3 + (detail - 0.5) * 0.2);

    // Drier grass higher up, bare dirt on slopes, rock on high or steep mountainsides.
    color.lerp(GRASS_DRY, smoothstep(0.45, 1, y / hillHeight) * 0.6);
    color.lerp(DIRT, smoothstep(0.93, 0.8, flatness) * 0.7);
    const rockiness = Math.max(
      smoothstep(0.6, 0.9, y / mountainHeight),
      smoothstep(0.75, 0.55, flatness),
    );
    color.lerp(ROCK, rockiness * 0.85);
    color.lerp(WORN, wearAt(x, z) * 0.6);

    for (const lake of lakes) {
      const d = lakeDistance(lake, x, z);
      if (d > 1.6) continue;
      // Sand only in a narrow band along the shoreline, not on every low-lying field.
      const nearShore = 1 - smoothstep(1.02, 1.16, d);
      color.lerp(SAND, smoothstep(lake.level + 0.9, lake.level + 0.15, y) * nearShore * 0.7);
      color.lerp(LAKE_BED, smoothstep(lake.level - 0.1, lake.level - 1.2, y));
    }
    return color;
  };
}

export function buildTerrainGeometry(
  map: MapDefinition,
  heights: HeightField,
  colorize: TerrainColorizer,
): PlaneGeometry {
  const grid = createGridMapping(map);
  const segments = 2 * grid.rowsPerSide;
  const geometry = new PlaneGeometry(1, 1, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = grid.toWorld(Math.round(positions.getX(i) * segments));
    const z = grid.toWorld(Math.round(positions.getZ(i) * segments));
    positions.setXYZ(i, x, heights.getHeightAt(x, z), z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let i = 0; i < positions.count; i++) {
    colorize(positions.getX(i), positions.getY(i), positions.getZ(i), normals.getY(i), color);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  return geometry;
}

/**
 * Re-samples heights and colors for all vertices inside `bounds` (e.g. around a newly
 * placed building) instead of rebuilding the whole mesh.
 */
export function updateTerrainRegion(
  geometry: PlaneGeometry,
  heights: HeightField,
  bounds: Bounds2D,
  colorize: TerrainColorizer,
): void {
  const positions = geometry.getAttribute('position');
  const touched: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
    positions.setY(i, heights.getHeightAt(x, z));
    touched.push(i);
  }
  if (touched.length === 0) return;
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute('normal');
  const colors = geometry.getAttribute('color');
  const color = new Color();
  for (const i of touched) {
    colorize(positions.getX(i), positions.getY(i), positions.getZ(i), normals.getY(i), color);
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;
}
