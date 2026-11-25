/**
 * The ground point the camera looks at, written every frame by `RtsCameraControls`.
 * A plain module value (it changes every frame); UI that needs "where the player is
 * looking" (the dev spawn panel) reads it.
 */
export const cameraFocus = { x: 0, z: 0 };
