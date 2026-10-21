import { memo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_GEOMETRY as G, CHARACTER_PALETTE as C, characterMaterial } from './characterGeometry';
import { ANKLE_HEIGHT, HIP_HEIGHT, IDLE_HIP_RISE, LEG_LENGTH, RUN_STRIDE, WALK_STRIDE, reactionEnvelope, sampleFoot, solveLeg } from './characterAnimation';
import type { CharacterAnimation, FootPose, LegPose } from './characterAnimation';

export type CharacterVariant = 'base';
/** A stable mutable record lets an NPC update its presentation without a React render per frame. */
export type CharacterMotion = { speed: number; distance: number; animation?: CharacterAnimation; previewTime?: number };
export type CharacterProps = {
  variant?: CharacterVariant;
  animation?: CharacterAnimation;
  /** Metres per second; no movement is applied to the parent or any physics body. */
  speed?: number;
  /** Accumulated actual horizontal travel in metres. */
  distance?: number;
  motion?: CharacterMotion;
  color?: string;
  reactionToken?: string | number;
  /** Studio only: deterministic pose clock, including idle/reaction, for pause/step review. */
  previewTime?: number;
};

const materials = {
  skin: characterMaterial(C.skin), hair: characterMaterial(C.hair), face: characterMaterial(C.face),
  collar: characterMaterial(C.cream), trousers: characterMaterial(C.trousers),
  boot: characterMaterial(C.boot, 0.84), sole: characterMaterial(C.sole), buttons: characterMaterial(C.button, 0.8),
};
const sides = [-1, 1] as const;
const emptyFoot = (): FootPose => ({ z: 0, lift: 0, pitch: 0, planted: true });
const emptyLeg = (): LegPose => ({ hipAngle: 0, kneeAngle: 0, kneeY: 0, kneeZ: 0 });

/** Original neighbourhood resident. Feet at y=0, facing +Z, approximately 1.85 m tall. */
export const Character = memo(function Character({
  animation = 'idle', speed, distance, motion, color = C.jacket, reactionToken, previewTime,
}: CharacterProps) {
  const torso = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null), hips = useRef<THREE.Mesh>(null);
  const upperArms = useRef<(THREE.Group | null)[]>([null, null]);
  const lowerArms = useRef<(THREE.Group | null)[]>([null, null]);
  const hands = useRef<(THREE.Group | null)[]>([null, null]);
  const thighs = useRef<(THREE.Group | null)[]>([null, null]);
  const shins = useRef<(THREE.Group | null)[]>([null, null]);
  const boots = useRef<(THREE.Group | null)[]>([null, null]);
  const time = useRef(0), travelled = useRef(distance ?? 0), reaction = useRef(99);
  const foot = useRef([emptyFoot(), emptyFoot()]), leg = useRef([emptyLeg(), emptyLeg()]);
  const blend = useRef({ locomotion: 0, carry: animation === 'carry' ? 1 : 0, run: animation === 'run' ? 1 : 0 });
  const jacket = characterMaterial(color);
  const pocketColor = new THREE.Color(color).multiplyScalar(0.93).getStyle();
  const pocketMaterial = characterMaterial(pocketColor);

  useEffect(() => {
    if (animation === 'react' || reactionToken !== undefined) reaction.current = 0;
  }, [animation, reactionToken]);

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.05);
    const fixedTime = motion?.previewTime ?? previewTime;
    if (fixedTime !== undefined) {
      time.current = Math.max(0, fixedTime); reaction.current = Math.max(0, fixedTime);
    } else {
      time.current += delta; reaction.current += delta;
    }
    const mode = motion?.animation ?? animation;
    const velocity = Math.max(0, motion?.speed ?? speed ?? (mode === 'run' ? 2.5 : mode === 'walk' ? 1.05 : 0));
    const moving = velocity > 0.025 && (mode === 'walk' || mode === 'run' || mode === 'carry');
    const running = mode === 'run';
    if (motion) travelled.current = motion.distance;
    else if (distance !== undefined) travelled.current = distance;
    else if (moving) travelled.current += velocity * delta;
    const smooth = blend.current;
    smooth.locomotion = fixedTime !== undefined ? (moving ? 1 : 0) : THREE.MathUtils.damp(smooth.locomotion, moving ? 1 : 0, 12, delta);
    smooth.carry = fixedTime !== undefined ? (mode === 'carry' ? 1 : 0) : THREE.MathUtils.damp(smooth.carry, mode === 'carry' ? 1 : 0, 10, delta);
    smooth.run = fixedTime !== undefined ? (running ? 1 : 0) : THREE.MathUtils.damp(smooth.run, running ? 1 : 0, 10, delta);
    const phase = travelled.current / (running ? RUN_STRIDE : WALK_STRIDE) * Math.PI * 2;
    const breath = Math.sin(time.current * 1.7) * 0.004;
    const bounce = smooth.locomotion * (0.008 + smooth.run * 0.013) * Math.cos(phase * 2);
    const bob = breath * (1 - smooth.locomotion * 0.8) + bounce + IDLE_HIP_RISE * (1 - smooth.locomotion);
    const greeting = fixedTime !== undefined && mode !== 'react' ? 0 : reactionEnvelope(reaction.current);
    if (torso.current) {
      torso.current.position.y = 0.68 + bob;
      torso.current.rotation.x = smooth.locomotion * (0.022 + smooth.run * 0.09) - smooth.carry * 0.024;
      torso.current.rotation.z = Math.sin(phase) * smooth.locomotion * 0.018;
    }
    if (hips.current) hips.current.position.y = bob;
    if (head.current) {
      head.current.rotation.x = -smooth.locomotion * 0.018 + greeting * Math.sin(reaction.current * 4.5) * 0.035;
      head.current.rotation.y = Math.sin(time.current * 0.47) * 0.028 * (1 - smooth.locomotion);
      head.current.rotation.z = -greeting * 0.055;
    }

    for (let i = 0; i < 2; i++) {
      const side = sides[i], f = sampleFoot(travelled.current, running, i as 0 | 1, foot.current[i]);
      const lift = f.lift * smooth.locomotion, z = f.z * smooth.locomotion;
      const solved = solveLeg(HIP_HEIGHT + bob, ANKLE_HEIGHT + lift, z, leg.current[i]);
      const thigh = thighs.current[i], shin = shins.current[i], boot = boots.current[i];
      if (thigh) { thigh.position.y = HIP_HEIGHT + bob; thigh.rotation.x = solved.hipAngle; }
      if (shin) { shin.position.set(side * 0.145, solved.kneeY, solved.kneeZ); shin.rotation.x = solved.hipAngle + solved.kneeAngle; }
      if (boot) {
        boot.position.set(side * 0.145, lift, z);
        boot.rotation.x = f.pitch * smooth.locomotion;
        // The planted sole remains horizontal. Only a raised foot rolls during the swing.
      }
      const upper = upperArms.current[i], lower = lowerArms.current[i], hand = hands.current[i];
      const swing = Math.sin(phase + i * Math.PI) * smooth.locomotion * (0.29 + smooth.run * 0.26);
      const quiet = Math.sin(time.current * 1.7 + i * 0.6) * 0.012;
      let upperX = THREE.MathUtils.lerp(swing + quiet, -0.62, smooth.carry);
      let upperZ = side * THREE.MathUtils.lerp(0.105, 0.32, smooth.carry);
      let lowerX = THREE.MathUtils.lerp(-0.14 - smooth.run * 0.65, -0.82, smooth.carry);
      let lowerZ = 0;
      if (i === 1) {
        upperX = THREE.MathUtils.lerp(upperX, -0.12, greeting);
        upperZ = THREE.MathUtils.lerp(upperZ, 1.93, greeting);
        lowerX = THREE.MathUtils.lerp(lowerX, -0.05, greeting);
        lowerZ = greeting * 0.49;
      }
      if (upper) upper.rotation.set(upperX, 0, upperZ);
      if (lower) lower.rotation.set(lowerX, 0, lowerZ);
      if (hand) {
        hand.rotation.set(smooth.carry * 1.32, 0,
          -side * smooth.carry * 0.14 + (i === 1 ? greeting * Math.sin(reaction.current * 12) * 0.17 : 0));
      }
    }
  });

  return <group dispose={null} name="neighbour-character">
    <mesh ref={hips} geometry={G.hips} material={materials.trousers} castShadow receiveShadow />
    {sides.map((side, i) => <group key={`leg-${side}`}>
      <group ref={node => { thighs.current[i] = node; }} position={[side * 0.145, HIP_HEIGHT, 0]}>
        <mesh geometry={G.upperLeg} material={materials.trousers} castShadow receiveShadow />
      </group>
      <group ref={node => { shins.current[i] = node; }} position={[side * 0.145, HIP_HEIGHT - LEG_LENGTH, 0]}>
        <mesh geometry={G.lowerLeg} material={materials.trousers} castShadow receiveShadow />
      </group>
      <group ref={node => { boots.current[i] = node; }} position={[side * 0.145, 0, 0]}>
        <mesh geometry={G.boot} material={materials.boot} castShadow receiveShadow />
        <mesh geometry={G.sole} material={materials.sole} castShadow receiveShadow />
      </group>
    </group>)}
    <group ref={torso} position={[0, 0.68, 0]}>
      <mesh geometry={G.jacket} material={jacket} castShadow receiveShadow />
      <mesh geometry={G.undershirt} material={materials.trousers} castShadow receiveShadow />
      <mesh geometry={G.collar} material={materials.collar} castShadow receiveShadow />
      <mesh geometry={G.pockets} material={pocketMaterial} castShadow receiveShadow />
      <mesh geometry={G.buttons} material={materials.buttons} castShadow />
      <group ref={head} position={[0, 0.884, 0]}>
        <mesh geometry={G.head} material={materials.skin} castShadow receiveShadow />
        <mesh geometry={G.hair} material={materials.hair} castShadow receiveShadow />
        <mesh geometry={G.face} material={materials.face} />
      </group>
      {sides.map((side, i) => <group key={`arm-${side}`} ref={node => { upperArms.current[i] = node; }} position={[side * 0.287, 0.545, 0]} rotation={[0, 0, side * 0.105]}>
        <mesh geometry={G.upperSleeve} material={jacket} castShadow receiveShadow />
        <group ref={node => { lowerArms.current[i] = node; }} position={[0, -0.26, 0]} rotation={[-0.14, 0, 0]}>
          <mesh geometry={G.lowerSleeve} material={jacket} castShadow receiveShadow />
          <group ref={node => { hands.current[i] = node; }} position={[0, -0.25, 0]}>
            <mesh geometry={i === 0 ? G.leftHand : G.rightHand} material={materials.skin} castShadow receiveShadow />
          </group>
        </group>
      </group>)}
    </group>
  </group>;
});

/** Place at the held item's centre, with the camera quaternion; +Z points back toward the player. */
export const FirstPersonHands = memo(function FirstPersonHands({
  held = 'crate', color = '#b9775d',
}: { held?: 'crate' | 'battery' | 'boards' | null; color?: string }) {
  if (!held) return null;
  const width = held === 'boards' ? 0.66 : held === 'battery' ? 0.28 : 0.43;
  const jacket = characterMaterial(color);
  return <group dispose={null} name="first-person-hands">
    {sides.map((side, i) => <group key={side} position={[side * (width + 0.037), -0.08, 0.04]}>
      <mesh geometry={G.lowerSleeve} material={jacket} position={[side * 0.032, -0.07, 0.36]} rotation={[Math.PI / 2 + 0.21, 0, -side * 0.1]} castShadow receiveShadow />
      <mesh geometry={i === 0 ? G.leftHand : G.rightHand} material={materials.skin} position={[0, -0.012, 0.11]} rotation={[Math.PI / 2, 0, -side * 0.08]} castShadow receiveShadow />
    </group>)}
  </group>;
});

export default Character;
