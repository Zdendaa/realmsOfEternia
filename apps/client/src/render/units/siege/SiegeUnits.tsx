import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { SIEGE_MODELS } from '@roe/game-data';
import { useEffect, useMemo } from 'react';
import { publicUrl } from '../../scene/settlement/modelAssets';
import { renderedUnitList } from '../renderedUnits';
import { createSiegeFleet } from './siegeFleet';

const CATAPULT_URL = publicUrl(SIEGE_MODELS.catapult.model);
const ROCK_URL = publicUrl(SIEGE_MODELS.rock.model);
useGLTF.preload(CATAPULT_URL, false);
useGLTF.preload(ROCK_URL, false);

/** Rams and catapults (soldiers and villagers are the character renderers' business). */
export function SiegeUnits() {
  const catapult = useGLTF(CATAPULT_URL, false);
  const rock = useGLTF(ROCK_URL, false);
  const fleet = useMemo(() => {
    const created = createSiegeFleet(catapult.scene, rock.scene);
    created.prepare();
    return created;
  }, [catapult.scene, rock.scene]);
  useEffect(() => () => fleet.dispose(), [fleet]);
  useFrame(() => fleet.update(renderedUnitList));

  return (
    <>
      {fleet.meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
