import { BUILDINGS, isWall, type BuildingDefinition } from '@roe/game-data';
import { distanceToFootprint, footprintBounds, type HeightField } from '@roe/shared';
import { isStartingBuilding, toPlacedFootprint, type BuildingInstance, type Ruin } from '@roe/sim';
import { Suspense, useMemo } from 'react';
import type { ClientWorld } from '../../world/decorateWorld';
import { ConstructionSites, type SiteView } from '../construction/ConstructionSites';
import { ATMOSPHERE } from './atmosphere';
import { Deposits } from './Deposits';
import { GroundCover } from './GroundCover';
import { createGroundLevel, FLATTEN_REACH } from './groundLevel';
import { Lighting } from './Lighting';
import { Paths } from './Paths';
import { Rocks } from './Rocks';
import { FieldCrops, type CropField } from './settlement/FieldCrops';
import { ChimneySmoke } from './settlement/ChimneySmoke';
import { Settlement, type OwnedBuilding } from './settlement/Settlement';
import { SpinningParts, type AnimatedBuilding } from './settlement/SpinningParts';
import { Sky } from './Sky';
import { Ruins } from './Ruins';
import { exploredAt, useKnownBuildings } from '../fog/knowledge';
import { Stumps } from './Stumps';
import { Terrain } from './Terrain';
import { Trees } from './Trees';
import { Water } from './Water';
import { Walls } from '../walls/Walls';

interface WorldProps {
  world: ClientWorld;
  /** Current terrain: flattened under every building in the game state. */
  heights: HeightField;
  /** All buildings in the game state (starting settlement + placed ones). */
  buildings: readonly BuildingInstance[];
  /** Harvested trees and rocks (`GameState.resourceNodes`): depleted ones disappear. */
  resourceNodes: Readonly<Record<number, number>>;
  /** Destroyed buildings (`GameState.ruins`), drawn as rubble. */
  ruins: readonly Ruin[];
}

/** Renders the world for the current game state. Rendering only reads state. */
export function World({ world, heights, buildings, resourceNodes, ruins }: WorldProps) {
  const { trees, rocks } = useMemo(
    () => ({
      trees: world.decorations.filter((d) => d.kind === 'tree'),
      rocks: world.decorations.filter((d) => d.kind === 'rock'),
    }),
    [world],
  );

  // What the player knows (own buildings, others as last seen in the fog) is drawn; the
  // terrain and the cosmetic layers follow the real buildings.
  const known = useKnownBuildings();
  const exploredRuins = useMemo(
    () => ruins.filter((r) => exploredAt(r.x, r.z)),
    // Re-checked when the ruins or the known buildings (the vision) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruins, known],
  );
  // Finished buildings are instanced per model; sites get their own construction look.
  const placedBuildings = useMemo(
    () =>
      known
        .filter((b) => b.status === 'complete' && !isWall(b.type))
        .map((b): OwnedBuilding => ({
          ...toPlacedFootprint(b),
          definition: BUILDINGS[b.type],
          y: heights.getHeightAt(b.x, b.z),
          id: b.id,
          ownerId: b.ownerId,
        })),
    [known, heights],
  );
  // Complete buildings with a crop (fields) draw it per plot, by the state of the field.
  const cropFields = useMemo(
    () =>
      known
        .filter(
          (b) => b.status === 'complete' && (BUILDINGS[b.type] as BuildingDefinition).cropMesh,
        )
        .map((b): CropField => ({ building: b, y: heights.getHeightAt(b.x, b.z) })),
    [known, heights],
  );
  // Complete buildings that animate while their worker works (mill sails, bakery smoke).
  const animated = useMemo(
    () =>
      known
        .filter((b) => {
          const d = BUILDINGS[b.type] as BuildingDefinition;
          return (
            b.status === 'complete' && (d.spinningPart !== undefined || d.smokeFrom !== undefined)
          );
        })
        .map((b): AnimatedBuilding => ({ building: b, y: heights.getHeightAt(b.x, b.z) })),
    [known, heights],
  );
  const sites = useMemo(
    () =>
      known
        .filter((b) => b.status === 'construction' && !isWall(b.type))
        .map((b): SiteView => ({ building: b, y: heights.getHeightAt(b.x, b.z) })),
    [known, heights],
  );

  // Walls are drawn by their own instanced renderer, finished or not.
  const walls = useMemo(() => known.filter((b) => isWall(b.type)), [known]);

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
      <Deposits deposits={world.deposits} heights={heights} buildings={buildings} />
      <Rocks items={rocks} groundLevel={groundLevel} resourceNodes={resourceNodes} />
      <Suspense fallback={null}>
        <Settlement buildings={placedBuildings} props={props} />
        <Ruins ruins={exploredRuins} buildings={known} heights={heights} />
        <FieldCrops fields={cropFields} />
        <SpinningParts buildings={animated} />
        <Stumps
          trees={trees}
          resourceNodes={resourceNodes}
          groundLevel={groundLevel}
          blockers={playerFootprints}
        />
      </Suspense>
      <ChimneySmoke buildings={animated} />
      <ConstructionSites sites={sites} />
      <Walls walls={walls} heights={heights} />
    </>
  );
}
