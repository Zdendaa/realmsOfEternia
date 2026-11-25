import type { HeightField } from '@roe/shared';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
} from 'three';

const SEGMENTS = 96;
const WIDTH = 0.22;
const LIFT = 0.18;

/**
 * A thin ring on the ground showing a tower's range, following the terrain. `place`
 * re-samples the heights; call it only when the spot or the radius changes.
 */
export function createRangeRing(color = '#ffe08a') {
  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(new Float32Array(SEGMENTS * 2 * 3), 3);
  positions.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2;
    const b = ((i + 1) % SEGMENTS) * 2;
    index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  geometry.setIndex(index);
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  let placed = '';
  return {
    mesh,
    /** Shows the ring there (re-sampling only when the spot changes), or hides it. */
    show(radius: number | undefined, x: number, z: number, heights: HeightField) {
      mesh.visible = radius !== undefined;
      const key = `${x}:${z}:${radius}`;
      if (radius === undefined || key === placed) return;
      placed = key;
      this.place(x, z, radius, heights);
    },
    place(x: number, z: number, radius: number, heights: HeightField) {
      for (let i = 0; i < SEGMENTS; i++) {
        const angle = (i / SEGMENTS) * Math.PI * 2;
        [radius - WIDTH / 2, radius + WIDTH / 2].forEach((r, side) => {
          const px = x + Math.cos(angle) * r;
          const pz = z + Math.sin(angle) * r;
          positions.setXYZ(i * 2 + side, px, heights.getHeightAt(px, pz) + LIFT, pz);
        });
      }
      positions.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
