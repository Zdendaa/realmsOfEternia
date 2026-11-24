import { useEffect, useRef } from 'react';

export interface PointerTrack {
  x: number;
  y: number;
  /** False when the pointer has left the window. */
  inside: boolean;
  /** Any mouse button currently held. */
  pressed: boolean;
}

/**
 * Tracks the pointer in window coordinates for per-frame readers (edge scrolling).
 * Returns a ref, so it never triggers React re-renders.
 */
export function usePointerTracker() {
  const track = useRef<PointerTrack>({ x: 0, y: 0, inside: false, pressed: false });

  useEffect(() => {
    const t = track.current;
    const onMove = (event: PointerEvent) => {
      t.x = event.clientX;
      t.y = event.clientY;
      t.inside = true;
      t.pressed = event.buttons !== 0;
    };
    const onLeave = () => {
      t.inside = false;
    };
    const onButtons = (event: PointerEvent) => {
      t.pressed = event.buttons !== 0;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onButtons);
    window.addEventListener('pointerup', onButtons);
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onButtons);
      window.removeEventListener('pointerup', onButtons);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);

  return track;
}
