import { BUILDINGS, type BuildingDefinition } from '@roe/game-data';
import { distanceToFootprint, footprintBounds, type HeightField } from '@roe/shared';
import {
  isStartingBuilding,
  toPlacedFootprint,
  type BuildingInstance,
  type PlacedBuilding,
} from '@roe/sim';
import { Suspense, useMemo } from 'react';
import type { ClientWorld } from '../../world/decorateWorld';
import { ConstructionSites, type SiteView } from '../construction/ConstructionSites';
import { ATMOSPHERE } from './atmosphere';
import { GroundCover } from './GroundCover';
import { createGroundLevel, FLATTEN_REACH } from './groundLevel';
import { Lighting } from './Lighting';
import { Paths } from './Paths';
import { Rocks } from './Rocks';
import { FieldCrops, type CropField } from './settlement/FieldCrops';
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
  /** Harvested trees and rocks (`GameState.resourceNodes`): depleted ones disappear. */
  resourceNodes: Readonly<Record<number, number>>;
}

/** Renders the world for the current game state. Rendering only reads state. */
export function World({ world, heights, buildings, resourceNodes }: WorldProps) {
  const { trees, rocks } = useMemo(
    () => ({
      trees: world.decorations.filter((d) => d.kind === 'tree'),
      rocks: world.decorations.filter((d) => d.kind === 'rock'),
    }),
    [world],
  );

  // Finished buildings are instanced per model; sites get their own construction look.
  const placedBuildings = useMemo(
    () =>
      buildings
        .filter((b) => b.status === 'complete')
        .map((b): PlacedBuilding => ({
          ...toPlacedFootprint(b),
          definition: BUILDINGS[b.type],
          y: heights.getHeightAt(b.x, b.z),
        })),
    [buildings, heights],
  );
  // Complete buildings with a crop (fields) draw it per plot, by the state of the field.
  const cropFields = useMemo(
    () =>
      buildings
        .filter(
          (b) => b.status === 'complete' && (BUILDINGS[b.type] as BuildingDefinition).cropMesh,
        )
        .map((b): CropField => ({ building: b, y: heights.getHeightAt(b.x, b.z) })),
    [buildings, heights],
  );
  const sites = useMemo(
    () =>
      buildings
        .filter((b) => b.status === 'construction')
        .map((b): SiteView => ({ building: b, y: heights.getHeightAt(b.x, b.z) })),
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
      <Trees items={trees} groundLevel={groundLevel} resourceNodes={resourceNodes} />
      <Rocks items={rocks} groundLevel={groundLevel} resourceNodes={resourceNodes} />
      <Suspense fallback={null}>
        <Settlement buildings={placedBuildings} props={props} />
        <FieldCrops fields={cropFields} />
      </Suspense>
      <ConstructionSites sites={sites} />
    </>
  );
}
