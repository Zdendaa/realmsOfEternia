/** Identifies a player within a match (lobby slot or session id). */
export type PlayerId = string;

/** Unique identifier of any simulated entity (unit, building, resource node...). */
export type EntityId = number;

/** Position on the ground plane, in world units. The ground is the X/Z plane. */
export interface Vec2 {
  x: number;
  z: number;
}
