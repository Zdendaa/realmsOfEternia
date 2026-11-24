import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CHARACTER_PACK,
  RIG_MEDIUM,
  type AnimationClipRef,
  type CharacterAnimation,
} from '@roe/game-data';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { AnimationClip, InstancedMesh } from 'three';
import { publicUrl } from '../../scene/settlement/modelAssets';
import { simClock } from '../../simulation/simClock';
import { renderedUnitList } from '../renderedUnits';
import { UNIT_CAPACITY } from '../unitCapacity';
import { bakeCharacter, combineClips } from './bakeCharacter';
import { createSerfInstances } from './serfInstances';

const SERF = CHARACTER_PACK.serf;
const url = (file: string) => publicUrl(`${CHARACTER_PACK.dir}${file}`);
const MODEL_URL = url(SERF.model);
const ANIMATION_FILES = Object.values(SERF.animations).flatMap((a: AnimationClipRef) =>
  a.upperBody ? [a.file, a.upperBody.file] : [a.file],
);
const ANIMATION_URLS = [...new Set(ANIMATION_FILES.map(url))];

// Start downloading as soon as this module loads.
useGLTF.preload([MODEL_URL, ...ANIMATION_URLS], false);

/** Loads the serf model and its animation clips (suspends), then bakes them once. */
function useSerfInstances() {
  const [model, ...libraries] = useGLTF([MODEL_URL, ...ANIMATION_URLS], false);
  const scene = model?.scene;
  const clipLists = libraries.map((l) => l.animations);
  const key = clipLists.map((list) => list.length).join(',');
  return useMemo(() => {
    if (!scene) throw new Error('Serf model missing');
    const byUrl = new Map(ANIMATION_URLS.map((u, i) => [u, clipLists[i] ?? []]));
    const clips = {} as Record<CharacterAnimation, AnimationClip>;
    const refs = Object.entries(SERF.animations) as [CharacterAnimation, AnimationClipRef][];
    const find = (file: string, name: string) => {
      const clip = byUrl.get(url(file))?.find((c) => c.name === name);
      if (!clip) throw new Error(`Animation "${name}" not found in ${file}`);
      return clip;
    };
    for (const [name, ref] of refs) {
      const clip = find(ref.file, ref.clip);
      clips[name] = ref.upperBody
        ? combineClips(
            name,
            clip,
            find(ref.upperBody.file, ref.upperBody.clip),
            RIG_MEDIUM.upperBody,
          )
        : clip;
    }
    const baked = bakeCharacter<CharacterAnimation>(scene, clips, {
      hiddenMeshes: SERF.hiddenMeshes,
      fps: CHARACTER_PACK.bakeFps,
      attach: { clip: 'carry', ...SERF.carryAttach },
    });
    return createSerfInstances(baked, UNIT_CAPACITY);
    // Loaded files are cached and never change; `key` stands in for the clip lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, key]);
}

/**
 * Serfs as KayKit characters with baked skeletal animation (see `bakeCharacter`): one
 * instanced mesh, so one draw call (plus one for shadows) for any number of serfs, and
 * one more per bundle shape while someone carries goods.
 */
export function BakedUnits() {
  const serfs = useSerfInstances();
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.count = 0;
    mesh.customDepthMaterial = serfs.depthMaterial;
  }, [serfs]);
  useEffect(() => () => serfs.dispose(), [serfs]);

  useFrame(() => {
    if (ref.current) serfs.update(ref.current, renderedUnitList, simClock.time);
  });

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[serfs.geometry, serfs.material, UNIT_CAPACITY]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      {serfs.bundles.map((bundle) => (
        <primitive key={bundle.id} object={bundle} />
      ))}
    </>
  );
}
