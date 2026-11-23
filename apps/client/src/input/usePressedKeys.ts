import { useEffect, useRef } from 'react';

function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(target.type)
  );
}

/**
 * Tracks currently held keyboard keys (by `KeyboardEvent.code`).
 * Returns a ref so per-frame readers don't trigger React re-renders.
 */
export function usePressedKeys() {
  const pressed = useRef(new Set<string>());

  useEffect(() => {
    const keys = pressed.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTypingTarget(event.target)) keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const onBlur = () => keys.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return pressed;
}
