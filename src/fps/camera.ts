import { Ball, Capsule, QueryFilterFlags, Ray } from '@dimforge/rapier3d-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type { TargetId } from './model';
import { PLAYER_SPAWN } from './model';
import { PLAYER_HALF_SEGMENT, PLAYER_RADIUS } from './physics';

export type CameraVector = { x: number; y: number; z: number };
export const CAMERA_MIN_DISTANCE = 2;
export const CAMERA_MAX_DISTANCE = 6;
export const CAMERA_DEFAULT_DISTANCE = 4.2;
export const CAMERA_RADIUS = 0.22;
export const INTERACTION_REACH = 3;
export const HERO_FEET_OFFSET = PLAYER_HALF_SEGMENT + PLAYER_RADIUS;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/** Retraction is immediate: smoothing an obstructed boom would cross the wall. */
export function smoothCameraDistance(previous: number, allowed: number, dt: number): number {
  return allowed < previous ? allowed : previous + (allowed - previous) * (1 - Math.exp(-5 * Math.max(0, dt)));
}

export function turnToward(previous: number, desired: number, dt: number): number {
  const delta = Math.atan2(Math.sin(desired - previous), Math.cos(desired - previous));
  return previous + delta * (1 - Math.exp(-15 * Math.max(0, dt)));
}

/** Reused Rapier query shapes/rays. No Three objects or React state in the hot path. */
export class ThirdPersonQueries {
  private readonly cameraShape = new Ball(CAMERA_RADIUS);
  private readonly restoreShape = new Capsule(PLAYER_HALF_SEGMENT - 0.015, PLAYER_RADIUS - 0.025);
  private readonly ray = new Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  private readonly origin = { x: 0, y: 0, z: 0 };
  private readonly direction = { x: 0, y: 0, z: 0 };
  private heldHandle: number | undefined;
  private readonly filter = (collider: { handle: number }) => collider.handle !== this.heldHandle;

  cameraDistance(world: World, pivot: CameraVector, away: CameraVector, requested: number, player: RigidBody, held?: RigidBody): number {
    this.heldHandle = held?.collider(0).handle;
    const hit = world.castShape(pivot, IDENTITY, away, this.cameraShape, 0.02, requested, true,
      QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, player, this.filter);
    return hit ? Math.max(0, hit.time_of_impact - 0.035) : requested;
  }

  /** The camera selects a surface; the hero must independently reach and see it. */
  interactionTarget(world: World, cameraPosition: CameraVector, cameraDirection: CameraVector, player: RigidBody, held?: RigidBody): TargetId | null {
    this.heldHandle = held?.collider(0).handle;
    this.ray.origin = cameraPosition;
    this.ray.dir = cameraDirection;
    const hit = world.castRay(this.ray, CAMERA_MAX_DISTANCE + INTERACTION_REACH + 2, true,
      QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, player, this.filter);
    const data = hit?.collider.parent()?.userData as { target?: TargetId } | undefined;
    if (!hit || !data?.target) return null;

    const hero = player.translation();
    this.origin.x = hero.x; this.origin.y = hero.y + 0.4; this.origin.z = hero.z;
    this.direction.x = cameraPosition.x + cameraDirection.x * hit.timeOfImpact - this.origin.x;
    this.direction.y = cameraPosition.y + cameraDirection.y * hit.timeOfImpact - this.origin.y;
    this.direction.z = cameraPosition.z + cameraDirection.z * hit.timeOfImpact - this.origin.z;
    const distance = Math.hypot(this.direction.x, this.direction.y, this.direction.z);
    if (distance > INTERACTION_REACH || distance < 0.001) return null;
    this.direction.x /= distance; this.direction.y /= distance; this.direction.z /= distance;
    this.ray.origin = this.origin; this.ray.dir = this.direction;
    const visible = world.castRay(this.ray, distance + 0.035, true,
      QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, player, this.filter);
    return visible?.collider.handle === hit.collider.handle ? data.target : null;
  }

  /** Saved positions stay untouched unless the updated map intersects the capsule. */
  restorePosition(world: World, player: RigidBody, held?: RigidBody): CameraVector | null {
    this.heldHandle = held?.collider(0).handle;
    const requested = player.translation();
    const clear = (position: CameraVector) => !world.intersectionWithShape(position, IDENTITY, this.restoreShape,
      QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, player, this.filter);
    if (requested.y > -1 && clear(requested)) return null;

    // This runs once after the broadphase has been populated, never every frame.
    for (const centre of [requested, { x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] }]) {
      for (const radius of [0, 0.65, 1.3, 2.2, 3.4]) {
        for (let angle = 0; angle < (radius ? 8 : 1); angle++) {
          const x = centre.x + Math.sin(angle * Math.PI / 4) * radius;
          const z = centre.z + Math.cos(angle * Math.PI / 4) * radius;
          this.origin.x = x; this.origin.y = Math.max(centre.y + 0.4, 2); this.origin.z = z;
          this.direction.x = 0; this.direction.y = -1; this.direction.z = 0;
          this.ray.origin = this.origin; this.ray.dir = this.direction;
          const floor = world.castRay(this.ray, 8, true, QueryFilterFlags.EXCLUDE_SENSORS,
            undefined, undefined, player, this.filter);
          if (!floor) continue;
          const position = { x, y: this.origin.y - floor.timeOfImpact + HERO_FEET_OFFSET + 0.025, z };
          if (clear(position)) return position;
        }
      }
    }
    return { x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] };
  }
}
