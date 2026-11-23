interface TerrainProps {
  /** Width and depth of the playable area. */
  size: number;
}

/** Flat placeholder ground. Will later be replaced by a heightmap-based terrain. */
export function Terrain({ size }: TerrainProps) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#5f8f3e" roughness={1} />
      </mesh>
      {/* Darker surroundings outside the playable area. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#45692e" roughness={1} />
      </mesh>
    </group>
  );
}
