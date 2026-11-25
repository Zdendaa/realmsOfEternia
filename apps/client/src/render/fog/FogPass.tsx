import { useFrame, useThree } from '@react-three/fiber';
import { VISION_CELL, type Vision } from '@roe/sim';
import { useEffect, useMemo } from 'react';
import {
  DataTexture,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type IUniform,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { useSettingsStore } from '../../state/settingsStore';
import { localVision } from './knowledge';

/** How fast the drawn fog follows the vision (per second): reveals and hides in ~0.3 s. */
const FADE_RATE = 7;
/** Fog texture values: never seen, explored, visible. */
const UNEXPLORED = 0;
const EXPLORED = 0.5;
const VISIBLE = 1;

/**
 * The fog texture: one texel per vision cell (R8, row 0 at the grid's -Z edge), linear
 * filtering for soft edges. `update` eases the drawn values toward the vision\'s, and
 * uploads only while something changes.
 */
function createFogTexture(vision: Vision) {
  const cells = vision.columns * vision.rows;
  const target = new Float32Array(cells);
  const shown = new Float32Array(cells);
  const bytes = new Uint8Array(cells);
  const texture = new DataTexture(bytes, vision.columns, vision.rows, RedFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  let version = -1;
  let reveal: boolean | null = null;
  let settling = true;

  return {
    texture,
    update(delta: number, revealAll: boolean) {
      if (vision.version !== version || revealAll !== reveal) {
        version = vision.version;
        reveal = revealAll;
        for (let i = 0; i < cells; i++) {
          target[i] = revealAll
            ? VISIBLE
            : (vision.counts[i] ?? 0) > 0
              ? VISIBLE
              : vision.explored[i]
                ? EXPLORED
                : UNEXPLORED;
        }
        settling = true;
      }
      if (!settling) return;
      const step = Math.min(1, delta * FADE_RATE);
      let moving = false;
      for (let i = 0; i < cells; i++) {
        const goal = target[i] as number;
        let value = shown[i] as number;
        if (value !== goal) {
          value += (goal - value) * step;
          if (Math.abs(goal - value) < 0.004) value = goal;
          else moving = true;
          shown[i] = value;
          bytes[i] = Math.round(value * 255);
        }
      }
      texture.needsUpdate = true;
      settling = moving;
    },
    dispose() {
      texture.dispose();
    },
  };
}

/**
 * Darkens the rendered scene by the fog: world position from depth, then the fog
 * texture at that point. Unexplored is black, explored is dim and greyish, visible is
 * untouched; outside the map grid (the border mountains) counts as explored, and the sky
 * (depth 1) is left alone. Tone mapping and the sRGB conversion happen here, as the scene
 * is rendered to a linear target first.
 */
function createFogMaterial(fog: DataTexture, vision: Vision) {
  const size = vision.columns * VISION_CELL;
  return new ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      tFog: { value: fog },
      uProjectionInverse: { value: null },
      uCameraWorld: { value: null },
      uGrid: { value: [vision.originX, vision.originZ, size, size] },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform sampler2D tFog;
      uniform mat4 uProjectionInverse;
      uniform mat4 uCameraWorld;
      uniform vec4 uGrid;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tColor, vUv);
        float depth = texture2D(tDepth, vUv).x;
        if (depth < 1.0) {
          vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          view /= view.w;
          vec3 world = (uCameraWorld * view).xyz;
          vec2 grid = (world.xz - uGrid.xy) / uGrid.zw;
          bool inside = all(greaterThanEqual(grid, vec2(0.0))) && all(lessThanEqual(grid, vec2(1.0)));
          float v = inside ? texture2D(tFog, grid).r : ${EXPLORED.toFixed(2)};
          // Black → dim (explored) → full light (visible); explored is also greyer.
          float light = v < 0.5 ? v * 0.9 : 0.45 + (v - 0.5) * 1.1;
          float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          color.rgb = mix(vec3(luma), color.rgb, smoothstep(0.35, 1.0, v)) * light;
        }
        gl_FragColor = color;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** The pass's GPU objects and its per-frame render (a plain object, outside React). */
function createFogPass(vision: Vision) {
  const fog = createFogTexture(vision);
  const material = createFogMaterial(fog.texture, vision);
  const uniforms = material.uniforms as Record<string, IUniform>;
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const screen = new Scene();
  screen.add(quad);
  const screenCamera = new OrthographicCamera();
  const depthTexture = new DepthTexture(1, 1);
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4, depthTexture });

  return {
    setSize(width: number, height: number) {
      target.setSize(width, height);
    },
    render(gl: WebGLRenderer, scene: Object3D, camera: Camera, delta: number, reveal: boolean) {
      fog.update(delta, reveal);
      (uniforms.tColor as IUniform).value = target.texture;
      (uniforms.tDepth as IUniform).value = depthTexture;
      (uniforms.uProjectionInverse as IUniform).value = camera.projectionMatrixInverse;
      (uniforms.uCameraWorld as IUniform).value = camera.matrixWorld;
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      gl.setRenderTarget(null);
      gl.render(screen, screenCamera);
    },
    dispose() {
      fog.dispose();
      material.dispose();
      quad.geometry.dispose();
      depthTexture.dispose();
      target.dispose();
    },
  };
}

/**
 * The fog of war over the whole scene: takes over rendering (frame priority 1), draws
 * the scene into a multisampled linear target with a depth texture, then the fog pass
 * to the screen. Covers every material at once (terrain, trees, buildings, ruins,
 * water). Units the player can't see are not drawn at all (see `UnitFrameDriver`).
 */
export function FogPass() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const pass = useMemo(() => {
    const vision = localVision();
    return vision ? createFogPass(vision) : null;
  }, []);

  useEffect(() => {
    const drawing = gl.getDrawingBufferSize(new Vector2());
    pass?.setSize(drawing.x, drawing.y);
  }, [gl, size, pass]);
  useEffect(() => () => pass?.dispose(), [pass]);

  useFrame(({ scene, camera }, delta) => {
    if (pass) pass.render(gl, scene, camera, delta, useSettingsStore.getState().revealMap);
    else gl.render(scene, camera);
  }, 1);

  return null;
}
