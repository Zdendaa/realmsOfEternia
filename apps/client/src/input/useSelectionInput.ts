import { useThree } from '@react-three/fiber';
import type { EntityId } from '@roe/shared';
import type { Command } from '@roe/sim';
import { useEffect } from 'react';
import { Raycaster, Vector2, Vector3, type Camera } from 'three';
import { pickBuilding } from '../render/picking/pickBuilding';
import { unitAt, unitsInBox } from '../render/picking/screenPick';
import { pickGround } from '../render/placement/groundPick';
import { LOCAL_PLAYER, useGameStore } from '../state/gameStore';
import { usePlacementStore } from '../state/placementStore';
import { useSelectionStore } from '../state/selectionStore';
import { dragBox } from '../ui/dragBox';

/** A press that moves less than this (px) is a click; more starts a box or a camera drag. */
const CLICK_TOLERANCE = 5;

const raycaster = new Raycaster();
const ndc = new Vector2();
const ground = new Vector3();

interface Press {
  x: number;
  y: number;
  /** The construction tool was active when the press started: placement input owns it. */
  placing: boolean;
  /** The left press has moved far enough to become a box selection. */
  boxing: boolean;
}

const ownUnitIds = (): EntityId[] =>
  useGameStore
    .getState()
    .state.units.filter((u) => u.ownerId === LOCAL_PLAYER)
    .map((u) => u.id);

function rayFrom(element: HTMLElement, camera: Camera, x: number, y: number) {
  const rect = element.getBoundingClientRect();
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}

/** Left click: a unit, else a building, else nothing. Shift adds/removes units. */
function clickSelect(element: HTMLElement, camera: Camera, x: number, y: number, add: boolean) {
  const selection = useSelectionStore.getState();
  const unit = unitAt(ownUnitIds(), camera, element.getBoundingClientRect(), x, y);
  if (unit !== null) {
    if (!add) selection.selectUnits([unit]);
    else if (selection.units.includes(unit)) {
      selection.selectUnits(selection.units.filter((id) => id !== unit));
    } else selection.selectUnits([...selection.units, unit]);
    return;
  }
  if (add) return;
  const { state, heights } = useGameStore.getState();
  const building = pickBuilding(rayFrom(element, camera, x, y), state.buildings, heights);
  selection.selectBuilding(building?.id ?? null);
}

/** Left drag: every own unit inside the box. Shift adds to the current selection. */
function boxSelect(
  element: HTMLElement,
  camera: Camera,
  press: Press,
  x: number,
  y: number,
  add: boolean,
) {
  const selection = useSelectionStore.getState();
  const rect = element.getBoundingClientRect();
  const boxed = unitsInBox(ownUnitIds(), camera, rect, press.x, press.y, x, y);
  selection.selectUnits(add ? [...new Set([...selection.units, ...boxed])] : boxed);
}

/**
 * Right click with units selected: on an own construction site the serfs build it,
 * anywhere else they walk to the clicked ground point.
 */
function commandSelected(element: HTMLElement, camera: Camera, x: number, y: number) {
  const unitIds = useSelectionStore.getState().units;
  if (unitIds.length === 0) return;
  const { state, heights, dispatch } = useGameStore.getState();
  const ray = rayFrom(element, camera, x, y);
  const building = pickBuilding(ray, state.buildings, heights);
  let command: Command | null = null;
  if (building?.status === 'construction' && building.ownerId === LOCAL_PLAYER) {
    command = { type: 'assignBuilders', unitIds: [...unitIds], siteId: building.id };
  } else if (pickGround(ray, heights, ground)) {
    command = { type: 'moveUnits', unitIds: [...unitIds], x: ground.x, z: ground.z };
  }
  if (command) dispatch(command);
}

/**
 * Selection and unit commands on the canvas:
 * - left click selects a unit or a building (Shift toggles units), left drag box-selects,
 * - right click (without dragging) sends the selected units, Esc clears the selection.
 * Presses that start while the construction tool is active belong to the placement input;
 * right drags rotate the camera.
 */
export function useSelectionInput() {
  const element = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let left: Press | null = null;
    let right: Press | null = null;

    const onPointerDown = (event: PointerEvent) => {
      const placing = usePlacementStore.getState().selected !== null;
      const press = { x: event.clientX, y: event.clientY, placing, boxing: false };
      if (event.button === 0) left = press;
      if (event.button === 2) right = press;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!left || left.placing) return;
      const moved = Math.hypot(event.clientX - left.x, event.clientY - left.y);
      if (!left.boxing && moved > CLICK_TOLERANCE) left.boxing = true;
      if (left.boxing) dragBox.show(left.x, left.y, event.clientX, event.clientY);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button === 0 && left) {
        const press = left;
        left = null;
        dragBox.hide();
        if (press.placing) return;
        if (press.boxing)
          boxSelect(element, camera, press, event.clientX, event.clientY, event.shiftKey);
        else clickSelect(element, camera, event.clientX, event.clientY, event.shiftKey);
      }
      if (event.button === 2 && right) {
        const press = right;
        right = null;
        const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
        if (!press.placing && moved <= CLICK_TOLERANCE) {
          commandSelected(element, camera, event.clientX, event.clientY);
        }
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && !usePlacementStore.getState().selected) {
        useSelectionStore.getState().clear();
      }
    };

    // Presses start on the canvas; moves and releases are tracked on the window, so a box
    // dragged over the HUD or outside the canvas still finishes.
    element.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      dragBox.hide();
    };
  }, [element, camera]);
}
