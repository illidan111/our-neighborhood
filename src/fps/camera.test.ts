import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { CAMERA_RADIUS, ThirdPersonQueries, smoothCameraDistance, turnToward } from './camera';
import { PLAYER_HALF_SEGMENT, PLAYER_RADIUS } from './physics';

beforeAll(async () => { await RAPIER.init(); });
const worlds: RAPIER.World[] = [];
afterEach(() => { for (const world of worlds) world.free(); worlds.length = 0; });
const direction = (from: RAPIER.Vector, to: RAPIER.Vector) => {
  const x = to.x - from.x, y = to.y - from.y, z = to.z - from.z;
  const distance = Math.hypot(x, y, z);
  return { x: x / distance, y: y / distance, z: z / distance };
};

function fixture() {
  const world = new RAPIER.World({ x: 0, y: -19, z: 0 });
  worlds.push(world);
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.2, 30), floor);
  const player = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.925, 0));
  world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF_SEGMENT, PLAYER_RADIUS), player);
  const queries = new ThirdPersonQueries();
  const box = (position: RAPIER.Vector, half: RAPIER.Vector, target?: string) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z), body);
    if (target) body.userData = { target };
    return body;
  };
  world.step();
  return { world, player, queries, box };
}

describe('third-person camera and hero interaction against real Rapier colliders', () => {
  it('keeps the camera sphere in front of a wall and excludes its own player body', () => {
    const { world, player, queries, box } = fixture();
    box({ x: 0, y: 2, z: 3 }, { x: 4, y: 2, z: 0.1 }); world.step();
    const allowed = queries.cameraDistance(world, { x: 0, y: 1.45, z: 0 }, { x: 0, y: 0, z: 1 }, 4.2, player);
    expect(allowed).toBeGreaterThan(2.5);
    expect(allowed + CAMERA_RADIUS).toBeLessThan(2.9);
  });

  it('blocks ground and ceiling while orbiting vertically', () => {
    const { world, player, queries, box } = fixture();
    const pivot = { x: 0, y: 1.45, z: 0 };
    const down = { x: 0, y: -0.8, z: 0.6 };
    const low = queries.cameraDistance(world, pivot, down, 5, player);
    expect(pivot.y + low * down.y).toBeGreaterThan(CAMERA_RADIUS);
    expect(low).toBeLessThan(1.6);
    box({ x: 0, y: 2.5, z: 0 }, { x: 8, y: 0.1, z: 8 }); world.step();
    const up = { x: 0, y: 0.8, z: 0.6 };
    const high = queries.cameraDistance(world, pivot, up, 5, player);
    expect(pivot.y + high * up.y + CAMERA_RADIUS).toBeLessThan(2.4);
  });

  it('retracts immediately and returns smoothly without frame-rate dependent drift', () => {
    expect(smoothCameraDistance(4.2, 0.8, 1 / 144)).toBe(0.8);
    const run = (fps: number) => {
      let distance = 0.8;
      for (let i = 0; i < fps; i++) distance = smoothCameraDistance(distance, 4.2, 1 / fps);
      return distance;
    };
    expect(run(30)).toBeCloseTo(run(144), 10);
    expect(smoothCameraDistance(0.8, 4.2, 1 / 60)).toBeLessThan(1.1);
    expect(turnToward(Math.PI - 0.1, -Math.PI + 0.1, 1 / 60)).toBeGreaterThan(Math.PI - 0.1);
  });

  it('allows an unobstructed nearby target selected from a camera several metres behind the hero', () => {
    const { world, player, queries, box } = fixture();
    const target = { x: 0, y: 1, z: -2 };
    box(target, { x: 0.25, y: 0.3, z: 0.25 }, 'battery'); world.step();
    const camera = { x: 0, y: 2.1, z: 4 };
    expect(queries.interactionTarget(world, camera, direction(camera, target), player)).toBe('battery');
  });

  it('rejects a camera-visible item when a wall blocks the hero-to-item line', () => {
    const { world, player, queries, box } = fixture();
    const target = { x: 0, y: 1, z: -2 };
    const item = box(target, { x: 0.2, y: 0.2, z: 0.2 }, 'crate');
    box({ x: 0, y: 0.9, z: -1 }, { x: 0.25, y: 0.9, z: 0.1 }); world.step();
    const camera = { x: 3, y: 2, z: 3 }, rayDirection = direction(camera, target);
    const hit = world.castRay(new RAPIER.Ray(camera, rayDirection), 10, true, undefined, undefined, undefined, player);
    expect(hit?.collider.parent()?.handle).toBe(item.handle); // Camera alone really can see it.
    expect(queries.interactionTarget(world, camera, rayDirection, player)).toBeNull();
  });

  it('rejects a target near the camera but too far from the hero', () => {
    const { world, player, queries, box } = fixture();
    const target = { x: 0, y: 1, z: 5.5 };
    box(target, { x: 0.2, y: 0.2, z: 0.2 }, 'boards'); world.step();
    const camera = { x: 0, y: 1.5, z: 4 };
    expect(queries.interactionTarget(world, camera, direction(camera, target), player)).toBeNull();
  });

  it('excludes the carried item from both the camera boom and interaction visibility', () => {
    const { world, player, queries, box } = fixture();
    const target = { x: 0, y: 1.325, z: -2 };
    box(target, { x: 0.25, y: 0.3, z: 0.25 }, 'home_supply');
    const held = box({ x: 0, y: 1.325, z: -0.55 }, { x: 0.43, y: 0.36, z: 0.33 }, 'crate'); world.step();
    const camera = { x: 0, y: 1.325, z: 4 };
    expect(queries.interactionTarget(world, camera, direction(camera, target), player, held)).toBe('home_supply');
    held.setTranslation({ x: 0, y: 1.45, z: 2 }, true); world.step();
    expect(queries.cameraDistance(world, { x: 0, y: 1.45, z: 0 }, { x: 0, y: 0, z: 1 }, 4.2, player, held)).toBe(4.2);
  });

  it('preserves a valid checkpoint and relocates an embedded capsule to nearby free ground', () => {
    const { world, player, queries, box } = fixture();
    expect(queries.restorePosition(world, player)).toBeNull();
    box({ x: 0, y: 1.6, z: 0 }, { x: 0.3, y: 1.6, z: 2 }); world.step();
    const safe = queries.restorePosition(world, player);
    expect(safe).not.toBeNull();
    expect(Math.abs(safe!.x)).toBeGreaterThan(0.6);
    expect(safe!.y).toBeCloseTo(0.925, 2);
    player.setTranslation(safe!, true); player.setNextKinematicTranslation(safe!); world.step();
    expect(queries.restorePosition(world, player)).toBeNull();
  });
});
