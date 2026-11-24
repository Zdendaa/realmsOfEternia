import { BUILDINGS } from '@roe/game-data';
import { distanceToFootprint, footprintBounds, type HeightField } from '@roe/shared';
import {
  isStartingBuilding,
  toPlacedFootprint,
  type BuildingInstance,
  type PlacedBuilding,
} from '@roe/sim';
import { Suspense, useMemo } from 'react';
import type { ClientWorld } from '../../world/decorateWorld';
import { ATMOSPHERE } from './atmosphere';
import { GroundCover } from './GroundCover';
import { createGroundLevel, FLATTEN_REACH } from './groundLevel';
import { Lighting } from './Lighting';
import { Paths } from './Paths';
import { Rocks } from './Rocks';
import { Settlement } from './settlement/Settlement';
import { Sky } from './Sky';
import { Terrain } from './Terrain';
import { Trees } from './Trees';
import { Water } from './Water';

interface WorldProps {
  world: ClientWorld;
  /** Current terrain: flattened under every building in the game state. */
  heights: HeightField;
  /** All buildings in the game state (starting settlement + placed ones). */
  buildings: readonly BuildingInstance[];
}

/** Renders the world for the current game state. Rendering only reads state. */
export function World({ world, heights, buildings }: WorldProps) {
  const { trees, rocks } = useMemo(
    () => ({
      trees: world.decorations.filter((d) => d.kind === 'tree'),
      rocks: world.decorations.filter((d) => d.kind === 'rock'),
    }),
    [world],
  );

  const placedBuildings = useMemo(
    () =>
      buildings.map((b): PlacedBuilding => ({
        ...toPlacedFootprint(b),
        definition: BUILDINGS[b.type],
        y: heights.getHeightAt(b.x, b.z),
      })),
    [buildings, heights],
  );

  // Buildings placed by players: cosmetic layers (grass, props) are cleared under them.
  const playerFootprints = useMemo(
    () => buildings.filter((b) => !isStartingBuilding(world, b)).map(toPlacedFootprint),
    [world, buildings],
  );
  // Terrain only changes near player buildings (footprint + flatten reach).
  const groundLevel = useMemo(
    () =>
      createGroundLevel(
        heights,
        playerFootprints.map((f) => footprintBounds(f, FLATTEN_REACH)),
      ),
    [heights, playerFootprints],
  );
  const props = useMemo(
    () =>
      world.props
        .filter((p) => !playerFootprints.some((f) => distanceToFootprint(f, p.x, p.z, 0.5) === 0))
        .map((p) => ({ ...p, y: groundLevel.at(p.x, p.z, p.y) })),
    [world, playerFootprints, groundLevel],
  );

  return (
    <>
      <fog attach="fog" args={[ATMOSPHERE.skyHorizon, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar]} />
      <Sky />
      <Lighting />
      <Terrain
        map={world.map}
        heights={heights}
        buildings={buildings}
        wornPatches={world.wornPatches}
        lakes={world.water.lakes}
      />
      <Water lakes={world.water.lakes} heights={heights} />
      <Paths paths={world.paths} width={world.pathWidth} heights={heights} seed={world.map.seed} />
      <GroundCover
        cover={world.groundCover}
        groundLevel={groundLevel}
        blockers={playerFootprints}
      />
      <Trees items={trees} groundLevel={groundLevel} />
      <Rocks items={rocks} groundLevel={groundLevel} />
      <Suspense fallback={null}>
        <Settlement buildings={placedBuildings} props={props} />
      </Suspense>
    </>
  );
}
