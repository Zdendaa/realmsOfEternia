import { Suspense, useMemo } from 'react';
import type { World as WorldData } from '../../world/createWorld';
import { ATMOSPHERE } from './atmosphere';
import { Lighting } from './Lighting';
import { Paths } from './Paths';
import { Rocks } from './Rocks';
import { Settlement } from './settlement/Settlement';
import { Sky } from './Sky';
import { Terrain } from './Terrain';
import { Trees } from './Trees';

interface WorldProps {
  world: WorldData;
}

export function World({ world }: WorldProps) {
  const { trees, rocks } = useMemo(
    () => ({
      trees: world.decorations.filter((d) => d.kind === 'tree'),
      rocks: world.decorations.filter((d) => d.kind === 'rock'),
    }),
    [world],
  );

  return (
    <>
      <fog attach="fog" args={[ATMOSPHERE.skyHorizon, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar]} />
      <Sky />
      <Lighting />
      <Terrain map={world.map} heights={world.heights} />
      <Paths
        paths={world.paths}
        width={world.pathWidth}
        heights={world.heights}
        seed={world.map.seed}
      />
      <Trees items={trees} />
      <Rocks items={rocks} />
      <Suspense fallback={null}>
        <Settlement buildings={world.buildings} />
      </Suspense>
    </>
  );
}
