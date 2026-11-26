import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { SIEGE_MODELS, SIEGE_SIZE } from '@roe/game-data';
import type { Projectile } from '@roe/sim';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { useGameStore } from '../../state/gameStore';
import { shownAt } from '../fog/knowledge';
import { SmokePuffs, type SmokeEmitter, type SmokeStyle } from '../scene/SmokePuffs';
import { extractModelParts, publicUrl } from '../scene/settlement/modelAssets';
import { simClock } from '../simulation/simClock';

const ROCK_URL = publicUrl(SIEGE_MODELS.rock.model);

const CAPACITY = 64;
/** Peak of the arc as a share of the flight distance: a high lob. */
const ARC = 0.3;
const RELEASE_HEIGHT = 2;
/** Puffs thrown up around the spot a rock lands on, and how far out. */
const DUST_PUFFS = 7;
const DUST_REACH = 1;

const DUST: SmokeStyle = {
  color: '#a3906c',
  opacity: 0.75,
  maxPuffs: 96,
  // Each emitter lives for one frame, so it emits exactly once.
  emitEvery: 1000,
  lifetime: 0.9,
  rise: 1.1,
  drift: 0.3,
  startSize: 0.25,
  endSize: 0.75,
};

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const spin = new Euler();
const size = new Vector3().setScalar(SIEGE_MODELS.rock.scale * SIEGE_SIZE.modelScale);

/** The dust of rocks that landed since it was last asked for. */
function createDust() {
  let waiting: SmokeEmitter[] = [];
  let nextId = 0;
  return {
    burst(x: number, y: number, z: number) {
      for (let i = 0; i < DUST_PUFFS; i++) {
        const turn = (i / (DUST_PUFFS - 1)) * Math.PI * 2;
        // One in the middle, the rest around it.
        const reach = i === DUST_PUFFS - 1 ? 0 : DUST_REACH;
        waiting.push({
          id: nextId++,
          x: x + Math.cos(turn) * reach,
          y: y + 0.2,
          z: z + Math.sin(turn) * reach,
        });
      }
    },
    take() {
      const taken = waiting;
      waiting = [];
      return taken;
    },
  };
}

/**
 * Catapult rocks in flight: each lobs from its release point to the spot it was aimed
 * at (not after the target: that is what lets units dodge), tumbling, and raises dust
 * where it lands. The simulation decides what it hits.
 */
export function RockShots() {
  const { scene } = useGLTF(ROCK_URL, false);
  const model = useMemo(() => {
    const [part] = extractModelParts(scene);
    if (!part) throw new Error('Rock model has no mesh');
    return part;
  }, [scene]);
  const ref = useRef<InstancedMesh>(null);
  const dust = useMemo(() => createDust(), []);
  const flying = useRef(new Map<string, { shot: Projectile; shown: boolean }>());

  useLayoutEffect(() => {
    if (ref.current) ref.current.count = 0;
  }, []);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { state, ctx } = useGameStore.getState();
    const now = state.tick - 1 + simClock.alpha;
    const live = new Set<string>();
    let count = 0;
    for (const p of state.projectiles) {
      if (!p.weapon || !p.aim) continue;
      const key = `${p.attackerId}:${p.firedAt}`;
      live.add(key);
      // Seen when the engine or the spot it aims at is in sight.
      const shown = shownAt(p.ownerId, p.fromX, p.fromZ) || shownAt(p.ownerId, p.aim.x, p.aim.z);
      flying.current.set(key, { shot: p, shown });
      if (!shown || count >= CAPACITY) continue;
      const t = Math.min(1, Math.max(0, (now - p.firedAt) / (p.impactAt - p.firedAt)));
      const from = ctx.heights.getHeightAt(p.fromX, p.fromZ) + (p.fromHeight ?? RELEASE_HEIGHT);
      const to = ctx.heights.getHeightAt(p.aim.x, p.aim.z) + 0.3;
      const dx = p.aim.x - p.fromX;
      const dz = p.aim.z - p.fromZ;
      const arc = ARC * Math.sqrt(dx * dx + dz * dz);
      position.set(
        p.fromX + dx * t,
        from + (to - from) * t + arc * 4 * t * (1 - t),
        p.fromZ + dz * t,
      );
      rotation.setFromEuler(spin.set(t * 9, t * 5, 0));
      matrix.compose(position, rotation, size).multiply(model.matrix);
      mesh.setMatrixAt(count++, matrix);
    }
    for (const [key, { shot, shown }] of flying.current) {
      // The sim drops a shot on the tick it lands; draw it to the end first.
      if (live.has(key) || now < shot.impactAt) continue;
      flying.current.delete(key);
      if (shown && shot.aim) {
        const { x, z } = shot.aim;
        dust.burst(x, ctx.heights.getHeightAt(x, z), z);
      }
    }
    mesh.count = count;
    mesh.visible = count > 0;
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[model.geometry, model.material, CAPACITY]}
        castShadow
        frustumCulled={false}
      />
      <SmokePuffs emitters={dust.take} style={DUST} />
    </>
  );
}
