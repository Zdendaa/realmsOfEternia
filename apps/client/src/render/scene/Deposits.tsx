import {
  distanceToFootprint,
  type DepositDefinition,
  type DepositKind,
  type HeightField,
} from '@roe/shared';
import { toPlacedFootprint, type BuildingInstance } from '@roe/sim';
import { useEffect, useMemo } from 'react';
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  DodecahedronGeometry,
  MeshStandardMaterial,
  PlaneGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, prepare } from '../units/baked/propGeometry';
import { packMatrices } from './instanceData';
import { StaticInstances } from './StaticInstances';

/** Ground tint and vein color of each ore. */
const LOOK: Record<DepositKind, { ground: string; vein: string; rock: string }> = {
  gold: { ground: '#9c8446', vein: '#e2b53a', rock: '#6f6a62' },
  iron: { ground: '#7d5541', vein: '#b0603a', rock: '#5f5a55' },
};

/** The tinted patch reaches this far beyond the deposit radius, fading out. */
const PATCH_MARGIN = 2;
/** Marker rocks per deposit, placed on a ring inside the deposit. */
const ROCKS_PER_DEPOSIT = 5;

/**
 * A veined boulder in the style of the ore loads: dark rock with flecks of the ore color.
 * Unit size; instances scale it.
 */
function oreRock(kind: DepositKind): BufferGeometry {
  const { vein, rock } = LOOK[kind];
  const body = paint(new DodecahedronGeometry(0.6, 0), rock);
  body.scale(1.25, 0.75, 1);
  const fleck = (x: number, y: number, z: number, turn: number) => {
    const g = paint(new BoxGeometry(0.22, 0.12, 0.22), vein);
    g.rotateY(turn)
      .rotateX(turn * 0.5)
      .translate(x, y, z);
    return prepare(g);
  };
  return mergeGeometries([
    prepare(body),
    fleck(0.25, 0.32, 0.2, 0.4),
    fleck(-0.3, 0.26, 0.15, 1.2),
    fleck(0.05, 0.4, -0.25, 2.1),
    fleck(0.45, 0.1, -0.15, 0.8),
  ]);
}

/**
 * A ground patch over the deposit that follows the terrain: the ore's tint at the center,
 * fading to transparent at the edge (vertex alpha).
 */
function patchGeometry(deposit: DepositDefinition, heights: HeightField): BufferGeometry {
  const reach = deposit.radius + PATCH_MARGIN;
  const geometry = new PlaneGeometry(reach * 2, reach * 2, 16, 16).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 4);
  const tint = new Color(LOOK[deposit.kind].ground);
  for (let i = 0; i < position.count; i++) {
    const x = deposit.x + position.getX(i);
    const z = deposit.z + position.getZ(i);
    position.setXYZ(i, x, heights.getHeightAt(x, z) + 0.05, z);
    const d = Math.hypot(position.getX(i) - deposit.x, position.getZ(i) - deposit.z) / reach;
    const alpha = d >= 1 ? 0 : 0.75 * (1 - d * d);
    colors.set([tint.r, tint.g, tint.b, alpha], i * 4);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}

interface DepositsProps {
  deposits: readonly DepositDefinition[];
  heights: HeightField;
  buildings: readonly BuildingInstance[];
}

/**
 * Marks ore deposits so players see where mines go: a tinted ground patch and a few
 * veined rocks per deposit. The rocks disappear once a building (its mine) covers the
 * deposit's center; the patch stays under it. Cosmetic only.
 */
export function Deposits({ deposits, heights, buildings }: DepositsProps) {
  const rockGeometry = useMemo(
    () => ({ gold: oreRock('gold'), iron: oreRock('iron') }) as Record<DepositKind, BufferGeometry>,
    [],
  );
  const rockMaterial = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
    [],
  );
  const patchMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    [],
  );
  const patches = useMemo(
    () => deposits.map((d) => patchGeometry(d, heights)),
    [deposits, heights],
  );
  useEffect(() => () => patches.forEach((p) => p.dispose()), [patches]);
  useEffect(
    () => () => {
      rockGeometry.gold.dispose();
      rockGeometry.iron.dispose();
      rockMaterial.dispose();
      patchMaterial.dispose();
    },
    [rockGeometry, rockMaterial, patchMaterial],
  );

  // Marker rocks of free deposits, per ore kind.
  const rockMatrices = useMemo(() => {
    const free = deposits.filter(
      (d) => !buildings.some((b) => distanceToFootprint(toPlacedFootprint(b), d.x, d.z) === 0),
    );
    const byKind = (kind: DepositKind) =>
      free
        .filter((d) => d.kind === kind)
        .flatMap((d) =>
          Array.from({ length: ROCKS_PER_DEPOSIT }, (_, i) => {
            const angle = (i / ROCKS_PER_DEPOSIT) * Math.PI * 2 + d.x * 0.37;
            const ring = d.radius * (0.35 + 0.3 * ((i * 7) % 3));
            const x = d.x + Math.cos(angle) * ring;
            const z = d.z + Math.sin(angle) * ring;
            return { x, z, y: heights.getHeightAt(x, z), size: 0.7 + ((i * 5) % 4) * 0.18, angle };
          }),
        );
    const pack = (kind: DepositKind) =>
      packMatrices(byKind(kind), (r) => ({
        position: [r.x, r.y + 0.12 * r.size, r.z],
        rotation: [0, r.angle * 2.3, 0],
        scale: r.size,
      }));
    return { gold: pack('gold'), iron: pack('iron') };
  }, [deposits, buildings, heights]);

  return (
    <>
      {patches.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={patchMaterial} receiveShadow />
      ))}
      {(['gold', 'iron'] as const).map((kind) =>
        rockMatrices[kind].length > 0 ? (
          <StaticInstances
            key={`${kind}-${rockMatrices[kind].length}`}
            geometry={rockGeometry[kind]}
            material={rockMaterial}
            matrices={rockMatrices[kind]}
          />
        ) : null,
      )}
    </>
  );
}
