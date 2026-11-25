import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { Camera } from 'three';
import { commandFeedback } from '../render/commands/commandFeedback';
import { unitsInBox } from '../render/picking/screenPick';
import { useGameStore } from '../state/gameStore';
import { useCommandModeStore } from '../state/commandModeStore';
import { usePlacementStore } from '../state/placementStore';
import { useSelectionStore } from '../state/selectionStore';
import { dragBox } from '../ui/dragBox';
import { attackMoveIntent, commandIntent, type CommandIntent } from './cursorKind';
import { ownUnitIds, pickPointerTarget } from './pointerTarget';
import { selectionKinds } from './selectionKinds';

/** Keys typed into a form field are not commands. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/** A press that moves less than this (px) is a click; more starts a box or a camera drag. */
const CLICK_TOLERANCE = 5;

interface Press {
  x: number;
  y: number;
  /** The construction tool was active when the press started: placement input owns it. */
  placing: boolean;
  /** The left press has moved far enough to become a box selection. */
  boxing: boolean;
}

/** Left click: a unit, else a building, else nothing. Shift adds/removes units. */
function clickSelect(element: HTMLElement, camera: Camera, x: number, y: number, add: boolean) {
  const selection = useSelectionStore.getState();
  const target = pickPointerTarget(element, camera, x, y);
  const unit = target.unitId;
  if (unit !== null) {
    if (!add) selection.selectUnits([unit]);
    else if (selection.units.includes(unit)) {
      selection.selectUnits(selection.units.filter((id) => id !== unit));
    } else selection.selectUnits([...selection.units, unit]);
    return;
  }
  if (add) return;
  selection.selectBuilding(target.building?.id ?? null);
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

/** Attacks `targetId` with the selected units; a red marker under the target when accepted. */
function attackUnit(unitIds: readonly number[], targetId: number) {
  const { dispatch, heights, state } = useGameStore.getState();
  const result = dispatch({ type: 'attack', unitIds: [...unitIds], targetId });
  const target =
    state.units.find((u) => u.id === targetId) ?? state.buildings.find((b) => b.id === targetId);
  if (result.ok && target) {
    commandFeedback.push({
      kind: 'move',
      x: target.x,
      y: heights.getHeightAt(target.x, target.z),
      z: target.z,
      attack: true,
    });
  }
}

/**
 * Left click while attack-move waits (F): attack the enemy under the pointer, or
 * attack-move to the point. Shift keeps the mode for further orders.
 */
function attackMoveSelected(
  element: HTMLElement,
  camera: Camera,
  x: number,
  y: number,
  keep: boolean,
) {
  const unitIds = useSelectionStore.getState().units;
  const intent: CommandIntent = attackMoveIntent(pickPointerTarget(element, camera, x, y));
  if (intent.kind === 'attack') attackUnit(unitIds, intent.targetId);
  else if (intent.kind === 'move') {
    const { dispatch, heights } = useGameStore.getState();
    const result = dispatch({
      type: 'attackMove',
      unitIds: [...unitIds],
      x: intent.x,
      z: intent.z,
    });
    const { x: dx, z: dz } = intent.destination;
    if (result.ok) {
      commandFeedback.push({
        kind: 'move',
        x: dx,
        y: heights.getHeightAt(dx, dz),
        z: dz,
        attack: true,
      });
    }
  } else return;
  if (!keep) useCommandModeStore.getState().setMode(null);
}

/** X: the selected units stop what they are doing. */
function stopSelected() {
  const unitIds = useSelectionStore.getState().units;
  if (unitIds.length > 0) useGameStore.getState().dispatch({ type: 'stop', unitIds: [...unitIds] });
}

/** F: attack-move waits for a target click, if any selected unit fights. */
function startAttackMove() {
  if (selectionKinds().fighters) useCommandModeStore.getState().setMode('attackMove');
}

/**
 * Right click with units selected (see `commandIntent`): attack an enemy (soldiers),
 * build an own construction site, harvest a tree or rock, or walk. Blocked spots do
 * nothing, matching the "not allowed" cursor. Accepted commands get a marker.
 */
function commandSelected(element: HTMLElement, camera: Camera, x: number, y: number) {
  const unitIds = useSelectionStore.getState().units;
  if (unitIds.length === 0) return;
  const target = pickPointerTarget(element, camera, x, y);
  const intent = commandIntent(target, selectionKinds(unitIds).fighters);
  const { dispatch, heights } = useGameStore.getState();
  if (intent.kind === 'attack') {
    attackUnit(unitIds, intent.targetId);
  } else if (intent.kind === 'build' && target.building) {
    const site = target.building;
    const result = dispatch({ type: 'assignBuilders', unitIds: [...unitIds], siteId: site.id });
    if (result.ok) {
      commandFeedback.push({ kind: 'build', site, groundY: heights.getHeightAt(site.x, site.z) });
    }
  } else if (intent.kind === 'gather') {
    const { node } = intent;
    const result = dispatch({ type: 'gather', unitIds: [...unitIds], nodeId: node.id });
    if (result.ok) {
      commandFeedback.push({
        kind: 'move',
        x: node.x,
        y: heights.getHeightAt(node.x, node.z),
        z: node.z,
      });
    }
  } else if (intent.kind === 'move') {
    const result = dispatch({ type: 'moveUnits', unitIds: [...unitIds], x: intent.x, z: intent.z });
    // The marker shows where the units end up: on the shore for a click into water.
    const { x, z } = intent.destination;
    if (result.ok) commandFeedback.push({ kind: 'move', x, y: heights.getHeightAt(x, z), z });
  }
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
        // Attack-move ends when no selected unit can fight any more.
        if (!selectionKinds().fighters) useCommandModeStore.getState().setMode(null);
        if (useCommandModeStore.getState().mode === 'attackMove' && !press.boxing) {
          attackMoveSelected(element, camera, event.clientX, event.clientY, event.shiftKey);
          return;
        }
        if (press.boxing)
          boxSelect(element, camera, press, event.clientX, event.clientY, event.shiftKey);
        else clickSelect(element, camera, event.clientX, event.clientY, event.shiftKey);
      }
      if (event.button === 2 && right) {
        const press = right;
        right = null;
        const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
        if (!press.placing && moved <= CLICK_TOLERANCE) {
          // A right click cancels a waiting attack-move instead of commanding.
          if (useCommandModeStore.getState().mode) useCommandModeStore.getState().setMode(null);
          else commandSelected(element, camera, event.clientX, event.clientY);
        }
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || usePlacementStore.getState().selected) return;
      if (event.code === 'Escape') {
        // First cancel a waiting attack-move, then clear the selection.
        const modes = useCommandModeStore.getState();
        if (modes.mode) modes.setMode(null);
        else useSelectionStore.getState().clear();
      } else if (event.code === 'KeyF' && !event.repeat) startAttackMove();
      else if (event.code === 'KeyX' && !event.repeat) stopSelected();
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
