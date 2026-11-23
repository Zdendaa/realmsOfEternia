import { MapControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { clamp, type HeightField } from '@roe/shared';
import { useRef, type ComponentRef } from 'react';
import { Vector3 } from 'three';
import { usePressedKeys } from '../../input/usePressedKeys';

type MapControlsImpl = ComponentRef<typeof MapControls>;

const MIN_DISTANCE = 15;
const MAX_DISTANCE = 120;
/** Polar angle limits, measured from straight down (0) toward the horizon. */
const MIN_POLAR_ANGLE = 0.2;
const MAX_POLAR_ANGLE = 1.1;
/** How quickly the focus point follows the terrain height (per second). */
const HEIGHT_FOLLOW_RATE = 6;
/** Keyboard pan speed as a fraction of the current camera distance per second. */
const KEY_PAN_SPEED = 0.8;

const forward = new Vector3();
const right = new Vector3();
const offset = new Vector3();

function axis(keys: ReadonlySet<string>, positive: string[], negative: string[]): number {
  const has = (codes: string[]) => codes.some((code) => keys.has(code));
  return (has(positive) ? 1 : 0) - (has(negative) ? 1 : 0);
}

interface RtsCameraControlsProps {
  /** Half-size of the area the camera focus point may move within. */
  bounds: number;
  /** Terrain height lookup; the focus point stays on the ground. */
  heights: HeightField;
}

/**
 * RTS-style camera: mouse pan / rotate / zoom via MapControls,
 * WASD + arrow key panning relative to the view direction,
 * the focus point is clamped to the map and follows the terrain height.
 */
export function RtsCameraControls({ bounds, heights }: RtsCameraControlsProps) {
  const controlsRef = useRef<MapControlsImpl>(null);
  const keys = usePressedKeys();

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const target = controls.target;

    const inputX = axis(keys.current, ['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const inputZ = axis(keys.current, ['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);

    if (inputX !== 0 || inputZ !== 0) {
      forward.subVectors(target, camera.position).setY(0).normalize();
      right.crossVectors(forward, camera.up).normalize();
      const step = camera.position.distanceTo(target) * KEY_PAN_SPEED * Math.min(delta, 0.1);
      offset
        .set(0, 0, 0)
        .addScaledVector(forward, inputZ * step)
        .addScaledVector(right, inputX * step);
      target.add(offset);
      camera.position.add(offset);
    }

    // Keep the focus point inside the map; move the camera with it to preserve the view.
    const clampedX = clamp(target.x, -bounds, bounds);
    const clampedZ = clamp(target.z, -bounds, bounds);
    if (clampedX !== target.x || clampedZ !== target.z) {
      offset.set(clampedX - target.x, 0, clampedZ - target.z);
      target.add(offset);
      camera.position.add(offset);
    }

    // Glide the focus point (and the camera with it) onto the terrain surface.
    const groundY = heights.getHeightAt(target.x, target.z);
    const dy = (groundY - target.y) * Math.min(1, delta * HEIGHT_FOLLOW_RATE);
    target.y += dy;
    camera.position.y += dy;
  });

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={MIN_POLAR_ANGLE}
      maxPolarAngle={MAX_POLAR_ANGLE}
    />
  );
}
