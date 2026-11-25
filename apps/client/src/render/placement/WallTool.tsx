import { useFrame, useThree } from '@react-three/fiber';
import { BUILDINGS, isWall, WALL_RULES, type BuildingId, type WallModel } from '@roe/game-data';
import type { Vec2 } from '@roe/shared';
import {
  findCutOff,
  footprintOf,
  planWall,
  snapWallLine,
  validateCommand,
  type CutOff,
  type PlaceWallCommand,
  type PlannedSegment,
} from '@roe/sim';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
} from 'three';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import { usePlacementStore } from '../../state/placementStore';
import { segmentEnds } from '../walls/wallLayout';
import { pickGround } from './groundPick';

/** A press that moves less than this (px) is a click, which draws nothing. */
const CLICK_TOLERANCE = 5;
/** A drag starting this close to the end of an own wall starts on that end. */
const SNAP_TO_END = 1.6;

const COLORS = {
  ok: new Color('#7fe07a'),
  blocked: new Color('#ff6b5a'),
  exists: new Color('#b9c0b4'),
};

const raycaster = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

/** The ground point under a window position, or null. */
function groundAt(element: HTMLElement, camera: Camera, x: number, y: number): Vec2 | null {
  const rect = element.getBoundingClientRect();
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const point = pickGround(raycaster.ray, useGameStore.getState().heights, hit);
  return point ? { x: point.x, z: point.z } : null;
}

/** Where a drag starting at `point` begins: an own wall's end nearby, else the grid. */
function snapStart(point: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestDistance = SNAP_TO_END;
  for (const wall of useGameStore.getState().state.buildings) {
    if (wall.ownerId !== LOCAL_PLAYER || !isWall(wall.type)) continue;
    for (const end of segmentEnds(wall)) {
      const distance = Math.hypot(end.x - point.x, end.z - point.z);
      if (distance < bestDistance) {
        best = end;
        bestDistance = distance;
      }
    }
  }
  return best ?? { x: Math.round(point.x) + 0, z: Math.round(point.z) + 0 };
}

interface Drag {
  anchor: Vec2;
  /** Screen position of the press, to tell a drag from a click. */
  px: number;
  py: number;
  /** The pointer's latest window position. */
  x: number;
  y: number;
  moved: boolean;
}

/** The preview's meshes: a translucent box per segment and a marker for the start point. */
function createPreview() {
  const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const material = new MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
  const segments = new InstancedMesh(box, material, WALL_RULES.maxSegments);
  segments.instanceMatrix.setUsage(DynamicDrawUsage);
  segments.setColorAt(0, COLORS.ok);
  segments.count = 0;
  segments.frustumCulled = false;
  segments.renderOrder = 3;
  const markerGeometry = new CylinderGeometry(0.45, 0.45, 2.4, 10).translate(0, 1.2, 0);
  const markerMaterial = new MeshBasicMaterial({
    color: COLORS.ok,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const marker = new Mesh(markerGeometry, markerMaterial);
  marker.visible = false;
  return {
    segments,
    marker,
    /** Draws the previewed line. */
    show(building: BuildingId, planned: readonly PlannedSegment[], affordable: boolean) {
      showSegments(segments, building, planned, affordable);
    },
    hideSegments() {
      segments.count = 0;
    },
    /** The start marker at a ground point, or hidden. */
    showMarker(at: { x: number; y: number; z: number } | null) {
      marker.visible = at !== null;
      if (at) marker.position.set(at.x, at.y, at.z);
    },
    dispose() {
      box.dispose();
      material.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      segments.dispose();
    },
  };
}

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const quaternion = new Quaternion();
const up = new Vector3(0, 1, 0);

function showSegments(
  mesh: InstancedMesh,
  building: BuildingId,
  segments: readonly PlannedSegment[],
  affordable: boolean,
) {
  const model = (BUILDINGS[building] as { wallModel: WallModel }).wallModel;
  const { heights } = useGameStore.getState();
  segments.forEach((segment, i) => {
    position.set(segment.x, heights.getHeightAt(segment.x, segment.z), segment.z);
    quaternion.setFromAxisAngle(up, segment.rotation);
    scale.set(footprintOf(building, segment.rotation).w * 0.94, model.height, model.depth);
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    // An unaffordable line is red as a whole.
    const status = segment.status === 'ok' && !affordable ? 'blocked' : segment.status;
    mesh.setColorAt(i, COLORS[status]);
  });
  mesh.count = segments.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

const NOTHING_CUT: CutOff = { units: 0, sites: 0 };

/** The command a release at `point` would send, with its preview. */
function previewLine(building: BuildingId, anchor: Vec2, point: Vec2) {
  const { ctx, state, world, heights } = useGameStore.getState();
  const line = snapWallLine(anchor, point);
  const command: PlaceWallCommand = { type: 'placeWall', building, ...line };
  const plan = planWall(world, state, building, line.from, line.to, heights);
  const fresh = plan.segments.filter((s) => s.status === 'ok');
  const blocked = plan.segments.filter((s) => s.status === 'blocked');
  const check = validateCommand(ctx, state, LOCAL_PLAYER, command);
  return {
    command,
    segments: plan.segments,
    preview: {
      count: fresh.length,
      blocked: blocked.length,
      blockedIssue: blocked[0]?.issues[0] ?? null,
      check,
      cutOff: fresh.length ? findCutOff(ctx, state, LOCAL_PLAYER, building, fresh) : NOTHING_CUT,
    },
  };
}

/**
 * Drawing walls: press on the ground, drag, release. The preview follows the mouse
 * (green: will be built, red: blocked or unaffordable, grey: already stands) and is
 * computed by the same sim functions the command runs, only when the snapped line, the
 * buildings, the stock or the felled trees change. The tool stays active after a wall
 * is drawn; a drag that starts near the end of a wall continues from it.
 */
export function WallTool({ building }: { building: BuildingId }) {
  const element = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);
  const preview = useMemo(() => createPreview(), []);
  const drag = useRef<Drag | null>(null);
  const shown = useRef<{ key: string; stock: unknown; nodes: unknown }>({
    key: '',
    stock: null,
    nodes: null,
  });

  useEffect(() => () => preview.dispose(), [preview]);

  useEffect(() => {
    const clear = () => {
      drag.current = null;
      shown.current.key = '';
      preview.hideSegments();
      usePlacementStore.getState().setWall(null);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = groundAt(element, camera, event.clientX, event.clientY);
      if (!point) return;
      const { clientX: x, clientY: y } = event;
      drag.current = { anchor: snapStart(point), px: x, py: y, x, y, moved: false };
      usePlacementStore.getState().setWallWarning(null);
    };
    const onMove = (event: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // Another button pressed during the drag calls the line off. (While one button is
      // held, browsers report further presses as moves, not as `pointerdown`.)
      if ((event.buttons & ~1) !== 0) {
        clear();
        return;
      }
      d.x = event.clientX;
      d.y = event.clientY;
      d.moved ||= Math.hypot(d.x - d.px, d.y - d.py) > CLICK_TOLERANCE;
    };
    const onUp = (event: PointerEvent) => {
      const d = drag.current;
      if (event.button !== 0 || !d) return;
      onMove(event);
      if (!drag.current) return;
      const point = d.moved ? groundAt(element, camera, d.x, d.y) : null;
      clear();
      if (!point) return;
      // Planned again at the release point, against the state as it is now.
      const line = previewLine(building, d.anchor, point);
      if (!useGameStore.getState().dispatch(line.command).ok) return;
      const { units, sites } = line.preview.cutOff;
      if (units > 0 || sites > 0) {
        usePlacementStore.getState().setWallWarning(line.preview.cutOff);
      }
    };
    element.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      clear();
    };
  }, [element, camera, building, preview]);

  useFrame(({ pointer }) => {
    const { state, heights } = useGameStore.getState();
    const d = drag.current;
    // Before a drag, a marker shows where a wall would start.
    if (!d?.moved) {
      let start = d?.anchor ?? null;
      if (!start) {
        raycaster.setFromCamera(pointer, camera);
        const point = pickGround(raycaster.ray, heights, hit);
        start = point ? snapStart({ x: point.x, z: point.z }) : null;
      }
      preview.showMarker(start && { ...start, y: heights.getHeightAt(start.x, start.z) });
      return;
    }
    preview.showMarker(null);
    const point = groundAt(element, camera, d.x, d.y);
    if (!point) return;
    const { to } = snapWallLine(d.anchor, point);
    const key = `${d.anchor.x},${d.anchor.z}:${to.x},${to.z}:${state.buildings.length}`;
    const stock = state.stocks[LOCAL_PLAYER];
    const last = shown.current;
    if (key === last.key && stock === last.stock && state.resourceNodes === last.nodes) return;
    shown.current = { key, stock, nodes: state.resourceNodes };
    const line = previewLine(building, d.anchor, point);
    const affordable = !line.preview.check.issues.includes('notEnoughResources');
    preview.show(building, line.segments, affordable);
    usePlacementStore.getState().setWall(line.preview);
  });

  return (
    <>
      <primitive object={preview.segments} />
      <primitive object={preview.marker} />
    </>
  );
}
