import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Matrix4 } from 'three';
import { useGameStore } from '../state/gameStore';
import { useCommandModeStore } from '../state/commandModeStore';
import { usePlacementStore } from '../state/placementStore';
import { useSelectionStore } from '../state/selectionStore';
import { cursorFor, type CursorKind } from './cursorKind';
import { pickPointerTarget } from './pointerTarget';
import { selectionKinds } from './selectionKinds';

interface Hover {
  x: number;
  y: number;
  /** The pointer is over the canvas itself (not the HUD, not outside the window). */
  inside: boolean;
  /** A mouse button is held: drags keep the cursor they started with. */
  pressed: boolean;
}

/**
 * Sets the canvas cursor from what's under the pointer, with the same pick as the
 * click handlers (`pickPointerTarget`). Picks at most once per frame, and only when
 * the pointer, the camera, the game state or the selection changed. The cursor is a
 * `data-cursor` attribute, written only when it changes; CSS maps it to an image.
 */
export function useHoverCursor() {
  const element = useThree((s) => s.gl.domElement);
  const hover = useRef<Hover>({ x: 0, y: 0, inside: false, pressed: false });
  const last = useRef({
    x: NaN,
    y: NaN,
    camera: new Matrix4(),
    state: null as unknown,
    selection: null as unknown,
    placing: false,
    mode: null as unknown,
    feedback: null as unknown,
    cursor: '' as CursorKind | '',
  });

  useEffect(() => {
    const h = hover.current;
    const onMove = (event: PointerEvent) => {
      h.x = event.clientX;
      h.y = event.clientY;
      h.inside = true;
      h.pressed = event.buttons !== 0;
    };
    const onLeave = () => {
      h.inside = false;
    };
    const onButtons = (event: PointerEvent) => {
      h.pressed = event.buttons !== 0;
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onButtons);
    window.addEventListener('pointerup', onButtons);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onButtons);
      window.removeEventListener('pointerup', onButtons);
      element.removeAttribute('data-cursor');
    };
  }, [element]);

  // The canvas comes from the frame state: it is the same element as `element` above.
  useFrame(({ camera, gl }) => {
    const h = hover.current;
    const l = last.current;
    if (!h.inside || h.pressed) return;
    const state = useGameStore.getState().state;
    const selection = useSelectionStore.getState().units;
    const placing = usePlacementStore.getState().selected !== null;
    const { mode, feedback } = useCommandModeStore.getState();
    const unchanged =
      h.x === l.x &&
      h.y === l.y &&
      state === l.state &&
      selection === l.selection &&
      placing === l.placing &&
      mode === l.mode &&
      feedback === l.feedback &&
      camera.matrixWorld.equals(l.camera);
    if (unchanged) return;
    l.x = h.x;
    l.y = h.y;
    l.state = state;
    l.selection = selection;
    l.placing = placing;
    l.mode = mode;
    l.feedback = feedback;
    l.camera.copy(camera.matrixWorld);

    let cursor: CursorKind = 'default';
    // The construction tool shows its own ghost; keep the plain pointer for it.
    if (mode === 'ability') cursor = feedback?.ok === false ? 'blocked' : 'aim';
    else if (!placing) {
      const target = pickPointerTarget(gl.domElement, camera, h.x, h.y);
      cursor = cursorFor(target, selectionKinds(selection), mode === 'attackMove');
    }
    if (cursor !== l.cursor) {
      l.cursor = cursor;
      gl.domElement.dataset.cursor = cursor;
    }
  });
}
