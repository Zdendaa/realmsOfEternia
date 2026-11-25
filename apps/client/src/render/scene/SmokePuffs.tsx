import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  DynamicDrawUsage,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  type InstancedMesh,
} from 'three';

/** A point that emits puffs this frame (keyed by `id` for its own emit timer). */
export interface SmokeEmitter {
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface SmokeStyle {
  color: string;
  opacity: number;
  /** Puffs alive at once, for all emitters together (oldest puffs are reused first). */
  maxPuffs: number;
  /** Seconds between puffs of one emitter, a puff's lifetime, how far it rises and drifts. */
  emitEvery: number;
  lifetime: number;
  rise: number;
  drift: number;
  /** Puff radius at birth and at its largest (world units). */
  startSize: number;
  endSize: number;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  age: number;
  /** Per-puff variation (0..1) for drift and size. */
  seed: number;
}

const matrix = new Matrix4();

/**
 * Soft puffs that rise, drift with a light wind, swell and shrink away, from whatever
 * `emitters()` returns each frame. One instanced mesh for every puff; purely cosmetic,
 * driven by frame time.
 */
export function SmokePuffs({
  emitters,
  style,
}: {
  emitters: () => readonly SmokeEmitter[];
  style: SmokeStyle;
}) {
  const geometry = useMemo(() => new IcosahedronGeometry(1, 1), []);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: style.color,
        roughness: 1,
        transparent: true,
        opacity: style.opacity,
        depthWrite: false,
        flatShading: true,
      }),
    [style.color, style.opacity],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const ref = useRef<InstancedMesh>(null);
  const puffs = useRef<Puff[]>([]);
  const timers = useRef(new Map<number, number>());
  const counter = useRef(0);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
  }, []);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const list = puffs.current;

    for (const emitter of emitters()) {
      const due = (timers.current.get(emitter.id) ?? 0) - delta;
      if (due > 0) {
        timers.current.set(emitter.id, due);
        continue;
      }
      timers.current.set(emitter.id, style.emitEvery);
      const seed = (counter.current++ * 0.618034) % 1;
      const puff = { x: emitter.x, y: emitter.y, z: emitter.z, age: 0, seed };
      if (list.length < style.maxPuffs) list.push(puff);
      else {
        // Replace the oldest puff.
        let oldest = 0;
        for (let i = 1; i < list.length; i++)
          if ((list[i]?.age ?? 0) > (list[oldest]?.age ?? 0)) oldest = i;
        list[oldest] = puff;
      }
    }

    let count = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const puff = list[i] as Puff;
      puff.age += delta;
      if (puff.age >= style.lifetime) {
        list.splice(i, 1);
        continue;
      }
      const t = puff.age / style.lifetime;
      // Swells quickly, then shrinks away over the last third of its life.
      const swell = style.startSize + (style.endSize - style.startSize) * Math.min(1, t * 2);
      const size = swell * (t > 0.66 ? (1 - t) / 0.34 : 1) * (0.85 + puff.seed * 0.3);
      matrix.makeScale(size, size * 0.85, size);
      matrix.setPosition(
        puff.x + style.drift * t * (0.7 + puff.seed * 0.6),
        puff.y + style.rise * Math.sqrt(t),
        puff.z + style.drift * 0.4 * t * (puff.seed - 0.5),
      );
      mesh.setMatrixAt(count++, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[geometry, material, style.maxPuffs]} frustumCulled={false} />
  );
}
