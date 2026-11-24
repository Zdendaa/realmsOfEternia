import { useEffect, useRef } from 'react';
import { dragBox } from './dragBox';

/** Overlay for box selection; positioned by the selection input through `dragBox`. */
export function SelectionBox() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dragBox.attach(ref.current);
    return () => dragBox.attach(null);
  }, []);
  return <div ref={ref} className="drag-box" aria-hidden="true" />;
}
