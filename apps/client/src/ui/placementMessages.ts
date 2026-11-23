import type { PlacementIssue } from '@roe/sim';

/** Player-facing explanation for each failed placement rule. */
export const PLACEMENT_MESSAGES: Record<PlacementIssue, string> = {
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
};
