import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CHARACTER_PACK,
  RIG_MEDIUM,
  type AnimationClipRef,
  type CharacterAnimation,
  type CharacterModel,
  type SoldierAnimation,
  type SoldierModel,
  type UnitKind,
  type WeaponId,
} from '@roe/game-data';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Mesh,
  MeshStandardMaterial,
  type AnimationClip,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { publicUrl } from '../../scene/settlement/modelAssets';
import { simClock } from '../../simulation/simClock';
import { renderedUnitList } from '../renderedUnits';
import { UNIT_CAPACITY } from '../unitCapacity';
import { bakeCharacter, combineClips, sequenceClips } from './bakeCharacter';
import { createHatSources, createToolSources, type ToolModel } from './professionProps';
import { createSoldierInstances } from './soldierInstances';
import { createWeaponSources } from './soldierProps';
import { createVillagerInstances } from './villagerInstances';

/** Unit kinds drawn as villagers. */
type VillagerKind = Extract<UnitKind, 'serf' | 'worker'>;
/** Unit kinds drawn through the soldier renderer: the army and the monsters. */
type SoldierKind = keyof typeof CHARACTER_PACK.soldiers | keyof typeof CHARACTER_PACK.monsters;

/** The character model of each villager kind. */
const VILLAGERS: Record<VillagerKind, CharacterModel> = {
  serf: CHARACTER_PACK.serf,
  worker: CHARACTER_PACK.worker,
};
const SOLDIERS: Record<SoldierKind, SoldierModel> = {
  ...CHARACTER_PACK.soldiers,
  ...CHARACTER_PACK.monsters,
};
const SOLDIER_KINDS = Object.keys(SOLDIERS) as SoldierKind[];

/** What every baked character has: a model and named clips. */
interface Animated<K extends string> {
  model: string;
  animations: Readonly<Record<K, AnimationClipRef>>;
}

const url = (file: string) => publicUrl(`${CHARACTER_PACK.dir}${file}`);

/** Model and animation library URLs of a character (the clip files are shared). */
function characterUrls(character: Animated<string>) {
  const files = Object.values<AnimationClipRef>(character.animations).flatMap((a) => [
    a.file,
    ...(a.upperBody ? [a.upperBody.file] : []),
    ...(a.then ? [a.then.file] : []),
  ]);
  return { model: url(character.model), animations: [...new Set(files.map(url))] };
}

const AXE_URL = url(CHARACTER_PACK.accessories.axe);
const WEAPON_URLS = Object.entries(CHARACTER_PACK.weapons).map(
  ([weapon, file]) => [weapon as WeaponId, url(file)] as const,
);

// Start downloading as soon as this module loads.
for (const character of [...Object.values(VILLAGERS), ...Object.values(SOLDIERS)]) {
  const urls = characterUrls(character);
  useGLTF.preload([urls.model, ...urls.animations], false);
}
useGLTF.preload([AXE_URL, ...WEAPON_URLS.map(([, u]) => u)], false);

/**
 * An accessory model in its own frame: all its meshes merged (world transforms applied)
 * with the first mesh's material (KayKit accessories use one texture atlas).
 */
function accessoryModel(scene: Object3D, name: string): ToolModel {
  const parts: BufferGeometry[] = [];
  let material: MeshStandardMaterial | null = null;
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const own = object.material as Material;
    if (!(own instanceof MeshStandardMaterial)) return;
    material ??= own;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    // Instanced props have no morph weights (the bow's string-draw morph): rest shape only.
    geometry.morphAttributes = {};
    for (const key of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'uv'].includes(key)) geometry.deleteAttribute(key);
    }
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  });
  if (!material || parts.length === 0) throw new Error(`${name} model has no mesh`);
  const geometry = parts.length === 1 ? (parts[0] as BufferGeometry) : mergeGeometries(parts);
  return { geometry, material };
}

/** The axe accessory: its mesh geometry (in the hand slot frame) and material. */
function useAxe(): ToolModel {
  const { scene } = useGLTF(AXE_URL, false);
  return useMemo(() => accessoryModel(scene, 'Axe'), [scene]);
}

/** Every soldier weapon model (sword, shield, bow, quiver), by weapon. */
function useWeaponModels(): ReadonlyMap<WeaponId, ToolModel> {
  const loaded = useGLTF(
    WEAPON_URLS.map(([, u]) => u),
    false,
  );
  // Loaded files are cached and never change; the scene ids stand in for the list.
  const key = loaded.map((l) => l.scene.uuid).join(',');
  return useMemo(
    () =>
      new Map(
        WEAPON_URLS.map(([weapon], i) => {
          const scene = loaded[i]?.scene;
          if (!scene) throw new Error(`${weapon} model missing`);
          return [weapon, accessoryModel(scene, weapon)];
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
}

/**
 * Loads one character and its clip libraries (suspends) and builds its named clips:
 * combined (upper body from another clip) and joined (one clip, then the next) as
 * configured. `key` changes when the libraries do.
 */
function useCharacterClips<K extends string>(character: Animated<K>) {
  const urls = characterUrls(character);
  const [model, ...libraries] = useGLTF([urls.model, ...urls.animations], false);
  const clipLists = libraries.map((l) => l.animations);
  const key = clipLists.map((list) => list.length).join(',');
  const clips = useMemo(() => {
    const byUrl = new Map(urls.animations.map((u, i) => [u, clipLists[i] ?? []]));
    const find = (file: string, name: string) => {
      const clip = byUrl.get(url(file))?.find((c) => c.name === name);
      if (!clip) throw new Error(`Animation "${name}" not found in ${file}`);
      return clip;
    };
    const result = {} as Record<K, AnimationClip>;
    const refs = Object.entries(character.animations) as [K, AnimationClipRef][];
    for (const [name, ref] of refs) {
      let clip = find(ref.file, ref.clip);
      if (ref.upperBody) {
        clip = combineClips(
          name,
          clip,
          find(ref.upperBody.file, ref.upperBody.clip),
          RIG_MEDIUM.upperBody,
        );
      }
      if (ref.then) clip = sequenceClips(name, clip, find(ref.then.file, ref.then.clip));
      result[name] = clip;
    }
    return result;
    // Loaded files are cached and never change; `key` stands in for the clip lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, character]);
  return { scene: model?.scene, clips, key };
}

/** Loads one villager character and its clips (suspends), then bakes them once. */
function useVillagerInstances(kind: VillagerKind) {
  const character = VILLAGERS[kind];
  const { scene, clips } = useCharacterClips<CharacterAnimation>(character);
  const axe = useAxe();
  return useMemo(() => {
    if (!scene) throw new Error(`${kind} model missing`);
    const baked = bakeCharacter<CharacterAnimation>(scene, clips, {
      hiddenMeshes: character.hiddenMeshes,
      fps: CHARACTER_PACK.bakeFps,
      attach: { clip: 'carry', ...character.carryAttach },
    });
    return createVillagerInstances(baked, UNIT_CAPACITY, kind, character, {
      hats: createHatSources(baked, character),
      tools: createToolSources(baked, character, axe),
    });
  }, [scene, clips, kind, character, axe]);
}

/** Loads one soldier character, its clips and gear (suspends), then bakes them once. */
function useSoldierInstances(kind: SoldierKind) {
  const soldier = SOLDIERS[kind];
  const { scene, clips } = useCharacterClips<SoldierAnimation>(soldier);
  const weapons = useWeaponModels();
  return useMemo(() => {
    if (!scene) throw new Error(`${kind} model missing`);
    const baked = bakeCharacter<SoldierAnimation>(scene, clips, {
      hiddenMeshes: soldier.hiddenMeshes,
      fps: CHARACTER_PACK.bakeFps,
    });
    const gear = createWeaponSources(baked, soldier, weapons);
    return createSoldierInstances(baked, UNIT_CAPACITY, kind, soldier, gear);
  }, [scene, clips, kind, soldier, weapons]);
}

/** What `InstancedCharacter` draws: a body mesh plus attached props, updated per frame. */
interface CharacterInstances {
  geometry: BufferGeometry;
  material: Material;
  depthMaterial: Material;
  props: readonly InstancedMesh[];
  update(mesh: InstancedMesh, units: typeof renderedUnitList, time: number): void;
  dispose(): void;
}

/** One instanced body mesh plus one per prop shape, rewritten every frame. */
function InstancedCharacter({ instances }: { instances: CharacterInstances }) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.count = 0;
    mesh.customDepthMaterial = instances.depthMaterial;
  }, [instances]);
  useEffect(() => () => instances.dispose(), [instances]);

  useFrame(() => {
    if (ref.current) instances.update(ref.current, renderedUnitList, simClock.time);
  });

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[instances.geometry, instances.material, UNIT_CAPACITY]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      {instances.props.map((prop) => (
        <primitive key={prop.id} object={prop} />
      ))}
    </>
  );
}

/** One kind of villager: one instanced mesh, plus one per load, hat and tool shape. */
function BakedVillagers({ kind }: { kind: VillagerKind }) {
  return <InstancedCharacter instances={useVillagerInstances(kind)} />;
}

/** One kind of soldier: one instanced mesh, plus one per piece of gear. */
function BakedSoldiers({ kind }: { kind: SoldierKind }) {
  return <InstancedCharacter instances={useSoldierInstances(kind)} />;
}

/**
 * Units as KayKit characters with baked skeletal animation (see `bakeCharacter`):
 * serfs (the Ranger), workers (the Rogue), the soldiers (Knight, Barbarian, hooded
 * Rogue) and the skeletons, each one instanced mesh, so one draw call (plus one for shadows) per kind for
 * any number of units.
 */
export function BakedUnits() {
  return (
    <>
      <BakedVillagers kind="serf" />
      <BakedVillagers kind="worker" />
      {SOLDIER_KINDS.map((kind) => (
        <BakedSoldiers key={kind} kind={kind} />
      ))}
    </>
  );
}
