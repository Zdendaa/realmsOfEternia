import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Raycaster, Vector2 } from 'three';
import { pickBuilding } from '../render/picking/pickBuilding';
import { useGameStore } from '../state/gameStore';
import { usePlacementStore } from '../state/placementStore';
import { useSelectionStore } from '../state/selectionStore';

/** A press that moves less than this (px) is a click. */
const CLICK_TOLERANCE = 5;

const raycaster = new Raycaster();
const ndc = new Vector2();

/**
 * Selection controls on the canvas: a left click selects the building under the mouse
 * (or clears the selection on empty ground), Esc clears it. Presses that start while the
 * construction tool is active belong to the placement input.
 */
export function useSelectionInput() {
  const element = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let press: { x: number; y: number; button: number; placing: boolean } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      const placing = usePlacementStore.getState().selected !== null;
      press = { x: event.clientX, y: event.clientY, button: event.button, placing };
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = press;
      press = null;
      if (!start || start.placing || start.button !== 0 || event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_TOLERANCE) return;

      const rect = element.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const { state, heights } = useGameStore.getState();
      const building = pickBuilding(raycaster.ray, state.buildings, heights);
      useSelectionStore.getState().selectBuilding(building?.id ?? null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && !usePlacementStore.getState().selected) {
        useSelectionStore.getState().clear();
      }
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [element, camera]);
}
