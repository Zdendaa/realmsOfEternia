import { useFrame } from '@react-three/fiber';
import { abilityOf, UNITS } from '@roe/game-data';
import { abilityIssue, footprintOf } from '@roe/sim';
import { useEffect, useMemo } from 'react';
import type { Camera, MeshBasicMaterial } from 'three';
import { judgeAim, ownHero } from '../../input/abilityAim';
import { pickPointerTarget } from '../../input/pointerTarget';
import { usePointerTracker, type PointerTrack } from '../../input/usePointerTracker';
import { useCommandModeStore } from '../../state/commandModeStore';
import { useGameStore } from '../../state/gameStore';
import { usePlacementStore } from '../../state/placementStore';
import { useSelectionStore } from '../../state/selectionStore';
import { addOverlay } from '../fog/overlay';
import { createRangeRing } from './rangeRing';

const VALID = '#ffe08a';
const INVALID = '#ff4a38';
const RANGE = '#f4efdc';

/** The two rings of aiming and their per-frame update (a plain object, outside React). */
function createAimRings() {
  /** The area the ability would affect, under the mouse. */
  const area = createRangeRing();
  /** How far the hero can cast, around the hero. */
  const range = createRangeRing(RANGE);
  (range.mesh.material as MeshBasicMaterial).opacity = 0.4;
  area.mesh.visible = false;
  range.mesh.visible = false;
  // Aiming into the fog must show too: both are drawn over it, and over anything else.
  for (const ring of [area, range]) (ring.mesh.material as MeshBasicMaterial).depthTest = false;

  const hide = () => {
    area.mesh.visible = false;
    range.mesh.visible = false;
  };
  return {
    meshes: [area.mesh, range.mesh],
    update(element: HTMLElement, camera: Camera, pointer: PointerTrack) {
      const modes = useCommandModeStore.getState();
      const { aim } = modes;
      if (!aim) return hide();
      const { state, heights } = useGameStore.getState();
      const hero = ownHero(aim.unitId);
      // Aiming ends with the hero (dead, deselected), its readiness, or on building.
      if (
        !hero ||
        !useSelectionStore.getState().units.includes(aim.unitId) ||
        abilityIssue(hero, aim.ability, state.tick) ||
        usePlacementStore.getState().selected
      ) {
        modes.setMode(null);
        return hide();
      }
      const ability = abilityOf(aim.ability);
      // A building's range is measured from the hero's edge, a point's from its center.
      const reach = ability.range + (ability.target === 'building' ? UNITS[hero.type].radius : 0);
      range.show(reach, hero.x, hero.z, heights);

      const result = pointer.inside
        ? judgeAim(hero, aim.ability, pickPointerTarget(element, camera, pointer.x, pointer.y))
        : null;
      modes.setFeedback(result);
      if (!result) {
        area.mesh.visible = false;
        return;
      }
      const footprint =
        result.building && footprintOf(result.building.type, result.building.rotation);
      const radius = footprint
        ? Math.hypot(footprint.w, footprint.d) / 2 + 0.2
        : ability.radius || 1;
      area.show(radius, result.center.x, result.center.z, heights);
      (area.mesh.material as MeshBasicMaterial).color.set(result.ok ? VALID : INVALID);
    },
    dispose() {
      area.dispose();
      range.dispose();
    },
  };
}

/**
 * While an aimed ability waits for its target: a ring of its radius under the mouse
 * (red when a click wouldn't cast) and a faint ring of its range around the hero.
 */
export function AbilityAimPreview() {
  const rings = useMemo(() => createAimRings(), []);
  useEffect(() => {
    const removed = rings.meshes.map((mesh) => addOverlay(mesh));
    return () => {
      for (const remove of removed) remove();
      rings.dispose();
    };
  }, [rings]);
  const pointer = usePointerTracker();
  useFrame(({ gl, camera }) => rings.update(gl.domElement, camera, pointer.current));

  return (
    <>
      {rings.meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
