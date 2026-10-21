import { describe, expect, it } from 'vitest';
import { ANKLE_HEIGHT, HIP_HEIGHT, IDLE_HIP_RISE, LEG_LENGTH, RUN_STRIDE, WALK_STRIDE, reactionEnvelope, sampleFoot, solveLeg } from './characterAnimation';
import type { FootPose, LegPose } from './characterAnimation';

const foot = (): FootPose => ({ z: 0, lift: 0, pitch: 0, planted: true });
const leg = (): LegPose => ({ hipAngle: 0, kneeAngle: 0, kneeY: 0, kneeZ: 0 });

describe('character locomotion', () => {
  it.each([false, true])('locks the supporting sole to the world as the body advances (run=%s)', run => {
    const first = sampleFoot(0.08, run, 0, foot()), second = sampleFoot(0.12, run, 0, foot());
    expect(first.planted && second.planted).toBe(true);
    expect(0.08 + first.z).toBeCloseTo(0.12 + second.z, 9);
    expect(first.lift).toBe(0); expect(first.pitch).toBe(0);
  });
  it.each([false, true])('meets the ankle target across a full step and keeps the swing above ground (run=%s)', run => {
    const stride = run ? RUN_STRIDE : WALK_STRIDE;
    for (let i = 0; i <= 100; i++) {
      const f = sampleFoot(i / 100 * stride, run, 0, foot());
      const result = solveLeg(HIP_HEIGHT, ANKLE_HEIGHT + f.lift, f.z, leg());
      const ankleY = result.kneeY - Math.cos(result.hipAngle + result.kneeAngle) * LEG_LENGTH;
      const ankleZ = result.kneeZ - Math.sin(result.hipAngle + result.kneeAngle) * LEG_LENGTH;
      expect(ankleY).toBeCloseTo(ANKLE_HEIGHT + f.lift, 6);
      expect(ankleZ).toBeCloseTo(f.z, 6);
      expect(f.lift).toBeGreaterThanOrEqual(0);
    }
  });
  it('has a continuous loop and alternating swing legs', () => {
    const before = sampleFoot(WALK_STRIDE - 0.000001, false, 0, foot());
    const after = sampleFoot(WALK_STRIDE + 0.000001, false, 0, foot());
    expect(before.z).toBeCloseTo(after.z, 4);
    expect(before.lift).toBeCloseTo(after.lift, 4);
    expect(sampleFoot(WALK_STRIDE * 0.8, false, 0, foot()).lift).toBeGreaterThan(0.1);
    expect(sampleFoot(WALK_STRIDE * 0.8, false, 1, foot()).planted).toBe(true);
  });
  it('ends the short reaction without leaving a held pose', () => {
    expect(reactionEnvelope(0)).toBe(0);
    expect(reactionEnvelope(0.5)).toBe(1);
    expect(reactionEnvelope(2.1)).toBe(0);
    expect(reactionEnvelope(30)).toBe(0);
  });
  it('stands with relaxed, straighter legs while retaining the walking reach', () => {
    const idle = solveLeg(HIP_HEIGHT + IDLE_HIP_RISE, ANKLE_HEIGHT, 0, leg());
    expect(Math.abs(idle.hipAngle)).toBeLessThan(0.29);
    expect(idle.kneeAngle).toBeLessThan(0.58);
    const ankleY = idle.kneeY - Math.cos(idle.hipAngle + idle.kneeAngle) * LEG_LENGTH;
    expect(ankleY).toBeCloseTo(ANKLE_HEIGHT, 7);
  });
});
