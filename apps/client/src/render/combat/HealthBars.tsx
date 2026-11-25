import { useFrame } from '@react-three/fiber';
import { BUILDINGS, CHARACTER_PACK, combatOf, type UnitKind } from '@roe/game-data';
import { buildingMaxHealth } from '@roe/sim';
import type { EntityId } from '@roe/shared';
import { useEffect, useMemo, useRef } from 'react';
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useSettingsStore } from '../../state/settingsStore';
import { renderedUnitList } from '../units/renderedUnits';

/** Most bars drawn at once. */
const CAPACITY = 1024;
/** Bar size in world units; it faces the camera. */
const BAR_WIDTH = 1.0;
const BAR_HEIGHT = 0.13;
/** Gap between the top of the head and the bar. */
const BAR_GAP = 0.35;
/** Building bars are this much wider, and float this high (world units) above the ground. */
const BUILDING_BAR_SCALE = 3;
const BUILDING_BAR_HEIGHT = 6.5;

/** Standing height (world units) of each kind, for placing its bar above the head. */
function heightOf(kind: UnitKind): number {
  const soldier = (
    CHARACTER_PACK.soldiers as Partial<Record<UnitKind, { height: number; scale: number }>>
  )[kind];
  const model = soldier ?? CHARACTER_PACK.serf;
  return model.height * model.scale;
}

const matrix = new Matrix4();

/**
 * Billboarded bars: the instance matrix only places the bar (translation); the vertex
 * shader spreads the quad in view space so it always faces the camera. Per instance
 * `aBar` = (health fraction, 1 for the local player's units / 0 for others). The fill is
 * green → yellow → red with the health; own bars have a light frame, others a red one.
 */
function createBarMaterial() {
  return new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    uniforms: { uSize: { value: [BAR_WIDTH, BAR_HEIGHT] } },
    vertexShader: /* glsl */ `
      uniform vec2 uSize;
      attribute vec2 aBar;
      varying vec2 vUv;
      varying vec2 vBar;
      void main() {
        vUv = uv;
        vBar = aBar;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // The instance's X scale widens the bar (buildings); the rest only places it.
        float widen = length(instanceMatrix[0].xyz);
        center.xy += position.xy * uSize * vec2(widen, 1.0);
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec2 vBar;
      void main() {
        float fill = vBar.x;
        vec2 px = vec2(${(0.035 / BAR_WIDTH).toFixed(4)}, 0.18);
        bool frame = vUv.x < px.x || vUv.x > 1.0 - px.x || vUv.y < px.y || vUv.y > 1.0 - px.y;
        vec3 frameColor = vBar.y > 0.5 ? vec3(0.92, 0.88, 0.75) : vec3(0.75, 0.2, 0.16);
        vec3 healthColor = fill > 0.5
          ? mix(vec3(0.95, 0.8, 0.2), vec3(0.3, 0.8, 0.3), (fill - 0.5) * 2.0)
          : mix(vec3(0.85, 0.2, 0.15), vec3(0.95, 0.8, 0.2), fill * 2.0);
        vec3 color = frame ? frameColor : (vUv.x <= fill ? healthColor : vec3(0.08, 0.07, 0.06));
        gl_FragColor = vec4(color, frame ? 0.95 : 0.85);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** The bars' GPU objects and their per-frame update (a plain object, outside React). */
function createHealthBars() {
  const geometry = new PlaneGeometry(1, 1);
  const material = createBarMaterial();
  const bars = new InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2);
  bars.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aBar', bars);
  const mesh = new InstancedMesh(geometry, material, CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  const values = bars.array as Float32Array;

  // Lookups rebuilt only when their source arrays change (once per tick at most).
  let unitsRef: unknown = null;
  let health = new Map<EntityId, number>();
  let selectionRef: unknown = null;
  let selected = new Set<EntityId>();

  return {
    mesh,
    /** Writes this frame's bars; `all`: show them for every living unit. */
    update(all: boolean) {
      const units = useGameStore.getState().state.units;
      if (unitsRef !== units) {
        unitsRef = units;
        health = new Map(units.map((u) => [u.id, u.health]));
      }
      const selection = useSelectionStore.getState().units;
      if (selectionRef !== selection) {
        selectionRef = selection;
        selected = new Set(selection);
      }
      let count = 0;
      for (const unit of renderedUnitList) {
        if (count >= CAPACITY) break;
        if (unit.deathElapsed !== null || unit.inside) continue;
        const max = combatOf(unit.type).health;
        const left = health.get(unit.id) ?? max;
        if (!all && left >= max && !selected.has(unit.id)) continue;
        matrix.makeTranslation(unit.x, unit.y + heightOf(unit.type) + BAR_GAP, unit.z);
        mesh.setMatrixAt(count, matrix);
        values[count * 2] = Math.max(0, left / max);
        values[count * 2 + 1] = unit.ownerId === LOCAL_PLAYER ? 1 : 0;
        count++;
      }
      // Damaged buildings and construction sites (or all of them while showing every bar).
      const { state, heights } = useGameStore.getState();
      for (const building of state.buildings) {
        if (count >= CAPACITY) break;
        const damage = state.buildingDamage[building.id] ?? 0;
        if (damage === 0 && !(all && building.ownerId !== null)) continue;
        const max = buildingMaxHealth(building, state.construction[building.id]);
        const { w, d } = BUILDINGS[building.type].footprint;
        const lift = Math.min(BUILDING_BAR_HEIGHT, Math.max(w, d));
        matrix.makeScale(BUILDING_BAR_SCALE, 1, 1);
        matrix.setPosition(
          building.x,
          heights.getHeightAt(building.x, building.z) + lift,
          building.z,
        );
        mesh.setMatrixAt(count, matrix);
        values[count * 2] = Math.max(0, (max - damage) / max);
        values[count * 2 + 1] = building.ownerId === LOCAL_PLAYER ? 1 : 0;
        count++;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        bars.needsUpdate = true;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Health bars over units, one instanced mesh (one draw call). A bar shows when the unit
 * is hurt, selected, or (while Alt is held, or with the "All health bars" setting) for
 * every living unit. Written every frame from the rendered units; nothing re-renders React.
 */
export function HealthBars() {
  const bars = useMemo(() => createHealthBars(), []);
  const alt = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      alt.current = event.altKey;
    };
    const onBlur = () => {
      alt.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      bars.dispose();
    };
  }, [bars]);

  useFrame(() => bars.update(alt.current || useSettingsStore.getState().allHealthBars));

  return <primitive object={bars.mesh} />;
}
