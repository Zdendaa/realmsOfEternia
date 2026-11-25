import type { HeightField } from '@roe/shared';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { createRangeRing } from './rangeRing';

/** A tower's range around a fixed spot. */
export function TowerRange({
  x,
  z,
  radius,
  heights,
}: {
  x: number;
  z: number;
  radius: number;
  heights: HeightField;
}) {
  const ring = useMemo(() => createRangeRing(), []);
  useLayoutEffect(() => ring.place(x, z, radius, heights), [ring, x, z, radius, heights]);
  useEffect(() => () => ring.dispose(), [ring]);
  return <primitive object={ring.mesh} />;
}
