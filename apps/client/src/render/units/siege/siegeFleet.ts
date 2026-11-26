import { attackOf, SIEGE_MODELS, type UnitKind } from '@roe/game-data';
import type { EntityId } from '@roe/shared';
import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { extractModelParts, nodeOf } from '../../scene/settlement/modelAssets';
import {
  isTeamColorable,
  teamColorMaterial,
  writeTeamColor,
} from '../../scene/settlement/teamColorMaterial';
import type { RenderedUnit } from '../renderedUnits';
import { ownerColor } from '../unitColors';
import {
  catapultFrameGeometry,
  catapultPennantGeometry,
  ramColorsGeometry,
  ramFrameGeometry,
  ramLogGeometry,
  WHEEL_RADIUS,
  wheelGeometry,
  WHEELS,
} from './siegeGeometry';
import { catapultArm, ramSwing, type ArmPose } from './siegeMotion';

/** Most engines of one kind drawn at once. */
const CAPACITY = 64;
/** The turret stands on the catapult's deck, this high. */
const DECK_HEIGHT = 0.68;
/** The rock in the bucket, in the arm's own space (pack units). */
const BUCKET = { y: 0.04, z: -0.54 };
/** A wreck tips over this far (radians) in half a second, and sinks faster than a body. */
const WRECK_TILT = 0.35;
const WRECK_SINK_START = 1.8;
const WRECK_SINK_SPEED = 1.1;

type SiegeKind = Extract<UnitKind, 'ram' | 'catapult'>;

/** What moves on one engine this frame. */
interface Pose {
  wheel: number;
  arm: ArmPose;
  swing: number;
}

/** One instanced mesh and where its instance goes relative to the engine. */
interface Piece {
  kind: SiegeKind;
  mesh: InstancedMesh;
  /** Writes the piece's matrix within the engine; false: not drawn this frame. */
  place: (pose: Pose, out: Matrix4) => boolean;
  /** How the instance takes the owner's color. */
  team?: 'atlas' | 'tint';
}

const unitMatrix = new Matrix4();
const local = new Matrix4();
const step = new Matrix4();
const result = new Matrix4();

function instanced(geometry: BufferGeometry, material: Material, capacity = CAPACITY) {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** A node's meshes with their matrices relative to the node, minus the nodes in `skip`. */
function partsWithin(root: Object3D, name: string, skip: readonly string[] = []) {
  const node = nodeOf(root, name);
  const inverse = node.matrixWorld.clone().invert();
  return extractModelParts(node, skip).map((part) => ({
    ...part,
    matrix: new Matrix4().multiplyMatrices(inverse, part.matrix),
  }));
}

/**
 * Every siege engine on the map as a handful of instanced meshes: frames, turning
 * wheels, the catapult's turret, arm and rock (from the pack models), the ram's roof and
 * swinging log, and the pieces in the owner's color. A plain object outside React;
 * `update` rewrites the instances from this frame's rendered units.
 */
export function createSiegeFleet(catapult: Object3D, rock: Object3D) {
  const { turret, arm, scale } = SIEGE_MODELS.catapult;
  const wood = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const cloth = new MeshStandardMaterial({ roughness: 0.8 });
  const owned: BufferGeometry[] = [];
  const code = (geometry: BufferGeometry) => {
    owned.push(geometry);
    return geometry;
  };
  const pieces: Piece[] = [];
  const still = (_: Pose, out: Matrix4) => {
    out.identity();
    return true;
  };

  pieces.push(
    { kind: 'catapult', mesh: instanced(code(catapultFrameGeometry()), wood), place: still },
    {
      kind: 'catapult',
      mesh: instanced(code(catapultPennantGeometry()), cloth),
      place: still,
      team: 'tint',
    },
    { kind: 'ram', mesh: instanced(code(ramFrameGeometry()), wood), place: still },
    { kind: 'ram', mesh: instanced(code(ramColorsGeometry()), cloth), place: still, team: 'tint' },
    {
      kind: 'ram',
      mesh: instanced(code(ramLogGeometry()), wood),
      place: (pose, out) => {
        out.makeTranslation(0, 0, pose.swing);
        return true;
      },
    },
  );
  const wheel = code(wheelGeometry());
  for (const kind of ['catapult', 'ram'] as const) {
    for (const [x, z] of WHEELS) {
      pieces.push({
        kind,
        mesh: instanced(wheel, wood),
        place: (pose, out) => {
          out.makeRotationX(pose.wheel).setPosition(x, WHEEL_RADIUS, z);
          return true;
        },
      });
    }
  }

  // The pack's turret on the deck, and its arm turning about its own pivot.
  const deck = new Matrix4()
    .makeTranslation(0, DECK_HEIGHT, 0)
    .multiply(new Matrix4().makeScale(scale, scale, scale));
  const armNode = nodeOf(catapult, arm);
  const pivot = armNode.position.clone();
  const fromModel = (matrix: Matrix4, place: Piece['place'], base: Piece, material: Material) => {
    const teamColored = isTeamColorable(material);
    pieces.push({
      ...base,
      place: (pose, out) => {
        if (!place(pose, out)) return false;
        out.premultiply(deck).multiply(matrix);
        return true;
      },
      ...(teamColored ? { team: 'atlas' as const } : {}),
    });
  };
  const modelPiece = (geometry: BufferGeometry, material: Material): Piece => ({
    kind: 'catapult',
    mesh: instanced(geometry, teamColorMaterial(material)),
    place: still,
  });
  for (const part of partsWithin(catapult, turret, [arm])) {
    const piece = modelPiece(part.geometry, part.material);
    fromModel(part.matrix, still, piece, part.material);
  }
  const armAt = (pose: Pose, out: Matrix4) => {
    out.makeTranslation(pivot.x, pivot.y, pivot.z).multiply(step.makeRotationX(pose.arm.angle));
    return true;
  };
  for (const part of partsWithin(catapult, arm)) {
    const piece = modelPiece(part.geometry, part.material);
    fromModel(part.matrix, armAt, piece, part.material);
  }
  const rockScale = SIEGE_MODELS.rock.scale / scale;
  const inBucket = new Matrix4()
    .makeTranslation(0, BUCKET.y, BUCKET.z)
    .multiply(new Matrix4().makeScale(rockScale, rockScale, rockScale));
  for (const part of extractModelParts(rock)) {
    const piece = modelPiece(part.geometry, part.material);
    fromModel(
      new Matrix4().multiplyMatrices(inBucket, part.matrix),
      (pose, out) => pose.arm.loaded && armAt(pose, out),
      piece,
      part.material,
    );
  }

  /** How far each engine has rolled, so its wheels turn with the ground covered. */
  const rolled = new Map<EntityId, { x: number; z: number; angle: number }>();

  return {
    meshes: pieces.map((p) => p.mesh),
    update(units: readonly RenderedUnit[]) {
      const counts = new Array<number>(pieces.length).fill(0);
      const seen = new Set<EntityId>();
      for (const unit of units) {
        if (unit.type !== 'ram' && unit.type !== 'catapult') continue;
        seen.add(unit.id);
        let roll = rolled.get(unit.id);
        if (!roll) {
          roll = { x: unit.x, z: unit.z, angle: 0 };
          rolled.set(unit.id, roll);
        }
        const dx = unit.x - roll.x;
        const dz = unit.z - roll.z;
        // Forward or backward along the way it faces.
        const forward = dx * Math.sin(unit.heading) + dz * Math.cos(unit.heading) < 0 ? -1 : 1;
        roll.angle += (forward * Math.hypot(dx, dz)) / WHEEL_RADIUS;
        roll.x = unit.x;
        roll.z = unit.z;

        const windup = attackOf(unit.type)?.windup ?? 1;
        const dead = unit.deathElapsed;
        const attack = dead === null ? unit.attackElapsed : null;
        const pose: Pose = {
          wheel: roll.angle,
          arm: catapultArm(attack, windup),
          swing: ramSwing(attack, windup),
        };
        // The frame driver already sinks the dead; wrecks are taller and go down further.
        const sink = dead === null ? 0 : Math.max(0, dead - WRECK_SINK_START) * WRECK_SINK_SPEED;
        unitMatrix.makeRotationY(unit.heading).setPosition(unit.x, unit.y - sink, unit.z);
        if (dead !== null) {
          unitMatrix.multiply(step.makeRotationZ(Math.min(1, dead * 2) * WRECK_TILT));
        }
        pieces.forEach((piece, i) => {
          const index = counts[i] as number;
          if (piece.kind !== unit.type || index >= CAPACITY || !piece.place(pose, local)) return;
          piece.mesh.setMatrixAt(index, result.multiplyMatrices(unitMatrix, local));
          if (piece.team === 'tint') piece.mesh.setColorAt(index, ownerColor(unit.ownerId));
          else if (piece.team === 'atlas') {
            piece.mesh.setColorAt(index, ownerColor(unit.ownerId));
            writeTeamColor(piece.mesh.instanceColor?.array as Float32Array, index, unit.ownerId);
          }
          counts[i] = index + 1;
        });
      }
      pieces.forEach((piece, i) => {
        piece.mesh.count = counts[i] as number;
        piece.mesh.visible = piece.mesh.count > 0;
        if (piece.mesh.count === 0) return;
        piece.mesh.instanceMatrix.needsUpdate = true;
        if (piece.mesh.instanceColor) piece.mesh.instanceColor.needsUpdate = true;
      });
      if (rolled.size > seen.size) {
        for (const id of rolled.keys()) if (!seen.has(id)) rolled.delete(id);
      }
    },
    /** Creates the color attributes, which must exist before the shaders compile. */
    prepare() {
      for (const piece of pieces) if (piece.team) piece.mesh.setColorAt(0, ownerColor(null));
    },
    dispose() {
      for (const piece of pieces) piece.mesh.dispose();
      for (const geometry of owned) geometry.dispose();
      wood.dispose();
      cloth.dispose();
    },
  };
}
