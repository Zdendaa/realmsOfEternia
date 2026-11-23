import { Instance, Instances } from '@react-three/drei';
import type { Decoration } from '@roe/shared';
import { useMemo } from 'react';
import { Color } from 'three';

const TRUNK_HEIGHT = 1.2;
const CROWN_HEIGHT = 3.2;
/** Sink trees slightly into the ground so they sit well on slopes. */
const GROUND_SINK = 0.15;
const CROWN_DARK = new Color('#1f4d27');
const CROWN_LIGHT = new Color('#3c7633');

interface TreesProps {
  items: readonly Decoration[];
}

/**
 * Placeholder conifers rendered as two instanced meshes (trunks + crowns).
 * Trees never move, so instance matrices are uploaded once (`frames={1}`).
 */
export function Trees({ items }: TreesProps) {
  const crownColors = useMemo(
    () => items.map((t) => CROWN_DARK.clone().lerp(CROWN_LIGHT, t.rotation / (Math.PI * 2))),
    [items],
  );

  return (
    <>
      <Instances limit={items.length} frames={1} castShadow receiveShadow frustumCulled={false}>
        <cylinderGeometry args={[0.18, 0.26, TRUNK_HEIGHT, 6]} />
        <meshStandardMaterial color="#5e4029" roughness={1} />
        {items.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, t.y - GROUND_SINK + (TRUNK_HEIGHT / 2) * t.scale, t.z]}
            scale={t.scale}
          />
        ))}
      </Instances>

      <Instances limit={items.length} frames={1} castShadow receiveShadow frustumCulled={false}>
        <coneGeometry args={[1.2, CROWN_HEIGHT, 7]} />
        <meshStandardMaterial roughness={0.9} flatShading />
        {items.map((t, i) => (
          <Instance
            key={i}
            position={[
              t.x,
              t.y - GROUND_SINK + (TRUNK_HEIGHT + CROWN_HEIGHT / 2 - 0.2) * t.scale,
              t.z,
            ]}
            rotation-y={t.rotation}
            scale={t.scale}
            color={crownColors[i]}
          />
        ))}
      </Instances>
    </>
  );
}
