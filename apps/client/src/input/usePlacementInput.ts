import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useGameStore } from '../state/gameStore';
import { usePlacementStore } from '../state/placementStore';

/** A press that moves less than this (px) is a click; more is a camera drag. */
const CLICK_TOLERANCE = 5;

/**
 * Placement controls on the canvas: left click builds (Shift keeps the tool active),
 * right click cancels, R rotates. Drags still pan/rotate the camera, because a click
 * is only recognized when the pointer barely moved.
 */
export function usePlacementInput() {
  const element = useThree((s) => s.gl.domElement);

  useEffect(() => {
    let press: { x: number; y: number; button: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      press = { x: event.clientX, y: event.clientY, button: event.button };
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = press;
      press = null;
      if (!start || start.button !== event.button) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_TOLERANCE) return;

      const placement = usePlacementStore.getState();
      if (!placement.selected) return;
      if (event.button === 2) {
        placement.select(null);
        return;
      }
      if (event.button !== 0 || !placement.candidate || !placement.feedback?.ok) return;
      const result = useGameStore.getState().dispatch(placement.candidate);
      if (result.ok && !event.shiftKey) placement.select(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyR' || event.repeat || event.target instanceof HTMLInputElement) return;
      const placement = usePlacementStore.getState();
      if (placement.selected) placement.rotate();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [element]);
}
