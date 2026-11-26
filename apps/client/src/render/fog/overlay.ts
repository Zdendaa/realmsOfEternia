import { Vector2, type Object3D, type Texture } from 'three';

/**
 * Things drawn on top of the fog of war, undarkened: command markers must show where the
 * player clicked, also on unexplored (black) ground. They live on `OVERLAY_LAYER` only, so
 * the camera's normal pass skips them; `FogPass` draws them after the fog, and their
 * shaders hide fragments behind the scene with `overlayUniforms` (the scene's depth).
 */
export const OVERLAY_LAYER = 1;

/** Objects `FogPass` draws after the fog (registered by their components). */
export const overlayObjects = new Set<Object3D>();

/** Shared by every overlay material; written by `FogPass` each frame. */
export const overlayUniforms = {
  /** The scene's depth (same size as the screen), or null outside the fog pass. */
  uSceneDepth: { value: null as Texture | null },
  /** Drawing buffer size in pixels, to look up the depth at a fragment. */
  uViewport: { value: new Vector2(1, 1) },
  /** 1 while drawn after the fog (test against `uSceneDepth`), 0 in a plain render. */
  uUseSceneDepth: { value: 0 },
};

/** GLSL: discards a fragment that lies behind the scene (when drawn after the fog). */
export const OVERLAY_DEPTH_PARS = /* glsl */ `
uniform sampler2D uSceneDepth;
uniform vec2 uViewport;
uniform float uUseSceneDepth;
void overlayDepthTest() {
  if (uUseSceneDepth > 0.5 &&
      gl_FragCoord.z > texture2D(uSceneDepth, gl_FragCoord.xy / uViewport).x + 1e-6) discard;
}
`;

/** Puts `object` on the overlay layer and registers it; returns the cleanup. */
export function addOverlay(object: Object3D): () => void {
  object.layers.set(OVERLAY_LAYER);
  overlayObjects.add(object);
  return () => {
    overlayObjects.delete(object);
  };
}
