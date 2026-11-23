import { fractalNoise2D, smoothstep, type HeightField, type MapDefinition } from '@roe/shared';
import { BufferAttribute, Color, PlaneGeometry } from 'three';

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
export function buildTerrainGeometry(map: MapDefinition, heights: HeightField): PlaneGeometry {
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
  const { hillHeight } = map.terrain;
  const { mountainHeight } = map.border;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const flatness = normals.getY(i);

    // Broad patches of lighter and darker grass, plus fine variation.
    const patches = fractalNoise2D(map.seed + 101, x / 22, z / 22, 3);
    const detail = fractalNoise2D(map.seed + 202, x / 3, z / 3, 2);
    color.copy(GRASS_DARK).lerp(GRASS_LIGHT, smoothstep(0.3, 0.7, patches) * 0.55 + detail * 0.25);

    // Drier grass higher up, bare dirt on slopes, rock on high or steep mountainsides.
    color.lerp(GRASS_DRY, smoothstep(0.45, 1, y / hillHeight) * 0.6);
    color.lerp(DIRT, smoothstep(0.93, 0.8, flatness) * 0.7);
    const rockiness = Math.max(
      smoothstep(0.6, 0.9, y / mountainHeight),
      smoothstep(0.75, 0.55, flatness),
    );
    color.lerp(ROCK, rockiness * 0.85);

    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  return geometry;
}
