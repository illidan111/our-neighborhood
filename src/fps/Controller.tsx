import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, CuboidCollider, RigidBody, interactionGroups, useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import type { KinematicCharacterController } from "@dimforge/rapier3d-compat";
import { Group, Quaternion, Vector3 } from "three";
import { ITEM_IDS, ITEM_SPAWNS, isInsideWorld, PLAYER_SPAWN } from "./model";
import type { FPSState, GameCommand, ItemId, TargetId, Vec3 } from "./model";
import { carryPosition, configureCharacter, ITEM_HALF_SIZES, PLAYER_HALF_SEGMENT, PLAYER_RADIUS, stepCharacter } from "./physics";
import type { CharacterMotion } from "./physics";
import { HeroAvatar } from "./CharacterAvatar";
import type { HeroMotion } from "./heroAnimation";
import { CAMERA_DEFAULT_DISTANCE, CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE, HERO_FEET_OFFSET, ThirdPersonQueries, smoothCameraDistance, turnToward } from "./camera";

/** Explicit review UI drives the real fixed-step controller without Pointer Lock. */
export type ControllerReviewInput = {
  forward: number; right: number; sprint: boolean; jump: boolean; steps: number;
  yaw?: number; pitch?: number; distance?: number;
  action?: 'interact' | 'drop' | 'throw';
};
export type ControllerPose = { position: Vec3; yaw: number; pitch: number; grounded: boolean;
  cameraPosition: Vec3; cameraDistance: number; heroHeading: number };
type ControllerProps = {
  state: FPSState;
  active: boolean;
  sensitivity: number;
  bob: boolean;
  onFocus: (target: TargetId | null) => void;
  onCommand: (command: GameCommand) => void;
  onMotion?: (walking: boolean) => void;
  onPose?: (pose: ControllerPose) => void;
  reviewInput?: MutableRefObject<ControllerReviewInput>;
};

// World uses group 0; the player uses 1; portable objects use 2.
const PLAYER_GROUPS = interactionGroups(1, [0, 2]);
const ITEM_GROUPS = interactionGroups(2, [0, 1, 2]);
const HELD_GROUPS = interactionGroups(2, [0, 2]);
const ZERO = { x: 0, y: 0, z: 0 };
const asTuple = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z];

export function ItemModel({ id }: { id: ItemId }) {
  if (id === "battery") return <group>
    <mesh castShadow><boxGeometry args={[0.56, 0.68, 0.44]} /><meshStandardMaterial color="#e9b72f" roughness={0.65} /></mesh>
    <mesh position={[0, 0, 0.226]}><boxGeometry args={[0.4, 0.43, 0.018]} /><meshStandardMaterial color="#304650" /></mesh>
    <mesh position={[0, 0.05, 0.24]}><boxGeometry args={[0.07, 0.21, 0.02]} /><meshStandardMaterial color="#fff2a7" emissive="#ffd75f" emissiveIntensity={0.3} /></mesh>
    <mesh position={[0, 0.05, 0.25]}><boxGeometry args={[0.2, 0.065, 0.02]} /><meshStandardMaterial color="#fff2a7" /></mesh>
    {[-0.17, 0.17].map((x) => <mesh key={x} position={[x, 0.36, 0]} castShadow><cylinderGeometry args={[0.045, 0.045, 0.07, 8]} /><meshStandardMaterial color={x < 0 ? "#e36a53" : "#364650"} /></mesh>)}
    <mesh position={[0, 0.39, 0]}><torusGeometry args={[0.12, 0.027, 4, 8, Math.PI]} /><meshStandardMaterial color="#304650" /></mesh>
  </group>;
  if (id === "boards") return <group>
    {[-0.075, 0.075].flatMap((y, i) => [-0.115, 0.115].map((z, j) => <mesh key={`${i}-${j}`} position={[0, y, z]} castShadow><boxGeometry args={[1.32, 0.105, 0.205]} /><meshStandardMaterial color={(i + j) % 2 ? "#bd8b52" : "#e3b46c"} /></mesh>))}
    {[-0.38, 0.38].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.045, 0.29, 0.46]} /><meshStandardMaterial color="#507c72" /></mesh>)}
  </group>;
  return <group>
    <mesh castShadow><boxGeometry args={[0.86, 0.72, 0.66]} /><meshStandardMaterial color="#dc9d54" /></mesh>
    {[-0.27, 0.27].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.09, 0.745, 0.685]} /><meshStandardMaterial color="#bd793e" /></mesh>)}
    <mesh position={[0, 0.01, 0.343]}><boxGeometry args={[0.3, 0.28, 0.015]} /><meshStandardMaterial color="#f7e8b5" /></mesh>
    <mesh position={[0, 0.01, 0.355]}><boxGeometry args={[0.05, 0.17, 0.013]} /><meshStandardMaterial color="#6c9269" /></mesh>
    <mesh position={[0, 0.01, 0.365]}><boxGeometry args={[0.17, 0.05, 0.013]} /><meshStandardMaterial color="#6c9269" /></mesh>
  </group>;
}

export default function Controller(props: ControllerProps) {
  const { state, active } = props;
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const player = useRef<RapierRigidBody>(null);
  const playerVisual = useRef<Group>(null);
  const heroVisual = useRef<Group>(null);
  const items = useRef<Partial<Record<ItemId, RapierRigidBody>>>({});
  const initial = useRef(state.checkpoint);
  const itemInitial = useRef(state.items);
  const current = useRef(props);
  current.current = props;
  const controller = useRef<KinematicCharacterController | null>(null);
  const input = useRef(new Set<string>());
  const jumpQueued = useRef(false);
  const angles = useRef({ yaw: state.checkpoint.yaw, pitch: Math.max(-0.95, Math.min(0.35, state.checkpoint.pitch || -0.24)) });
  const boom = useRef({ requested: CAMERA_DEFAULT_DISTANCE, actual: CAMERA_DEFAULT_DISTANCE });
  const heading = useRef(state.checkpoint.yaw + Math.PI);
  const heroMotion = useRef<HeroMotion>({ speed: 0, distance: 0, grounded: true, verticalVelocity: 0,
    held: state.held, heading: state.checkpoint.yaw + Math.PI, paused: !active });
  heroMotion.current.paused = !active;
  heroMotion.current.held = state.held;
  if (!active) heroMotion.current.speed = 0;
  const restorationSteps = useRef(0);
  const motion = useRef<CharacterMotion>({ verticalVelocity: 0, grounded: false });
  const focused = useRef<TargetId | null>(null);
  const walking = useRef(false);
  const snapshotClock = useRef(0);
  const poseClock = useRef(0);
  const releasing = useRef<ItemId | null>(null);
  const lastSnapshot = useRef("");
  const queries = useRef<ThirdPersonQueries | null>(null);
  queries.current ??= new ThirdPersonQueries();
  const temp = useRef({ direction: new Vector3(), position: new Vector3(), away: new Vector3(),
    carry: { x: 0, y: 0, z: 0 }, rotation: new Quaternion(), up: new Vector3(0, 1, 0) });

  const snapshot = () => {
    const body = player.current;
    if (!body) return;
    const itemPositions: Partial<Record<ItemId, Vec3>> = {};
    for (const id of ITEM_IDS) {
      const item = items.current[id];
      if (item && current.current.state.items[id].status === "world") itemPositions[id] = asTuple(item.translation()).map((n) => Math.round(n * 1000) / 1000) as Vec3;
    }
    const command: GameCommand = {
      type: "snapshot", position: asTuple(body.translation()).map((n) => Math.round(n * 1000) / 1000) as Vec3,
      yaw: angles.current.yaw, pitch: angles.current.pitch, items: itemPositions,
    };
    const serialized = JSON.stringify(command);
    if (serialized !== lastSnapshot.current) {
      lastSnapshot.current = serialized;
      current.current.onCommand(command);
    }
  };
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const raycastFocus = (): TargetId | null => {
    if (!player.current) return null;
    const direction = camera.getWorldDirection(temp.current.direction);
    const held = current.current.state.held;
    const heldBody = held ? items.current[held] : undefined;
    return queries.current!.interactionTarget(world, camera.position, direction, player.current, heldBody);
  };
  const release = (throwing: boolean) => {
    const held = current.current.state.held;
    const item = held ? items.current[held] : undefined;
    if (!held || !item || releasing.current === held) return;
    releasing.current = held;
    const direction = temp.current.direction.set(Math.sin(heading.current), 0.18, Math.cos(heading.current));
    item.setBodyType(rapier.RigidBodyType.Dynamic, true);
    item.collider(0).setCollisionGroups(ITEM_GROUPS);
    item.setLinvel(throwing ? { x: direction.x * 7.5, y: direction.y * 7.5 + 1.4, z: direction.z * 7.5 } : ZERO, true);
    item.setAngvel(throwing ? { x: 0.3, y: 0.8, z: 0.2 } : ZERO, true);
    current.current.onCommand({ type: "drop", position: asTuple(item.translation()) });
  };
  const releaseRef = useRef(release);
  releaseRef.current = release;
  const focusRef = useRef(raycastFocus);
  focusRef.current = raycastFocus;

  useEffect(() => {
    const kcc = configureCharacter(world);
    controller.current = kcc;
    return () => { controller.current = null; world.removeCharacterController(kcc); };
  }, [world]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!current.current.active || !document.pointerLockElement) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyQ", "KeyG"].includes(event.code)) event.preventDefault();
      input.current.add(event.code);
      if (event.repeat) return;
      if (event.code === "Space") jumpQueued.current = true;
      if (event.code === "KeyQ" || event.code === "KeyG") releaseRef.current(event.code === "KeyG");
      if (event.code === "KeyE") {
        const target = focusRef.current();
        if (target) current.current.onCommand({ type: "interact", target });
      }
    };
    const up = (event: KeyboardEvent) => input.current.delete(event.code);
    const mouse = (event: MouseEvent) => {
      if (!current.current.active || !document.pointerLockElement) return;
      const sensitivity = Math.max(0.2, Math.min(2, current.current.sensitivity));
      angles.current.yaw -= event.movementX * 0.002 * sensitivity;
      angles.current.pitch = Math.max(-0.95, Math.min(0.35, angles.current.pitch - event.movementY * 0.002 * sensitivity));
    };
    const wheel = (event: WheelEvent) => {
      if (!current.current.active || !document.pointerLockElement) return;
      event.preventDefault();
      boom.current.requested = Math.max(CAMERA_MIN_DISTANCE, Math.min(CAMERA_MAX_DISTANCE, boom.current.requested + event.deltaY * 0.004));
    };
    const clear = () => { input.current.clear(); jumpQueued.current = false; snapshotRef.current(); };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", mouse);
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("blur", clear);
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerlockchange", clear);
    return () => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("mousemove", mouse);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", clear); window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility); document.removeEventListener("pointerlockchange", clear);
    };
  }, []);

  useEffect(() => {
    if (!active) { input.current.clear(); jumpQueued.current = false; snapshotRef.current(); }
  }, [active]);

  useBeforePhysicsStep(() => {
    const body = player.current;
    const kcc = controller.current;
    if (!body || !kcc) return;
    const { state: latest, active: moving } = current.current;
    if (latest.held !== releasing.current) releasing.current = null;
    const heldBody = latest.held ? items.current[latest.held] : undefined;
    // Rapier broadphase has the map after the first step. Validate old saves once.
    if (++restorationSteps.current === 2) {
      const restored = queries.current!.restorePosition(world, body, heldBody);
      if (restored) {
        body.setTranslation(restored, true); body.setNextKinematicTranslation(restored);
        motion.current.verticalVelocity = 0;
        snapshotRef.current();
      }
    }
    const keys = input.current;
    const review = current.current.reviewInput?.current;
    if (review) {
      if (review.yaw !== undefined) { angles.current.yaw = review.yaw; review.yaw = undefined; }
      if (review.pitch !== undefined) { angles.current.pitch = Math.max(-0.95, Math.min(0.35, review.pitch)); review.pitch = undefined; }
      if (review.distance !== undefined) { boom.current.requested = Math.max(CAMERA_MIN_DISTANCE, Math.min(CAMERA_MAX_DISTANCE, review.distance)); review.distance = undefined; }
      if (review.action) {
        if (review.action === 'interact') { const target = focusRef.current(); if (target) current.current.onCommand({ type: 'interact', target }); }
        else releaseRef.current(review.action === 'throw');
        review.action = undefined;
      }
    }
    const reviewMoving = Boolean(review && review.steps > 0 && moving);
    const forward = review ? reviewMoving ? review.forward : 0 : moving ? Number(keys.has("KeyW")) - Number(keys.has("KeyS")) : 0;
    const right = review ? reviewMoving ? review.right : 0 : moving ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0;
    const sprint = review ? review.sprint : keys.has("ShiftLeft") || keys.has("ShiftRight");
    stepCharacter(kcc, body, body.collider(0), {
      forward, right, sprint, jump: review ? reviewMoving && review.jump : moving && jumpQueued.current, yaw: angles.current.yaw,
    }, motion.current, world.timestep, heldBody);
    if (reviewMoving && review) { review.steps--; review.jump = false; }
    const previousPosition = body.translation(), nextPosition = body.nextTranslation();
    const dx = nextPosition.x - previousPosition.x, dz = nextPosition.z - previousPosition.z;
    const travelled = Math.hypot(dx, dz);
    heroMotion.current.speed = travelled / world.timestep;
    heroMotion.current.distance += travelled;
    if (travelled > 0.0005) heading.current = turnToward(heading.current, Math.atan2(dx, dz), world.timestep);
    heroMotion.current.grounded = motion.current.grounded;
    heroMotion.current.verticalVelocity = motion.current.verticalVelocity;
    heroMotion.current.held = latest.held;
    heroMotion.current.heading = heading.current;
    jumpQueued.current = false;
    const isWalking = Boolean(moving && travelled > 0.0005 && motion.current.grounded);
    if (walking.current !== isWalking) { walking.current = isWalking; current.current.onMotion?.(isWalking); }
    if (!isInsideWorld(asTuple(body.translation()))) {
      body.setTranslation({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] }, true);
      body.setNextKinematicTranslation({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] });
      motion.current.verticalVelocity = 0;
      boom.current.actual = boom.current.requested;
      snapshotRef.current();
    }
    for (const id of ITEM_IDS) {
      const item = items.current[id];
      if (!item || latest.items[id].status === "installed") continue;
      if (id === latest.held && releasing.current !== id) {
        if (item.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
          item.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          item.setLinvel(ZERO, true); item.setAngvel(ZERO, true);
          item.collider(0).setCollisionGroups(HELD_GROUPS);
        }
        const eye = body.nextTranslation();
        const distance = id === "boards" ? 0.56 : 0.52;
        const desired = temp.current.carry;
        desired.x = eye.x + Math.sin(heading.current) * distance;
        desired.y = eye.y - HERO_FEET_OFFSET + 1.15;
        desired.z = eye.z + Math.cos(heading.current) * distance;
        const safe = carryPosition(world, item, body, desired);
        item.setNextKinematicTranslation(safe);
        const rotation = temp.current.rotation.setFromAxisAngle(temp.current.up, heading.current);
        // A long bundle must also fit while turning, not merely while translating.
        if (!world.intersectionWithShape(safe, rotation, item.collider(0).shape,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, item.collider(0), body)) item.setNextKinematicRotation(rotation);
        // If a door/wall snags a carried object, leave it physically where it is.
        if (Math.hypot(safe.x - eye.x, safe.y - eye.y, safe.z - eye.z) > 3.1) releaseRef.current(false);
      } else if (!isInsideWorld(asTuple(item.translation()))) {
        const spawn = ITEM_SPAWNS[id];
        item.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
        item.setLinvel(ZERO, true); item.setAngvel(ZERO, true);
        snapshotRef.current();
      }
    }
  });

  useFrame((_, delta) => {
    if (!player.current) return;
    const position = temp.current.position;
    if (playerVisual.current) playerVisual.current.getWorldPosition(position);
    else position.copy(player.current.translation());
    position.y += 0.55;
    const { yaw, pitch } = angles.current;
    const away = temp.current.away.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const held = current.current.state.held;
    const heldBody = held ? items.current[held] : undefined;
    const allowed = queries.current!.cameraDistance(world, position, away, boom.current.requested, player.current, heldBody);
    boom.current.actual = smoothCameraDistance(boom.current.actual, allowed, delta);
    camera.position.copy(position).addScaledVector(away, boom.current.actual);
    camera.lookAt(position);
    camera.updateMatrixWorld();
    if (heroVisual.current) {
      heroVisual.current.rotation.y = heading.current;
      heroVisual.current.visible = boom.current.actual > 0.58;
    }
    const target = active ? raycastFocus() : null;
    if (target !== focused.current) { focused.current = target; current.current.onFocus(target); }
    snapshotClock.current += delta;
    if (snapshotClock.current >= 1.5) { snapshotClock.current = 0; snapshotRef.current(); }
    poseClock.current += delta;
    if (poseClock.current >= 0.1) {
      poseClock.current = 0;
      current.current.onPose?.({ position: asTuple(player.current.translation()), yaw, pitch, grounded: motion.current.grounded,
        cameraPosition: asTuple(camera.position), cameraDistance: boom.current.actual, heroHeading: heading.current });
    }
  });

  return <>
    <RigidBody ref={player} type="kinematicPosition" position={initial.current.position} colliders={false} enabledRotations={[false, false, false]} userData={{ player: true }}>
      <CapsuleCollider args={[PLAYER_HALF_SEGMENT, PLAYER_RADIUS]} collisionGroups={PLAYER_GROUPS} friction={0} />
      <group ref={playerVisual}>
        <group ref={heroVisual} position={[0, -HERO_FEET_OFFSET, 0]}>
          <HeroAvatar motionRef={heroMotion} color={state.player.color} />
        </group>
      </group>
    </RigidBody>
    {ITEM_IDS.filter((id) => state.items[id].status !== "installed").map((id) => <RigidBody key={id}
      ref={(body) => { if (body) items.current[id] = body; else delete items.current[id]; }}
      position={itemInitial.current[id].position} colliders={false}
      type={state.held === id ? "kinematicPosition" : "dynamic"} ccd linearDamping={0.35} angularDamping={1.6}
      userData={{ target: id }}>
      <CuboidCollider args={ITEM_HALF_SIZES[id]} mass={id === "battery" ? 4 : 2} friction={0.8} restitution={0.08} collisionGroups={state.held === id ? HELD_GROUPS : ITEM_GROUPS} />
      <ItemModel id={id} />
    </RigidBody>)}
  </>;
}
