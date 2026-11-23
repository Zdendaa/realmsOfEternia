import type { HeightField, PlayerId } from '@roe/shared';
import { checkPlacement, quarterTurnsToRadians, type PlacementCheck } from '../rules/placement.js';
import type { BuildingInstance, GameState } from '../state/gameState.js';
import type { SimWorld } from '../world/createWorld.js';
import type { Command } from './types.js';

export type CommandResult =
  { ok: true; state: GameState } | { ok: false; state: GameState; check: PlacementCheck };

/** Checks whether `issuer` may execute `command` in `state`. */
export function validateCommand(
  world: SimWorld,
  state: GameState,
  _issuer: PlayerId,
  command: Command,
  heights?: HeightField,
): PlacementCheck {
  switch (command.type) {
    case 'placeBuilding':
      // Ownership and resources join the rules with the economy; the issuer is already
      // part of the signature so callers can't forget to pass the session's player.
      return checkPlacement(world, state, command, heights);
  }
}

/**
 * Validates and executes a command. Pure: returns a new state and never mutates the
 * given one. A rejected command returns the unchanged state (same reference).
 */
export function applyCommand(
  world: SimWorld,
  state: GameState,
  issuer: PlayerId,
  command: Command,
  heights?: HeightField,
): CommandResult {
  const check = validateCommand(world, state, issuer, command, heights);
  if (!check.ok) return { ok: false, state, check };

  switch (command.type) {
    case 'placeBuilding': {
      const building: BuildingInstance = {
        id: state.nextEntityId,
        type: command.building,
        x: command.x,
        z: command.z,
        rotation: quarterTurnsToRadians(command.quarterTurns),
        ownerId: issuer,
        status: 'complete',
      };
      return {
        ok: true,
        state: { buildings: [...state.buildings, building], nextEntityId: state.nextEntityId + 1 },
      };
    }
  }
}
