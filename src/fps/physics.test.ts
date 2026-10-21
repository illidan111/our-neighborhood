import { afterEach, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { carryPosition, configureCharacter, FIXED_STEP, PLAYER_HALF_SEGMENT, PLAYER_RADIUS, stepCharacter } from "./physics";
import type { CharacterMotion, MovementIntent } from "./physics";

beforeAll(async () => { await RAPIER.init(); });
const worlds: RAPIER.World[] = [];
afterEach(() => { for (const world of worlds) world.free(); worlds.length = 0; });

function fixture() {
  const world = new RAPIER.World({ x: 0, y: -19, z: 0 });
  world.timestep = FIXED_STEP;
  worlds.push(world);
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.2, 30), floor);
  const player = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 1));
  const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF_SEGMENT, PLAYER_RADIUS), player);
  const controller = configureCharacter(world);
  const motion: CharacterMotion = { verticalVelocity: 0, grounded: false };
  const input: MovementIntent = { forward: 0, right: 0, sprint: false, jump: false, yaw: 0 };
  const step = (count = 1) => {
    for (let i = 0; i < count; i++) {
      stepCharacter(controller, player, capsule, input, motion, FIXED_STEP);
      world.step();
      input.jump = false;
    }
  };
  // Seed the broadphase and settle the capsule through the same movement path used in the app.
  world.step(); step(30);
  return { world, player, capsule, controller, motion, input, step };
}

describe("real Rapier character and portable-object physics", () => {
  it("stands on the ground without sinking for ten simulated seconds", () => {
    const game = fixture();
    game.step(600);
    expect(game.motion.grounded).toBe(true);
    expect(game.player.translation().y).toBeGreaterThan(0.89);
    expect(game.player.translation().y).toBeLessThan(0.94);
  });

  it("blocks walls and slides along them while moving diagonally", () => {
    const game = fixture();
    const wall = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(2, 2, 0));
    game.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2, 12), wall);
    game.world.step();
    game.input.right = 1; game.input.forward = 1;
    game.step(180);
    expect(game.player.translation().x).toBeLessThan(1.61);
    expect(game.player.translation().x).toBeGreaterThan(1.5);
    expect(game.player.translation().z).toBeLessThan(-6);
  });

  it("climbs a gentle ramp and steps onto a low doorstep", () => {
    const game = fixture();
    const ramp = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.8, -4)
      .setRotation({ x: Math.sin(0.09), y: 0, z: 0, w: Math.cos(0.09) }));
    game.world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.1, 4), ramp);
    game.world.step();
    game.input.forward = 1;
    game.step(95);
    expect(game.player.translation().z).toBeLessThan(-5);
    expect(game.player.translation().y).toBeGreaterThan(1.8);
    expect(game.motion.grounded).toBe(true);
  });

  it("jumps once from the ground, cannot double jump, and lands", () => {
    const game = fixture();
    const groundY = game.player.translation().y;
    game.input.jump = true; game.step(15);
    expect(game.player.translation().y).toBeGreaterThan(groundY + 0.7);
    const velocityBefore = game.motion.verticalVelocity;
    game.input.jump = true; game.step();
    expect(game.motion.verticalVelocity).toBeLessThan(velocityBefore);
    game.step(100);
    expect(game.motion.grounded).toBe(true);
    expect(game.player.translation().y).toBeCloseTo(groundY, 2);
  });

  it("produces the same distance at 30, 60 and 144 render frames per second", () => {
    const distances = [30, 60, 144].map((fps) => {
      const game = fixture();
      game.input.forward = 1;
      let accumulator = 0;
      for (let frame = 0; frame < fps * 3; frame++) {
        accumulator += 1 / fps;
        while (accumulator + 1e-9 >= FIXED_STEP) { game.step(); accumulator -= FIXED_STEP; }
      }
      return game.player.translation().z;
    });
    expect(Math.abs(distances[0] - (1 - 3 * 4.2))).toBeLessThan(0.02);
    expect(distances[1]).toBeCloseTo(distances[0], 5);
    expect(distances[2]).toBeCloseTo(distances[0], 5);
  });

  it("normalizes diagonal motion and follows the viewing yaw", () => {
    const diagonal = fixture();
    diagonal.input.forward = 1; diagonal.input.right = 1; diagonal.step(60);
    expect(Math.abs(Math.hypot(diagonal.player.translation().x, diagonal.player.translation().z - 1) - 4.2)).toBeLessThan(0.02);
    const turned = fixture();
    turned.input.forward = 1; turned.input.yaw = Math.PI / 2; turned.step(60);
    expect(Math.abs(turned.player.translation().x + 4.2)).toBeLessThan(0.02);
    expect(turned.player.translation().z).toBeCloseTo(1, 3);
  });

  it("sweeps a carried item's full size against a wall instead of crossing it", () => {
    const game = fixture();
    const wall = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1, 1.5, 0));
    game.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 1.5, 2), wall);
    const item = game.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.8, 0));
    game.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3), item);
    game.world.step();
    const safe = carryPosition(game.world, item, game.player, { x: 2, y: 0.8, z: 0 });
    item.setNextKinematicTranslation(safe); game.world.step();
    expect(item.translation().x).toBeGreaterThan(0.5);
    expect(item.translation().x).toBeLessThan(0.6);
  });

  it("lifts a resting item from the floor and lets a thrown item fall and settle", () => {
    const game = fixture();
    const item = game.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-2, 2, 0)
      .setCcdEnabled(true).setLinearDamping(0.35).setAngularDamping(1.6));
    game.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setFriction(0.8).setRestitution(0.08), item);
    for (let i = 0; i < 180; i++) game.world.step();
    expect(item.translation().y).toBeCloseTo(0.3, 1);
    item.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    const safe = carryPosition(game.world, item, game.player, { x: -2, y: 1.5, z: 0 });
    expect(safe.y).toBeGreaterThan(1.4);
    item.setNextKinematicTranslation(safe); game.world.step();
    item.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    item.setLinvel({ x: 0, y: 2, z: -7.5 }, true);
    for (let i = 0; i < 240; i++) game.world.step();
    expect(item.translation().z).toBeLessThan(-3);
    expect(item.translation().y).toBeGreaterThan(0.27);
    expect(item.translation().y).toBeLessThan(0.35);
    expect(Math.hypot(...Object.values(item.linvel()))).toBeLessThan(0.05);
  });
});
