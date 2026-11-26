import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { addOverlay } from '../fog/overlay';
import { createMarkerPool } from './markerPool';

/**
 * Short acknowledgements of unit commands: converging chevrons on the ground for
 * moves, a pulsing footprint outline plus a hammer icon for construction sites.
 * Markers come from fixed pools (`createMarkerPool`) animated in `useFrame`; input
 * hands them over through `commandFeedback`, so nothing re-renders React. They are drawn
 * over the fog of war, so a click into unexplored ground is acknowledged too.
 */
export function CommandMarkers() {
  const pool = useMemo(() => createMarkerPool(), []);
  useEffect(() => {
    const removers = [pool.ground, ...pool.sprites].map(addOverlay);
    return () => {
      for (const remove of removers) remove();
      pool.dispose();
    };
  }, [pool]);
  useFrame(({ clock }) => pool.update(clock.elapsedTime));

  return (
    <>
      <primitive object={pool.ground} />
      {pool.sprites.map((sprite) => (
        <primitive key={sprite.id} object={sprite} />
      ))}
    </>
  );
}
