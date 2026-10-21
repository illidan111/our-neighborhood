import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { QueryFilterFlags } from "@dimforge/rapier3d-compat";
import type { ItemId, Vec3 } from "./model";

export const FIXED_STEP = 1 / 60;
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HALF_SEGMENT = 0.6;
export const PLAYER_EYE_OFFSET = 0.75;
export const ITEM_HALF_SIZES: Record<ItemId, Vec3> = {
  crate: [0.43, 0.36, 0.33], battery: [0.28, 0.34, 0.22], boards: [0.66, 0.13, 0.22],
};

export function configureCharacter(world: World): KinematicCharacterController {
  const controller = world.createCharacterController(0.015);
  controller.enableAutostep(0.28, 0.28, false);
  controller.enableSnapToGround(0.23);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI / 3);
  controller.setApplyImpulsesToDynamicBodies(false);
  return controller;
}

/** Intent is independent of rendering and can later be sent over a transport. */
export type MovementIntent = { forward: number; right: number; sprint: boolean; jump: boolean; yaw: number };
export type CharacterMotion = { verticalVelocity: number; grounded: boolean };

export function stepCharacter(
  controller: KinematicCharacterController,
  body: RigidBody,
  collider: Collider,
  intent: MovementIntent,
  motion: CharacterMotion,
  dt: number,
  ignoredBody?: RigidBody,
): void {
  const axisLength = Math.hypot(intent.right, intent.forward);
  const speed = intent.sprint ? 6.8 : 4.2;
  const right = axisLength ? intent.right / axisLength : 0;
  const forward = axisLength ? intent.forward / axisLength : 0;
  if (intent.jump && motion.grounded) {
    motion.verticalVelocity = 6.2;
    motion.grounded = false;
  }
  motion.verticalVelocity = Math.max(-24, motion.verticalVelocity - 19 * dt);
  if (motion.verticalVelocity > 0) controller.disableSnapToGround();
  else controller.enableSnapToGround(0.23);
  // Rapier 0.19 keeps its collider set borrowed during the query. Read handles
  // before entering the filter; querying collider methods inside it leaks that borrow.
  const ignoredColliderHandle = ignoredBody?.collider(0).handle;
  controller.computeColliderMovement(collider, {
    x: (Math.cos(intent.yaw) * right - Math.sin(intent.yaw) * forward) * speed * dt,
    y: motion.verticalVelocity * dt,
    z: (-Math.sin(intent.yaw) * right - Math.cos(intent.yaw) * forward) * speed * dt,
  }, QueryFilterFlags.EXCLUDE_SENSORS, undefined, (obstacle) => obstacle.handle !== ignoredColliderHandle);
  const delta = controller.computedMovement();
  const position = body.translation();
  body.setNextKinematicTranslation({ x: position.x + delta.x, y: position.y + delta.y, z: position.z + delta.z });
  motion.grounded = controller.computedGrounded();
  if (motion.grounded && motion.verticalVelocity < 0) motion.verticalVelocity = 0;
  // A low ceiling must not consume several jump frames while the head is pinned.
  if (motion.verticalVelocity > 0 && delta.y < motion.verticalVelocity * dt * 0.5) motion.verticalVelocity = 0;
}

/** Sweep the real item shape instead of teleporting it through an obstacle. */
export function carryPosition(world: World, item: RigidBody, player: RigidBody, desired: { x: number; y: number; z: number }) {
  const current = item.translation();
  const delta = { x: desired.x - current.x, y: desired.y - current.y, z: desired.z - current.z };
  const collider = item.collider(0);
  const hit = world.castShape(current, item.rotation(), delta, collider.shape, 0.025, 1, false,
    QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider, player);
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const fraction = hit ? Math.max(0, hit.time_of_impact - 0.012 / Math.max(length, 0.001)) : 1;
  return { x: current.x + delta.x * fraction, y: current.y + delta.y * fraction, z: current.z + delta.z * fraction };
}
