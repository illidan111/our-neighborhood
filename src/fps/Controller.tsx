import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, CuboidCollider, RigidBody, interactionGroups, useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import type { KinematicCharacterController, Ray } from "@dimforge/rapier3d-compat";
import { Euler, Group, Vector3 } from "three";
import { ITEM_IDS, ITEM_SPAWNS, isInsideWorld, PLAYER_SPAWN } from "./model";
import type { FPSState, GameCommand, ItemId, TargetId, Vec3 } from "./model";
import { carryPosition, configureCharacter, ITEM_HALF_SIZES, PLAYER_EYE_OFFSET, PLAYER_HALF_SEGMENT, PLAYER_RADIUS, stepCharacter } from "./physics";
import type { CharacterMotion } from "./physics";
import { FirstPersonHands } from "./Character";

type ControllerProps = {
  state: FPSState;
  active: boolean;
  sensitivity: number;
  bob: boolean;
  onFocus: (target: TargetId | null) => void;
  onCommand: (command: GameCommand) => void;
  onMotion?: (walking: boolean) => void;
  onPose?: (pose: { position: Vec3; yaw: number; pitch: number; grounded: boolean }) => void;
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
  const handsVisual = useRef<Group>(null);
  const items = useRef<Partial<Record<ItemId, RapierRigidBody>>>({});
  const initial = useRef(state.checkpoint);
  const itemInitial = useRef(state.items);
  const current = useRef(props);
  current.current = props;
  const controller = useRef<KinematicCharacterController | null>(null);
  const input = useRef(new Set<string>());
  const jumpQueued = useRef(false);
  const angles = useRef({ yaw: state.checkpoint.yaw, pitch: state.checkpoint.pitch });
  const motion = useRef<CharacterMotion>({ verticalVelocity: 0, grounded: false });
  const focused = useRef<TargetId | null>(null);
  const walking = useRef(false);
  const elapsed = useRef(0);
  const snapshotClock = useRef(0);
  const poseClock = useRef(0);
  const releasing = useRef<ItemId | null>(null);
  const lastSnapshot = useRef("");
  const hasCameraPosition = useRef(false);
  const focusRay = useRef<Ray | null>(null);
  const temp = useRef({ direction: new Vector3(), position: new Vector3(), rotation: new Euler(0, 0, 0, "YXZ") });

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
    const ray = focusRay.current ??= new rapier.Ray(camera.position, direction);
    ray.origin = camera.position;
    ray.dir = direction;
    const held = current.current.state.held;
    const heldBody = held ? items.current[held] : undefined;
    const heldColliderHandle = heldBody?.collider(0).handle;
    const hit = world.castRay(ray, 3, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, player.current,
      (collider) => collider.handle !== heldColliderHandle);
    const data = hit?.collider.parent()?.userData as { target?: TargetId } | undefined;
    return data?.target ?? null;
  };
  const release = (throwing: boolean) => {
    const held = current.current.state.held;
    const item = held ? items.current[held] : undefined;
    if (!held || !item || releasing.current === held) return;
    releasing.current = held;
    const direction = camera.getWorldDirection(temp.current.direction);
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
      angles.current.pitch = Math.max(-Math.PI * 0.475, Math.min(Math.PI * 0.475, angles.current.pitch - event.movementY * 0.002 * sensitivity));
    };
    const clear = () => { input.current.clear(); jumpQueued.current = false; snapshotRef.current(); };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", mouse);
    window.addEventListener("blur", clear);
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerlockchange", clear);
    return () => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("mousemove", mouse);
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
    const keys = input.current;
    const forward = moving ? Number(keys.has("KeyW")) - Number(keys.has("KeyS")) : 0;
    const right = moving ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0;
    stepCharacter(kcc, body, body.collider(0), {
      forward, right, sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"), jump: moving && jumpQueued.current, yaw: angles.current.yaw,
    }, motion.current, world.timestep, heldBody);
    jumpQueued.current = false;
    const isWalking = Boolean(moving && (forward || right) && motion.current.grounded);
    if (walking.current !== isWalking) { walking.current = isWalking; current.current.onMotion?.(isWalking); }
    if (!isInsideWorld(asTuple(body.translation()))) {
      body.setTranslation({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] }, true);
      body.setNextKinematicTranslation({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] });
      motion.current.verticalVelocity = 0;
      hasCameraPosition.current = false;
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
        const eye = body.translation();
        const { yaw, pitch } = angles.current;
        const distance = id === "boards" ? 1.25 : 1.05;
        const desired = {
          x: eye.x - Math.sin(yaw) * Math.cos(pitch) * distance,
          y: eye.y + PLAYER_EYE_OFFSET + Math.sin(pitch) * distance - 0.28,
          z: eye.z - Math.cos(yaw) * Math.cos(pitch) * distance,
        };
        const safe = carryPosition(world, item, body, desired);
        item.setNextKinematicTranslation(safe);
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
    elapsed.current += delta;
    const position = temp.current.position;
    if (playerVisual.current) playerVisual.current.getWorldPosition(position);
    else position.copy(player.current.translation());
    position.y += PLAYER_EYE_OFFSET;
    if (current.current.bob && walking.current && active) position.y += Math.sin(elapsed.current * 10.5) * 0.014;
    if (!hasCameraPosition.current) { camera.position.copy(position); hasCameraPosition.current = true; }
    else camera.position.copy(position);
    const { yaw, pitch } = angles.current;
    camera.quaternion.setFromEuler(temp.current.rotation.set(pitch, yaw, 0, "YXZ"));
    camera.updateMatrixWorld();
    if (handsVisual.current) {
      const held = current.current.state.held;
      const heldBody = held ? items.current[held] : undefined;
      handsVisual.current.visible = Boolean(heldBody);
      if (heldBody) {
        handsVisual.current.position.copy(heldBody.translation());
        handsVisual.current.quaternion.copy(camera.quaternion);
        handsVisual.current.visible = handsVisual.current.position.distanceTo(camera.position) < 1.85;
      }
    }
    const target = active ? raycastFocus() : null;
    if (target !== focused.current) { focused.current = target; current.current.onFocus(target); }
    snapshotClock.current += delta;
    if (snapshotClock.current >= 1.5) { snapshotClock.current = 0; snapshotRef.current(); }
    poseClock.current += delta;
    if (poseClock.current >= 0.1) {
      poseClock.current = 0;
      current.current.onPose?.({ position: asTuple(player.current.translation()), yaw, pitch, grounded: motion.current.grounded });
    }
  });

  return <>
    <RigidBody ref={player} type="kinematicPosition" position={initial.current.position} colliders={false} enabledRotations={[false, false, false]} userData={{ player: true }}>
      <CapsuleCollider args={[PLAYER_HALF_SEGMENT, PLAYER_RADIUS]} collisionGroups={PLAYER_GROUPS} friction={0} />
      <group ref={playerVisual} />
    </RigidBody>
    {ITEM_IDS.filter((id) => state.items[id].status !== "installed").map((id) => <RigidBody key={id}
      ref={(body) => { if (body) items.current[id] = body; else delete items.current[id]; }}
      position={itemInitial.current[id].position} colliders={false}
      type={state.held === id ? "kinematicPosition" : "dynamic"} ccd linearDamping={0.35} angularDamping={1.6}
      userData={{ target: id }}>
      <CuboidCollider args={ITEM_HALF_SIZES[id]} mass={id === "battery" ? 4 : 2} friction={0.8} restitution={0.08} collisionGroups={state.held === id ? HELD_GROUPS : ITEM_GROUPS} />
      <ItemModel id={id} />
    </RigidBody>)}
    <group ref={handsVisual} visible={false}>
      <FirstPersonHands held={state.held} color={state.player.color} />
    </group>
  </>;
}
