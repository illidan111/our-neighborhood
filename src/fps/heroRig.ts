import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import type { HeroAsset } from './heroAsset';
import { chooseHeroState, heroStride, sampleHeroFoot, solveHeroLeg } from './heroAnimation';
import type { HeroAnimationState, HeroFootPose, HeroMotion, TwoBonePose } from './heroAnimation';

type Leg = { upper: VRMHumanBoneName; lower: VRMHumanBoneName; foot: VRMHumanBoneName;
  length1: number; length2: number; restUpper: number; restLower: number;
  hipY: number; hipZ: number; ankleY: number; ankleZ: number; pose: HeroFootPose; ik: TwoBonePose };
type Arm = { upper: VRMHumanBoneName; lower: VRMHumanBoneName; hand: VRMHumanBoneName;
  length1: number; length2: number; shoulder: THREE.Vector3; rest: THREE.Vector3; lowerRest: THREE.Vector3; side: number;
  fingers: { name: VRMHumanBoneName; curl: number }[]; thumb: VRMHumanBoneName };

/** Procedural clips drive the supplied deforming skeleton. Only hips have a small local bob;
 * KCC owns all world translation and heading. Scratch objects are reused throughout the frame. */
export class HeroRig {
  private time = 0;
  private phase = 0;
  private lastDistance = 0;
  private lastGrounded = true;
  private lastVelocity = 0;
  private landing = 0;
  private movement = 0;
  private carry = 0;
  private euler = new THREE.Euler();
  private quaternion = new THREE.Quaternion();
  private upperQuat = new THREE.Quaternion();
  private lowerQuat = new THREE.Quaternion();
  private inverse = new THREE.Quaternion();
  private target = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private bend = new THREE.Vector3();
  private elbow = new THREE.Vector3();
  private upperVector = new THREE.Vector3();
  private lowerVector = new THREE.Vector3();
  private legs: Leg[];
  private arms: Arm[];
  state: HeroAnimationState = 'idle';

  constructor(private asset: HeroAsset) {
    const bones = asset.bones;
    this.legs = (['left', 'right'] as const).map(side => {
      const upper = `${side}UpperLeg` as const, lower = `${side}LowerLeg` as const, foot = `${side}Foot` as const;
      const a = bones[upper]!.worldPosition, b = bones[lower]!.worldPosition, c = bones[foot]!.worldPosition;
      return { upper, lower, foot, length1: a.distanceTo(b), length2: b.distanceTo(c),
        restUpper: Math.atan2(-(b.z - a.z), -(b.y - a.y)), restLower: Math.atan2(-(c.z - b.z), -(c.y - b.y)),
        hipY: a.y, hipZ: a.z, ankleY: c.y, ankleZ: c.z,
        pose: { z: 0, lift: 0, pitch: 0, planted: true }, ik: { upper: 0, lower: 0, reached: true } };
    });
    this.arms = (['left', 'right'] as const).map((side, i) => {
      const upper = `${side}UpperArm` as const, lower = `${side}LowerArm` as const, hand = `${side}Hand` as const;
      const a = bones[upper]!.worldPosition, b = bones[lower]!.worldPosition, c = bones[hand]!.worldPosition;
      const fingers: Arm['fingers'] = [];
      for (const finger of ['Index', 'Middle', 'Ring', 'Little'] as const)
        for (const joint of ['Proximal', 'Intermediate', 'Distal'] as const)
          fingers.push({ name: `${side}${finger}${joint}`, curl: joint === 'Proximal' ? 0.55 : 0.65 });
      return { upper, lower, hand, length1: a.distanceTo(b), length2: b.distanceTo(c),
        shoulder: a.clone(), rest: b.clone().sub(a).normalize(), lowerRest: c.clone().sub(b).normalize(), side: i === 0 ? 1 : -1,
        fingers, thumb: `${side}ThumbProximal` };
    });
  }

  reset(motion: HeroMotion) {
    this.asset.vrm.humanoid.resetNormalizedPose();
    this.time = 0; this.phase = motion.distance / heroStride(motion.speed);
    this.lastDistance = motion.distance; this.lastGrounded = motion.grounded;
    this.lastVelocity = motion.verticalVelocity; this.landing = 0;
    this.movement = motion.speed > 0.12 ? 1 : 0; this.carry = motion.held ? 1 : 0;
    this.update(motion, 0, true);
    this.asset.vrm.springBoneManager?.reset();
  }

  private rotate(name: VRMHumanBoneName, x: number, y: number, z: number, alpha: number) {
    const bone = this.asset.bones[name]; if (!bone) return;
    this.euler.set(x, y, z); this.quaternion.setFromEuler(this.euler);
    bone.node.quaternion.slerp(this.quaternion, alpha);
  }

  private carryArm(arm: Arm, held: HeroMotion['held'], hipOffset: number, alpha: number) {
    const { asset } = this, side = arm.side;
    // Wrists meet the near side of the physical item, rather than stretching to its centre.
    const x = held === 'crate' ? 0.43 : held === 'boards' ? 0.28 : 0.285;
    const z = held === 'boards' ? 0.34 : held === 'battery' ? 0.32 : 0.22;
    this.target.set(side * x / asset.scale, (1.15 - asset.feetOffset) / asset.scale - hipOffset, z / asset.scale);
    this.direction.copy(this.target).sub(arm.shoulder);
    const distance = Math.min(this.direction.length(), arm.length1 + arm.length2 - 0.003);
    this.direction.normalize();
    const along = (arm.length1 * arm.length1 - arm.length2 * arm.length2 + distance * distance) / (2 * distance);
    const bendHeight = Math.sqrt(Math.max(0, arm.length1 * arm.length1 - along * along));
    this.bend.set(0, -1, 0).addScaledVector(this.direction, this.direction.y).normalize();
    this.elbow.copy(arm.shoulder).addScaledVector(this.direction, along).addScaledVector(this.bend, bendHeight);
    this.upperVector.copy(this.elbow).sub(arm.shoulder).normalize();
    this.upperQuat.setFromUnitVectors(arm.rest, this.upperVector);
    this.lowerVector.copy(this.direction).multiplyScalar(distance).add(arm.shoulder).sub(this.elbow).normalize();
    this.inverse.copy(this.upperQuat).invert(); this.lowerVector.applyQuaternion(this.inverse);
    this.lowerQuat.setFromUnitVectors(arm.lowerRest, this.lowerVector);
    asset.bones[arm.upper]!.node.quaternion.slerp(this.upperQuat, alpha);
    asset.bones[arm.lower]!.node.quaternion.slerp(this.lowerQuat, alpha);
  }

  update(motion: HeroMotion, elapsed: number, immediate = false) {
    const dt = Math.min(0.05, Math.max(0, elapsed));
    const preview = motion.previewTime !== undefined;
    this.time = preview ? motion.previewTime! : this.time + dt;
    if (!this.lastGrounded && motion.grounded && this.lastVelocity < -0.8) this.landing = 0.22;
    this.landing = Math.max(0, this.landing - dt);
    this.state = chooseHeroState(motion, this.landing > 0);
    const force = immediate || preview;
    const alpha = force ? 1 : 1 - Math.exp(-15 * dt);
    const air = this.state === 'jump' || this.state === 'fall';
    const moving = !air && motion.speed > 0.12 ? Math.min(1, motion.speed / 0.7) : 0;
    this.movement += (moving - this.movement) * alpha;
    const carrying = motion.held !== null || this.state === 'carry';
    this.carry += ((carrying ? 1 : 0) - this.carry) * alpha;
    if (preview) this.phase = motion.distance / heroStride(motion.speed);
    else if (motion.grounded) this.phase += Math.max(0, motion.distance - this.lastDistance) / heroStride(motion.speed);
    this.phase %= 1;
    this.lastDistance = motion.distance; this.lastGrounded = motion.grounded; this.lastVelocity = motion.verticalVelocity;
    const sprint = motion.speed > 5;
    const wave = Math.sin(this.phase * Math.PI * 2), breathing = Math.sin(this.time * 1.65);
    const land = this.state === 'land' ? (preview ? Math.sin(Math.min(1, this.time % 0.23 / 0.23) * Math.PI) : Math.sin(this.landing / 0.22 * Math.PI)) : 0;
    // Lowered pelvis allows the planted foot to reach without scaling a limb.
    let hipOffset = -(sprint ? 0.050 : 0.040) * this.movement - 0.060 * land;
    hipOffset += breathing * 0.0015 * (1 - this.movement);
    // Adapt the pelvis to the measured unequal limbs at the limits of a long jogging stride.
    // This keeps both target ankles reachable without either stretching a bone or sliding a sole.
    this.legs.forEach((leg, index) => {
      sampleHeroFoot(this.phase, motion.speed, index as 0 | 1, leg.pose);
      if (air) return;
      const forward = leg.ankleZ + leg.pose.z * this.movement / this.asset.scale - leg.hipZ;
      const reach = leg.length1 + leg.length2 - 0.001;
      const maxVertical = Math.sqrt(Math.max(0, reach * reach - forward * forward));
      hipOffset = Math.min(hipOffset, maxVertical - leg.hipY + leg.ankleY + leg.pose.lift * this.movement / this.asset.scale);
    });
    const hips = this.asset.bones.hips!;
    hips.node.position.copy(hips.position); hips.node.position.y += hipOffset;
    this.rotate('hips', 0, 0, 0, alpha);
    this.rotate('spine', (sprint ? 0.08 : 0.035) * this.movement * (1 - this.carry) + land * 0.05, 0, 0, alpha);
    this.rotate('chest', breathing * 0.006, -wave * 0.035 * this.movement * (1 - this.carry), 0, alpha);
    this.rotate('neck', -(sprint ? 0.04 : 0.015) * this.movement, 0, 0, alpha);
    this.rotate('head', -breathing * 0.005, Math.sin(this.time * 0.32) * 0.012 * (1 - this.movement), 0, alpha);

    this.legs.forEach((leg, index) => {
      const z = leg.pose.z * this.movement / this.asset.scale;
      const lift = leg.pose.lift * this.movement / this.asset.scale;
      solveHeroLeg(leg.hipY + hipOffset - leg.ankleY - lift, leg.ankleZ + z - leg.hipZ,
        leg.length1, leg.length2, leg.ik);
      let upper = leg.ik.upper - leg.restUpper;
      let lower = leg.ik.upper + leg.ik.lower - upper - leg.restLower;
      let foot = -upper - lower + leg.pose.pitch * this.movement;
      if (air) {
        upper = this.state === 'jump' ? (index === 0 ? -0.40 : -0.20) : 0.10;
        lower = this.state === 'jump' ? (index === 0 ? 0.82 : 0.62) : 0.22;
        foot = this.state === 'jump' ? -0.20 : 0.12;
      }
      // Direct IK during support prevents frame-lag foot drift; state transitions still blend.
      const legAlpha = force || (motion.grounded && this.movement > 0.98 && this.landing === 0) ? 1 : alpha;
      this.rotate(leg.upper, upper, 0, 0, legAlpha);
      this.rotate(leg.lower, lower, 0, 0, legAlpha);
      this.rotate(leg.foot, foot, 0, 0, legAlpha);
    });

    this.arms.forEach(arm => {
      const side = arm.side, swing = wave * side;
      const armLift = air ? (this.state === 'jump' ? 0.72 : 0.42) : 0;
      this.rotate(arm.upper, -swing * (sprint ? 0.65 : 0.42) * this.movement - armLift,
        0, -side * (air ? 1.07 : 1.36), alpha);
      this.rotate(arm.lower, 0, -side * (sprint ? 1.02 : 0.20 + 0.18 * this.movement), 0, alpha);
      if (this.carry > 0.001) this.carryArm(arm, motion.held, hipOffset, this.carry);
      this.rotate(arm.hand, 0, side * 0.08 * this.carry, side * 0.05, alpha);
      const relaxedCurl = 0.10 + (motion.speed > 2.4 ? 0.25 * (1 - this.carry) : 0);
      for (const finger of arm.fingers)
        this.rotate(finger.name, 0, 0, -side * (relaxedCurl + this.carry * finger.curl), alpha);
      this.rotate(arm.thumb, 0, -side * (0.10 + this.carry * 0.18), 0, alpha);
    });
    const blinkPhase = this.time % 4.7;
    this.asset.vrm.expressionManager?.setValue('blink', blinkPhase < 0.16 ? Math.sin(blinkPhase / 0.16 * Math.PI) : 0);
    this.asset.vrm.expressionManager?.setValue('happy', 0.08);
    this.asset.vrm.update(dt);
  }
}
