import { fractalNoise2D, smoothstep, type HeightField, type MapDefinition } from '@roe/shared';
import { BufferAttribute, Color, PlaneGeometry } from 'three';

/** Grid resolution: vertices per world unit along each axis. */
const VERTICES_PER_UNIT = 1;

const GRASS_DARK = new Color('#3b6829');
const GRASS_LIGHT = new Color('#588a35');
const GRASS_DRY = new Color('#86924a');
const DIRT = new Color('#6e5d3d');

/**
 * Builds the terrain mesh from the shared height field. The geometry is in world
 * space (already lying on the X/Z plane) and has per-vertex grass colors.
 */
export function buildTerrainGeometry(map: MapDefinition, heights: HeightField): PlaneGeometry {
  const segments = map.size * VERTICES_PER_UNIT;
  const geometry = new PlaneGeometry(map.size, map.size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, heights.getHeightAt(positions.getX(i), positions.getZ(i)));
  }
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    // Broad patches of lighter and darker grass, plus fine variation.
    const patches = fractalNoise2D(map.seed + 101, x / 22, z / 22, 3);
    const detail = fractalNoise2D(map.seed + 202, x / 3, z / 3, 2);
    color.copy(GRASS_DARK).lerp(GRASS_LIGHT, smoothstep(0.3, 0.7, patches) * 0.55 + detail * 0.25);

    // Drier grass on hilltops, bare dirt on steeper slopes.
    color.lerp(GRASS_DRY, smoothstep(0.45, 1, positions.getY(i) / map.terrain.hillHeight) * 0.6);
    color.lerp(DIRT, smoothstep(0.93, 0.8, normals.getY(i)) * 0.7);

    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  return geometry;
}
