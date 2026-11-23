import { scatterDecorations, type HeightField, type MapDefinition } from '@roe/shared';
import { useMemo } from 'react';
import { ATMOSPHERE } from './atmosphere';
import { Lighting } from './Lighting';
import { Rocks } from './Rocks';
import { Sky } from './Sky';
import { Terrain } from './Terrain';
import { Trees } from './Trees';

interface WorldProps {
  map: MapDefinition;
  heights: HeightField;
}

export function World({ map, heights }: WorldProps) {
  const { trees, rocks } = useMemo(() => {
    const decorations = scatterDecorations(map);
    return {
      trees: decorations.filter((d) => d.kind === 'tree'),
      rocks: decorations.filter((d) => d.kind === 'rock'),
    };
  }, [map]);

  return (
    <>
      <fog attach="fog" args={[ATMOSPHERE.skyHorizon, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar]} />
      <Sky />
      <Lighting />
      <Terrain map={map} heights={heights} />
      <Trees items={trees} />
      <Rocks items={rocks} />
    </>
  );
}
