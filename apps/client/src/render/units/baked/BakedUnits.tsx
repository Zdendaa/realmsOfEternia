import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CHARACTER_PACK,
  RIG_MEDIUM,
  type AnimationClipRef,
  type CharacterAnimation,
  type CharacterModel,
  type UnitKind,
} from '@roe/game-data';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { AnimationClip, InstancedMesh } from 'three';
import { publicUrl } from '../../scene/settlement/modelAssets';
import { simClock } from '../../simulation/simClock';
import { renderedUnitList } from '../renderedUnits';
import { UNIT_CAPACITY } from '../unitCapacity';
import { bakeCharacter, combineClips } from './bakeCharacter';
import { createVillagerInstances } from './villagerInstances';

/** The character model of each unit kind. */
const CHARACTERS: Record<UnitKind, CharacterModel> = {
  serf: CHARACTER_PACK.serf,
  worker: CHARACTER_PACK.worker,
};

const url = (file: string) => publicUrl(`${CHARACTER_PACK.dir}${file}`);

/** Model and animation library URLs of a character (the clip files are shared). */
function characterUrls(character: CharacterModel) {
  const files = Object.values(character.animations).flatMap((a: AnimationClipRef) =>
    a.upperBody ? [a.file, a.upperBody.file] : [a.file],
  );
  return { model: url(character.model), animations: [...new Set(files.map(url))] };
}

// Start downloading as soon as this module loads.
for (const character of Object.values(CHARACTERS)) {
  const urls = characterUrls(character);
  useGLTF.preload([urls.model, ...urls.animations], false);
}

/** Loads one character and its clips (suspends), then bakes them once. */
function useVillagerInstances(kind: UnitKind) {
  const character = CHARACTERS[kind];
  const urls = characterUrls(character);
  const [model, ...libraries] = useGLTF([urls.model, ...urls.animations], false);
  const scene = model?.scene;
  const clipLists = libraries.map((l) => l.animations);
  const key = clipLists.map((list) => list.length).join(',');
  return useMemo(() => {
    if (!scene) throw new Error(`${kind} model missing`);
    const byUrl = new Map(urls.animations.map((u, i) => [u, clipLists[i] ?? []]));
    const clips = {} as Record<CharacterAnimation, AnimationClip>;
    const refs = Object.entries(character.animations) as [CharacterAnimation, AnimationClipRef][];
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
      hiddenMeshes: character.hiddenMeshes,
      fps: CHARACTER_PACK.bakeFps,
      attach: { clip: 'carry', ...character.carryAttach },
    });
    return createVillagerInstances(baked, UNIT_CAPACITY, kind, character);
    // Loaded files are cached and never change; `key` stands in for the clip lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, key, kind]);
}

/** One kind of villager: one instanced mesh, plus one per bundle shape while carrying. */
function BakedVillagers({ kind }: { kind: UnitKind }) {
  const villagers = useVillagerInstances(kind);
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.count = 0;
    mesh.customDepthMaterial = villagers.depthMaterial;
  }, [villagers]);
  useEffect(() => () => villagers.dispose(), [villagers]);

  useFrame(() => {
    if (ref.current) villagers.update(ref.current, renderedUnitList, simClock.time);
  });

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[villagers.geometry, villagers.material, UNIT_CAPACITY]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      {villagers.bundles.map((bundle) => (
        <primitive key={bundle.id} object={bundle} />
      ))}
    </>
  );
}

/**
 * Villagers as KayKit characters with baked skeletal animation (see `bakeCharacter`):
 * serfs (the Ranger) and workers (the Rogue), each one instanced mesh, so one draw call
 * (plus one for shadows) per kind for any number of units.
 */
export function BakedUnits() {
  return (
    <>
      <BakedVillagers kind="serf" />
      <BakedVillagers kind="worker" />
    </>
  );
}
