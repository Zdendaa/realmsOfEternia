import { Instance, Instances } from '@react-three/drei';
import type { Decoration } from '@roe/shared';

interface RocksProps {
  items: readonly Decoration[];
}

/** Placeholder boulders rendered as a single instanced mesh. */
export function Rocks({ items }: RocksProps) {
  return (
    <Instances limit={items.length} frames={1} castShadow receiveShadow frustumCulled={false}>
      <dodecahedronGeometry args={[0.8, 0]} />
      <meshStandardMaterial color="#8a8a84" roughness={0.95} flatShading />
      {items.map((r, i) => (
        <Instance
          key={i}
          position={[r.x, r.y + 0.3 * r.scale - 0.1, r.z]}
          rotation={[r.rotation * 0.3, r.rotation, 0]}
          scale={[r.scale * 1.3, r.scale * 0.75, r.scale]}
        />
      ))}
    </Instances>
  );
}
