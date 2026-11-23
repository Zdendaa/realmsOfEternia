import { scatterDecorations, type MapDefinition } from '@roe/shared';
import { useMemo } from 'react';
import { Lighting } from './Lighting';
import { Rocks } from './Rocks';
import { Terrain } from './Terrain';
import { Trees } from './Trees';

const SKY_COLOR = '#b9d3e6';

interface WorldProps {
  map: MapDefinition;
}

export function World({ map }: WorldProps) {
  const { trees, rocks } = useMemo(() => {
    const decorations = scatterDecorations(map);
    return {
      trees: decorations.filter((d) => d.kind === 'tree'),
      rocks: decorations.filter((d) => d.kind === 'rock'),
    };
  }, [map]);

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 160, 420]} />
      <Lighting />
      <Terrain size={map.size} />
      <Trees items={trees} />
      <Rocks items={rocks} />
    </>
  );
}
