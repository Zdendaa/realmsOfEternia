import { useFrame } from '@react-three/fiber';
import { BUILDINGS, type BuildingDefinition } from '@roe/game-data';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  DynamicDrawUsage,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  type InstancedMesh,
} from 'three';
import { useGameStore } from '../../../state/gameStore';
import { busyBuildings } from './busyBuildings';
import type { AnimatedBuilding } from './SpinningParts';

/** Puffs alive at once, for all chimneys together (oldest puffs are reused first). */
const MAX_PUFFS = 96;
/** Seconds between puffs of one chimney, a puff's lifetime, and how far it rises and drifts. */
const EMIT_EVERY = 0.45;
const LIFETIME = 3.2;
const RISE = 3;
const DRIFT = 0.9;
/** Puff radius at birth and at its largest (world units). */
const START_SIZE = 0.25;
const END_SIZE = 0.75;

interface Puff {
  x: number;
  y: number;
  z: number;
  age: number;
  /** Per-puff variation (0..1) for drift and size. */
  seed: number;
}

const matrix = new Matrix4();

/** Chimney top in world space for a building (model point rotated, scaled, placed). */
function chimneyOf({ building, y }: AnimatedBuilding) {
  const definition = BUILDINGS[building.type] as BuildingDefinition;
  const from = definition.smokeFrom;
  if (!from) return null;
  const angle = building.rotation + definition.rotationOffset;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const s = definition.scale;
  return {
    id: building.id,
    x: building.x + (from.x * cos + from.z * sin) * s,
    y: y + from.y * s,
    z: building.z + (-from.x * sin + from.z * cos) * s,
  };
}

/**
 * Smoke from the chimneys of buildings whose worker is at work (the bakery): soft grey
 * puffs that rise, drift with a light wind, swell and shrink away. One instanced mesh for
 * every puff; purely cosmetic, driven by frame time.
 */
export function ChimneySmoke({ buildings }: { buildings: readonly AnimatedBuilding[] }) {
  const chimneys = useMemo(
    () => buildings.map(chimneyOf).filter((c): c is NonNullable<typeof c> => c !== null),
    [buildings],
  );
  const geometry = useMemo(() => new IcosahedronGeometry(1, 1), []);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#d9d5cc',
        roughness: 1,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        flatShading: true,
      }),
    [],
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
    const busy = busyBuildings(useGameStore.getState().state.units);
    const list = puffs.current;

    for (const chimney of chimneys) {
      if (!busy.has(chimney.id)) continue;
      const due = (timers.current.get(chimney.id) ?? 0) - delta;
      if (due > 0) {
        timers.current.set(chimney.id, due);
        continue;
      }
      timers.current.set(chimney.id, EMIT_EVERY);
      const seed = (counter.current++ * 0.618034) % 1;
      const puff = { x: chimney.x, y: chimney.y, z: chimney.z, age: 0, seed };
      if (list.length < MAX_PUFFS) list.push(puff);
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
      if (puff.age >= LIFETIME) {
        list.splice(i, 1);
        continue;
      }
      const t = puff.age / LIFETIME;
      // Swells quickly, then shrinks away over the last third of its life.
      const swell = START_SIZE + (END_SIZE - START_SIZE) * Math.min(1, t * 2);
      const size = swell * (t > 0.66 ? (1 - t) / 0.34 : 1) * (0.85 + puff.seed * 0.3);
      matrix.makeScale(size, size * 0.85, size);
      matrix.setPosition(
        puff.x + DRIFT * t * (0.7 + puff.seed * 0.6),
        puff.y + RISE * Math.sqrt(t),
        puff.z + DRIFT * 0.4 * t * (puff.seed - 0.5),
      );
      mesh.setMatrixAt(count++, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, MAX_PUFFS]} frustumCulled={false} />;
}
