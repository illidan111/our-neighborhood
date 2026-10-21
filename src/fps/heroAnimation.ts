import type { ItemId } from './model';

export type HeroAnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'land' | 'carry';
export type HeroMotion = {
  speed: number;
  distance: number;
  grounded: boolean;
  verticalVelocity: number;
  held: ItemId | null;
  heading: number;
  paused?: boolean;
  /** Optional deterministic studio controls; gameplay leaves these undefined. */
  animation?: HeroAnimationState;
  previewTime?: number;
};

export type HeroFootPose = { z: number; lift: number; pitch: number; planted: boolean };
export type TwoBonePose = { upper: number; lower: number; reached: boolean };

export function heroStride(speed: number) {
  return speed > 5 ? 3.3 : speed > 2.4 ? 2.25 : 1.45;
}

/** At the existing 4.2/6.8 m/s speeds the character jogs/sprints, with 1.87/2.06 cycles/s.
 * A short support phase keeps the foot target within a human leg's physical reach.
 * While supported, dz/distance = -1. No physics speed or world position is changed. */
export function sampleHeroFoot(phase: number, speed: number, side: 0 | 1, out: HeroFootPose) {
  const stride = heroStride(speed), sprint = speed > 5;
  const stance = sprint ? 0.24 : speed > 2.4 ? 0.30 : 0.42;
  const p = ((phase + side * 0.5) % 1 + 1) % 1, reach = stride * stance * 0.5;
  out.planted = p <= stance;
  if (out.planted) {
    out.z = reach - p * stride; out.lift = 0; out.pitch = 0;
  } else {
    const t = (p - stance) / (1 - stance), eased = t * t * (3 - 2 * t);
    out.z = -reach + reach * 2 * eased;
    out.lift = Math.sin(t * Math.PI) * (sprint ? 0.23 : 0.145);
    out.pitch = Math.sin(t * Math.PI * 2) * (sprint ? 0.32 : 0.2);
  }
  return out;
}

/** Sagittal two-bone IK for the imported skeleton's measured unequal leg lengths. */
export function solveHeroLeg(vertical: number, forward: number, upperLength: number, lowerLength: number, out: TwoBonePose) {
  const actualReach = Math.hypot(vertical, forward);
  const reach = Math.min(upperLength + lowerLength - 0.00001,
    Math.max(Math.abs(upperLength - lowerLength) + 0.00001, actualReach));
  const offset = Math.acos(Math.max(-1, Math.min(1,
    (upperLength * upperLength + reach * reach - lowerLength * lowerLength) / (2 * upperLength * reach))));
  const axis = Math.atan2(-forward, vertical);
  out.upper = axis - offset;
  out.lower = Math.PI - Math.acos(Math.max(-1, Math.min(1,
    (upperLength * upperLength + lowerLength * lowerLength - reach * reach) / (2 * upperLength * lowerLength))));
  out.reached = Math.abs(reach - actualReach) < 0.0001;
  return out;
}

export function chooseHeroState(motion: HeroMotion, landing: boolean): HeroAnimationState {
  if (motion.animation) return motion.animation;
  if (!motion.grounded) return motion.verticalVelocity > 0.35 ? 'jump' : 'fall';
  if (landing) return 'land';
  if (motion.held) return 'carry';
  if (motion.speed > 5) return 'run';
  if (motion.speed > 0.12) return 'walk';
  return 'idle';
}
