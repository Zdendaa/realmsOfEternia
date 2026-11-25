import { useGLTF } from '@react-three/drei';
import { CHARACTER_PACK, towerOf, type TowerDefinition } from '@roe/game-data';
import type { HeightField } from '@roe/shared';
import type { BuildingInstance } from '@roe/sim';
import { Suspense, useEffect, useMemo } from 'react';
import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from 'three';
import { packMatrices } from '../scene/instanceData';
import { ModelInstances } from '../scene/settlement/ModelInstances';
import { publicUrl } from '../scene/settlement/modelAssets';
import { StaticInstances } from '../scene/StaticInstances';

/**
 * Props on top of the special towers, so their types can be told apart: a crossbow, a
 * glowing orb or a burning brazier. Temporary stand-ins until the towers have models of
 * their own.
 */

type Kind = NonNullable<TowerDefinition['topper']>['kind'];

const CROSSBOW = `${CHARACTER_PACK.dir}accessories/crossbow_2handed.glb`;
useGLTF.preload(publicUrl(CROSSBOW), false);
/** The accessory is hand-sized: this big it reads from the game camera. */
const CROSSBOW_SCALE = 2.4;
/** Brings the middle of the model (it is held near one end) over the tower. */
const CROSSBOW_CENTER = new Matrix4().makeTranslation(0, 0.17, -0.44);

interface Spot {
  x: number;
  y: number;
  z: number;
  rotation: number;
}

interface Piece {
  geometry: () => BufferGeometry;
  material: Material;
}

/** The primitive pieces of a topper, each drawn instanced. */
const PIECES: Record<Exclude<Kind, 'crossbow'>, Piece[]> = {
  orb: [
    {
      geometry: () => new IcosahedronGeometry(0.55, 1).translate(0, 0.75, 0),
      material: new MeshBasicMaterial({ color: '#c9a2ff', toneMapped: false }),
    },
  ],
  brazier: [
    {
      geometry: () => new CylinderGeometry(0.75, 0.45, 0.45, 8).translate(0, 0.22, 0),
      material: new MeshStandardMaterial({ color: '#3b3431', roughness: 0.8, flatShading: true }),
    },
    {
      geometry: () => new ConeGeometry(0.55, 1.3, 7).translate(0, 1.05, 0),
      material: new MeshBasicMaterial({ color: '#ff8a1f', toneMapped: false }),
    },
  ],
};

function PrimitivePiece({ piece, spots }: { piece: Piece; spots: readonly Spot[] }) {
  const geometry = useMemo(() => piece.geometry(), [piece]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const matrices = useMemo(
    () => packMatrices(spots, (s) => ({ position: [s.x, s.y, s.z], scale: 1 })),
    [spots],
  );
  return (
    <StaticInstances
      geometry={geometry}
      material={piece.material}
      matrices={matrices}
      castShadow={false}
    />
  );
}

export function TowerToppers({
  towers,
  heights,
}: {
  /** Finished towers the player knows about. */
  towers: readonly BuildingInstance[];
  heights: HeightField;
}) {
  const byKind = useMemo(() => {
    const groups = new Map<Kind, Spot[]>();
    for (const tower of towers) {
      const topper = towerOf(tower.type)?.topper;
      if (!topper) continue;
      const spot = {
        x: tower.x,
        y: heights.getHeightAt(tower.x, tower.z) + topper.height,
        z: tower.z,
        rotation: tower.rotation,
      };
      const group = groups.get(topper.kind);
      if (group) group.push(spot);
      else groups.set(topper.kind, [spot]);
    }
    return [...groups];
  }, [towers, heights]);

  return (
    <Suspense fallback={null}>
      {byKind.map(([kind, spots]) =>
        kind === 'crossbow' ? (
          <ModelInstances
            key={`${kind}:${spots.length}`}
            modelPath={CROSSBOW}
            instances={spots.map((s) => ({
              ...s,
              scale: CROSSBOW_SCALE,
              local: CROSSBOW_CENTER,
            }))}
          />
        ) : (
          PIECES[kind].map((piece, i) => (
            <PrimitivePiece key={`${kind}:${i}:${spots.length}`} piece={piece} spots={spots} />
          ))
        ),
      )}
    </Suspense>
  );
}
