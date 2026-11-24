import type { PlacementIssue } from '@roe/sim';

/**
 * Player-facing explanation for each failed placement rule. The construction menu
 * names the missing resources itself (`notEnoughResources`).
 */
export const PLACEMENT_MESSAGES: Record<PlacementIssue | 'notEnoughResources', string> = {
  unknownBuilding: 'Unknown building',
  notBuildable: 'This building cannot be built',
  offGrid: 'Not on the building grid',
  badRotation: 'Invalid rotation',
  outOfBounds: 'Outside the realm',
  water: 'Too close to water',
  slope: 'Ground is too steep',
  building: 'Too close to another building',
  path: 'Blocks a path',
  tree: 'Trees in the way',
  rock: 'Rocks in the way',
  // Replaced by the ore in `issueMessage` ("Must be built on a gold deposit").
  deposit: 'Must be built on an ore deposit',
  notEnoughResources: 'Not enough resources',
};
