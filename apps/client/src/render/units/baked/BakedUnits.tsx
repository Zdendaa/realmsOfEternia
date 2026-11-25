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
import { Mesh, MeshStandardMaterial, type AnimationClip, type InstancedMesh } from 'three';
import { publicUrl } from '../../scene/settlement/modelAssets';
import { simClock } from '../../simulation/simClock';
import { renderedUnitList } from '../renderedUnits';
import { UNIT_CAPACITY } from '../unitCapacity';
import { bakeCharacter, combineClips } from './bakeCharacter';
import { createHatSources, createToolSources, type ToolModel } from './professionProps';
import { createVillagerInstances } from './villagerInstances';

/** Unit kinds drawn as villagers (soldiers get their own renderer). */
type VillagerKind = Extract<UnitKind, 'serf' | 'worker'>;

/** The character model of each villager kind. */
const CHARACTERS: Record<VillagerKind, CharacterModel> = {
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

const AXE_URL = url(CHARACTER_PACK.accessories.axe);

// Start downloading as soon as this module loads.
for (const character of Object.values(CHARACTERS)) {
  const urls = characterUrls(character);
  useGLTF.preload([urls.model, ...urls.animations], false);
}
useGLTF.preload(AXE_URL, false);

/** The axe accessory: its mesh geometry (in the hand slot frame) and material. */
function useAxe(): ToolModel {
  const { scene } = useGLTF(AXE_URL, false);
  return useMemo(() => {
    let found: ToolModel | null = null;
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (found || !(object instanceof Mesh)) return;
      const material = object.material as unknown;
      if (!(material instanceof MeshStandardMaterial)) return;
      found = { geometry: object.geometry.clone().applyMatrix4(object.matrixWorld), material };
    });
    if (!found) throw new Error('Axe model has no mesh');
    return found;
  }, [scene]);
}

/** Loads one character and its clips (suspends), then bakes them once. */
function useVillagerInstances(kind: VillagerKind) {
  const character = CHARACTERS[kind];
  const urls = characterUrls(character);
  const [model, ...libraries] = useGLTF([urls.model, ...urls.animations], false);
  const scene = model?.scene;
  const axe = useAxe();
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
    return createVillagerInstances(baked, UNIT_CAPACITY, kind, character, {
      hats: createHatSources(baked, character),
      tools: createToolSources(baked, character, axe),
    });
    // Loaded files are cached and never change; `key` stands in for the clip lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, key, kind, axe]);
}

/** One kind of villager: one instanced mesh, plus one per load, hat and tool shape. */
function BakedVillagers({ kind }: { kind: VillagerKind }) {
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
      {villagers.props.map((prop) => (
        <primitive key={prop.id} object={prop} />
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
