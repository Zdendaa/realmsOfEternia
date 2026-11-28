import { MapControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { clamp, type HeightField } from '@roe/shared';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { MOUSE, Vector3, type Camera } from 'three';
import { usePointerTracker, type PointerTrack } from '../../input/usePointerTracker';
import { usePressedKeys } from '../../input/usePressedKeys';
import { useSettingsStore } from '../../state/settingsStore';
import { cameraFocus } from './cameraFocus';
import { cameraRig } from './cameraRig';

type MapControlsImpl = ComponentRef<typeof MapControls>;

const MIN_DISTANCE = 15;
const MAX_DISTANCE = 120;
/**
 * Each wheel event multiplies the distance by 0.95 ^ this (in or out): at 3 about 14
 * wheel notches cover the whole range.
 */
const CAMERA_ZOOM_SPEED = 3;
/**
 * Right drag: dragging the height of the view turns by 360° × this (tilt too): at 0.4,
 * 144° per view height.
 */
const CAMERA_ROTATE_SPEED = 0.4;
/** Polar angle limits, measured from straight down (0) toward the horizon. */
const MIN_POLAR_ANGLE = 0.2;
const MAX_POLAR_ANGLE = 1.1;
/** How quickly the focus point follows the terrain height (per second). */
const HEIGHT_FOLLOW_RATE = 6;
/** Minimum height of the camera above the terrain directly below it. */
const CAMERA_GROUND_CLEARANCE = 4;
/** Keyboard pan speed as a fraction of the current camera distance per second. */
const KEY_PAN_SPEED = 0.8;
/** The screen edge band (px) that pans the camera when edge scrolling is on. */
const EDGE_BAND = 10;

/**
 * Mouse scheme: left is free for selection (click, box; no LEFT entry = no camera action),
 * the middle button pans, the right button rotates (a right click without movement is a
 * unit command).
 */
const MOUSE_BUTTONS = { MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };

/** The screen's corners in normalized device coordinates, in order around it. */
const SCREEN_CORNERS = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
] as const;
/** A corner ray that misses the ground, or hits it farther than this, is cut off here. */
const MAX_VIEW_REACH = 400;

const ray = new Vector3();

/** Where the screen corners meet the level ground at height `groundY`. */
function viewCorners(camera: Camera, groundY: number) {
  camera.updateMatrixWorld();
  return SCREEN_CORNERS.map(([u, v]) => {
    ray.set(u, v, 0.5).unproject(camera).sub(camera.position).normalize();
    const reach = ray.y < 0 ? (groundY - camera.position.y) / ray.y : MAX_VIEW_REACH;
    const t = Math.min(reach, MAX_VIEW_REACH);
    return { x: camera.position.x + ray.x * t, z: camera.position.z + ray.z * t };
  });
}

const forward = new Vector3();
const right = new Vector3();
const offset = new Vector3();

function axis(keys: ReadonlySet<string>, positive: string[], negative: string[]): number {
  const has = (codes: string[]) => codes.some((code) => keys.has(code));
  return (has(positive) ? 1 : 0) - (has(negative) ? 1 : 0);
}

/** Pan direction from the pointer touching a screen edge: x right, z forward (up). */
function edgeAxis(pointer: PointerTrack): { x: number; z: number } {
  if (!pointer.inside || pointer.pressed) return { x: 0, z: 0 };
  const x = pointer.x <= EDGE_BAND ? -1 : pointer.x >= window.innerWidth - 1 - EDGE_BAND ? 1 : 0;
  const z = pointer.y <= EDGE_BAND ? 1 : pointer.y >= window.innerHeight - 1 - EDGE_BAND ? -1 : 0;
  return { x, z };
}

interface RtsCameraControlsProps {
  /** Half-size of the area the camera focus point may move within. */
  bounds: number;
  /** Where the camera looks when the game starts. */
  start: { x: number; z: number };
  /** Terrain height lookup; the focus point stays on the ground. */
  heights: HeightField;
}

/**
 * RTS-style camera: mouse pan / rotate / zoom via MapControls,
 * WASD + arrow key panning and optional screen-edge panning relative to the view direction,
 * the focus point is clamped to the map and follows the terrain height.
 */
export function RtsCameraControls({ bounds, start, heights }: RtsCameraControlsProps) {
  // Kept stable, so the controls take it once and the player's panning stays.
  const [startTarget] = useState((): [number, number, number] => [start.x, 0, start.z]);
  const controlsRef = useRef<MapControlsImpl>(null);
  const keys = usePressedKeys();
  const pointer = usePointerTracker();

  const camera = useThree((s) => s.camera);

  useEffect(() => {
    cameraRig.current = {
      viewCorners: () => viewCorners(camera, controlsRef.current?.target.y ?? 0),
      lookAt: (x, z) => {
        const controls = controlsRef.current;
        if (!controls) return;
        const dx = clamp(x, -bounds, bounds) - controls.target.x;
        const dz = clamp(z, -bounds, bounds) - controls.target.z;
        // The camera moves with its focus; the height follows in the next frames.
        for (const point of [controls.target, camera.position]) {
          point.x += dx;
          point.z += dz;
        }
        camera.updateMatrixWorld();
      },
    };
    return () => {
      cameraRig.current = null;
    };
  }, [camera, bounds]);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const target = controls.target;

    const edge = useSettingsStore.getState().edgeScroll
      ? edgeAxis(pointer.current)
      : { x: 0, z: 0 };
    const inputX = axis(keys.current, ['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) || edge.x;
    const inputZ = axis(keys.current, ['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']) || edge.z;

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

    // Never let the camera dip into terrain (the border mountains rise near the edges).
    const minCameraY =
      heights.getHeightAt(camera.position.x, camera.position.z) + CAMERA_GROUND_CLEARANCE;
    if (camera.position.y < minCameraY) camera.position.y = minCameraY;
    cameraFocus.x = target.x;
    cameraFocus.z = target.z;
  });

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      target={startTarget}
      mouseButtons={MOUSE_BUTTONS}
      enableDamping
      dampingFactor={0.12}
      zoomSpeed={CAMERA_ZOOM_SPEED}
      rotateSpeed={CAMERA_ROTATE_SPEED}
      screenSpacePanning={false}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={MIN_POLAR_ANGLE}
      maxPolarAngle={MAX_POLAR_ANGLE}
    />
  );
}
