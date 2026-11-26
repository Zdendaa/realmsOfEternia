import type { Vec2 } from '@roe/shared';

/** What HTML UI outside the canvas (the minimap) may ask of the camera. */
export interface CameraRig {
  /** The ground area on screen: its four corners, in order around it. */
  viewCorners: () => readonly Vec2[];
  /** Moves the focus point to (x, z), keeping the zoom and the viewing angle. */
  lookAt: (x: number, z: number) => void;
}

/** Set by `RtsCameraControls` while the canvas is mounted. */
export const cameraRig: { current: CameraRig | null } = { current: null };
