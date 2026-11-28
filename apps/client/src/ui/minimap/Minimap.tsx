import { toPlacedFootprint, VISION_CELL } from '@roe/sim';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { orderToGround } from '../../input/groundOrders';
import { orderPoint } from '../../input/pointerTarget';
import { selectionKinds } from '../../input/selectionKinds';
import { cameraRig } from '../../render/camera/cameraRig';
import { knownBuildings, localVision, shownAt } from '../../render/fog/knowledge';
import { useCommandModeStore } from '../../state/commandModeStore';
import { useGameStore } from '../../state/gameStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useSettingsStore } from '../../state/settingsStore';
import { MINIMAP_REDRAW_MS, MINIMAP_SIZE } from './constants';
import {
  createGroundImage,
  drawBuildings,
  drawGraves,
  drawTerrain,
  drawUnits,
  drawView,
  offscreen,
  paintFog,
} from './layers';
import { minimapTransform } from './transform';

/** Draws the minimap on `canvas`, reusing the layers that haven't changed. */
function createPainter(canvas: HTMLCanvasElement, pixelRatio: number) {
  const { world } = useGameStore.getState();
  const pixels = canvas.width;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  const transform = minimapTransform(world.map.size, pixels);
  const ground = createGroundImage(world);
  const terrain = offscreen(pixels, pixels);
  let terrainNodes: unknown = null;
  let fog: ReturnType<typeof offscreen> | null = null;
  let fogVersion = -1;
  /** The vision painted last: the dev inspector can switch to another player's. */
  let fogOf: unknown = null;

  return () => {
    const { state } = useGameStore.getState();
    // Changes only when a unit of wood or stone is taken; redraw when one runs out.
    const depleted = Object.values(state.resourceNodes).filter((left) => left === 0).length;
    if (terrainNodes !== depleted) {
      terrainNodes = depleted;
      drawTerrain(terrain.context, world, ground, state.resourceNodes, transform);
    }
    context.drawImage(terrain.canvas, 0, 0);
    drawBuildings(
      context,
      knownBuildings(state),
      (building) => toPlacedFootprint(building).footprint,
      transform,
      pixelRatio,
    );
    const vision = localVision();
    if (vision && !useSettingsStore.getState().revealMap) {
      fog ??= offscreen(vision.columns, vision.rows);
      if (fogOf !== vision || fogVersion !== vision.version) {
        fogOf = vision;
        fogVersion = vision.version;
        paintFog(fog.context, vision);
      }
      // Scaled up with smoothing, which softens the cell edges like the 3D fog.
      const covered = vision.columns * VISION_CELL * transform.scale;
      context.drawImage(fog.canvas, 0, 0, covered, covered);
    }
    drawUnits(context, state.units, (u) => shownAt(u.ownerId, u.x, u.z), transform, pixelRatio);
    const graves = state.graves.filter((g) => shownAt(g.ownerId, g.x, g.z));
    drawGraves(context, graves, transform, pixelRatio);
    const rig = cameraRig.current;
    if (rig) drawView(context, rig.viewCorners(), transform, pixelRatio);
  };
}

/** The world point under the pointer; outside the minimap, the nearest point on it. */
function pointerWorld(event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const size = useGameStore.getState().world.map.size;
  return minimapTransform(size, rect.width).toWorld(
    (event.clientX - rect.left) / rect.width,
    (event.clientY - rect.top) / rect.height,
  );
}

/** Sends the selected units to a minimap point, if they can get near it. */
function sendSelected(type: 'moveUnits' | 'attackMove', x: number, z: number): void {
  const unitIds = useSelectionStore.getState().units;
  if (unitIds.length === 0) return;
  const destination = orderPoint(x, z);
  if (destination) orderToGround(type, unitIds, { x, z }, destination);
}

/**
 * The whole playable area, north up, as the local player knows it: terrain, fog, walls,
 * buildings and units in their owners' colors, and what the camera shows. Left click or
 * drag moves the camera; right click sends the selected units there. While attack-move
 * waits (F), a left click attack-moves instead.
 */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redrawRef = useRef<() => void>(() => {});
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    canvas.width = canvas.height = Math.round(MINIMAP_SIZE * pixelRatio);
    const paint = createPainter(canvas, pixelRatio);
    redrawRef.current = paint;
    paint();
    const timer = window.setInterval(paint, MINIMAP_REDRAW_MS);
    return () => window.clearInterval(timer);
  }, []);

  const lookAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, z } = pointerWorld(event);
    cameraRig.current?.lookAt(x, z);
    // The view outline follows the drag at once, not only at the next timed redraw.
    redrawRef.current();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const modes = useCommandModeStore.getState();
    if (event.button === 2) {
      // As in the 3D view, a right click cancels a waiting attack-move.
      if (modes.mode) modes.setMode(null);
      else {
        const { x, z } = pointerWorld(event);
        sendSelected('moveUnits', x, z);
      }
      return;
    }
    if (event.button !== 0) return;
    if (modes.mode === 'attackMove' && selectionKinds().fighters) {
      const { x, z } = pointerWorld(event);
      sendSelected('attackMove', x, z);
      if (!event.shiftKey) modes.setMode(null);
      return;
    }
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    lookAt(event);
  };

  const stopDragging = () => {
    dragging.current = false;
  };

  return (
    <section className="minimap hud-panel" aria-label="Minimap">
      <canvas
        ref={canvasRef}
        style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (dragging.current) lookAt(event);
        }}
        onPointerUp={stopDragging}
        onLostPointerCapture={stopDragging}
        onContextMenu={(event) => event.preventDefault()}
      />
    </section>
  );
}
