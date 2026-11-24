import { DoubleSide, ShaderMaterial } from 'three';

/** Marker kinds, as stored in the `aMarker.y` instance attribute. */
export const MARKER_KIND = { move: 0, site: 1 } as const;

/** Lifetimes in seconds, per kind. */
export const MARKER_DURATION = { move: 0.6, site: 1.1 } as const;

/**
 * Ground markers drawn procedurally on an instanced unit quad (XZ plane, scaled per
 * instance). Per instance: `aMarker` = (start time, kind, size x, size z) and `aColor`.
 * - move: four chevrons slide in to the point while a ring closes and fades.
 * - site: an outline shrinks onto the footprint and pulses, over a fading fill.
 * Finished instances are discarded in the fragment shader.
 */
export function createMarkerMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMoveDuration: { value: MARKER_DURATION.move },
      uSiteDuration: { value: MARKER_DURATION.site },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aMarker;
      attribute vec3 aColor;
      varying vec2 vLocal;
      varying vec4 vMarker;
      varying vec3 vColor;
      void main() {
        vLocal = (uv - 0.5) * aMarker.zw;
        vMarker = aMarker;
        vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uMoveDuration;
      uniform float uSiteDuration;
      varying vec2 vLocal;
      varying vec4 vMarker;
      varying vec3 vColor;

      float band(float d, float halfWidth) {
        float aa = fwidth(d);
        return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(d));
      }

      float easeOut(float t) { return 1.0 - pow(1.0 - t, 3.0); }

      // Chevrons converging on the center, a closing ring and a center dot.
      float moveMarker(vec2 p, float radius, float t) {
        float e = easeOut(t);
        // Fold into one octant: q.x along the nearest axis, q.y sideways from it.
        vec2 a = abs(p);
        vec2 q = vec2(max(a.x, a.y), min(a.x, a.y));
        // Starts at 0.7 of the radius, so the outward arms (0.3 long) stay inside the quad.
        float tip = mix(radius * 0.7, radius * 0.14, e);
        // A "V" opening outwards with its tip at q.x = tip: points on x = tip + y.
        float chevron = band((q.x - tip - q.y) * 0.7071, 0.075) * step(q.y, 0.3) * step(tip - 0.05, q.x);
        float chevronAlpha = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.7, 1.0, t));
        float ring = band(length(p) - mix(radius * 0.6, radius * 0.2, e), 0.05) * (1.0 - t);
        float dot = (1.0 - smoothstep(0.09, 0.13, length(p))) * (1.0 - smoothstep(0.5, 1.0, t));
        return max(max(chevron * chevronAlpha, ring), dot);
      }

      // An outline shrinking onto the footprint, pulsing twice, over a soft fill.
      float siteMarker(vec2 p, vec2 size, float t) {
        float e = easeOut(min(t * 2.0, 1.0));
        // The quad is the footprint + 1.2 per side; the outline ends 0.2 outside the footprint.
        vec2 halfSize = size * 0.5 - 1.0 + (1.0 - e) * 0.8;
        vec2 d = abs(p) - halfSize;
        float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        float pulse = 0.65 + 0.35 * cos(t * 12.566);
        float fade = 1.0 - smoothstep(0.6, 1.0, t);
        float outline = band(sd, 0.14) * pulse * fade;
        float fill = step(sd, 0.0) * 0.18 * (1.0 - t);
        return max(outline, fill);
      }

      void main() {
        bool isMove = vMarker.y < 0.5;
        float t = (uTime - vMarker.x) / (isMove ? uMoveDuration : uSiteDuration);
        if (t < 0.0 || t >= 1.0) discard;
        float alpha = isMove ? moveMarker(vLocal, vMarker.z * 0.5, t) : siteMarker(vLocal, vMarker.zw, t);
        if (alpha < 0.01) discard;
        // Brightened player color so it reads on grass and dirt.
        gl_FragColor = vec4(mix(vColor * 1.4, vec3(1.0), 0.25), alpha * 0.95);
        #include <colorspace_fragment>
      }
    `,
  });
}
