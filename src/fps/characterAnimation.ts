export type CharacterAnimation = 'idle' | 'walk' | 'run' | 'carry' | 'react';

export type FootPose = { z: number; lift: number; pitch: number; planted: boolean };
export type LegPose = { hipAngle: number; kneeAngle: number; kneeY: number; kneeZ: number };

export const LEG_LENGTH = 0.32;
export const HIP_HEIGHT = 0.704;
export const ANKLE_HEIGHT = 0.138;
export const IDLE_HIP_RISE = 0.05;
export const WALK_STRIDE = 0.72;
export const RUN_STRIDE = 1.12;

/** During stance dz/ddistance = -1: the sole stays planted as the body moves forward. */
export function sampleFoot(distance: number, run: boolean, side: 0 | 1, out: FootPose): FootPose {
  const stride = run ? RUN_STRIDE : WALK_STRIDE, stance = run ? 0.51 : 0.62;
  const phase = ((distance / stride + side * 0.5) % 1 + 1) % 1;
  const reach = stride * stance / 2;
  out.planted = phase <= stance;
  if (out.planted) {
    out.z = reach - phase * stride;
    out.lift = 0;
    out.pitch = 0;
  } else {
    const t = (phase - stance) / (1 - stance), ease = t * t * (3 - 2 * t);
    out.z = -reach + reach * 2 * ease;
    out.lift = Math.sin(t * Math.PI) * (run ? 0.19 : 0.12);
    out.pitch = Math.sin(t * Math.PI * 2) * (run ? 0.26 : 0.16);
  }
  return out;
}

/** Analytic two-bone sagittal IK; all output is written into a reused record. */
export function solveLeg(hipY: number, ankleY: number, ankleZ: number, out: LegPose): LegPose {
  const y = ankleY - hipY;
  const reach = Math.min(LEG_LENGTH * 2 - 0.0001, Math.max(0.05, Math.hypot(y, ankleZ)));
  const bend = Math.acos(reach / (LEG_LENGTH * 2));
  const axis = Math.atan2(-ankleZ, -y);
  out.hipAngle = axis - bend;
  out.kneeAngle = bend * 2;
  out.kneeY = hipY - Math.cos(out.hipAngle) * LEG_LENGTH;
  out.kneeZ = -Math.sin(out.hipAngle) * LEG_LENGTH;
  return out;
}

/** Smooth single greeting, with zero displacement at both ends. */
export function reactionEnvelope(seconds: number) {
  if (seconds <= 0 || seconds >= 2.1) return 0;
  const up = Math.min(1, seconds / 0.35), down = Math.min(1, (2.1 - seconds) / 0.45);
  return up * up * (3 - 2 * up) * down * down * (3 - 2 * down);
}
