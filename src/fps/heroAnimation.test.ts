import { describe, expect, it } from 'vitest';
import { chooseHeroState, heroStride, sampleHeroFoot, solveHeroLeg } from './heroAnimation';
import type { HeroFootPose, HeroMotion } from './heroAnimation';

const foot = (): HeroFootPose => ({ z: 0, lift: 0, pitch: 0, planted: true });
const motion: HeroMotion = { speed: 0, distance: 0, grounded: true, verticalVelocity: 0, held: null, heading: 0 };

describe('imported hero skeletal locomotion', () => {
  it.each([4.2, 6.8])('plants a supporting foot in world space at the unchanged KCC speed %s', speed => {
    const stride = heroStride(speed), a = sampleHeroFoot(0.06, speed, 0, foot()), b = sampleHeroFoot(0.11, speed, 0, foot());
    expect(a.planted && b.planted).toBe(true);
    expect(0.06 * stride + a.z).toBeCloseTo(0.11 * stride + b.z, 9);
    expect(a.lift).toBe(0); expect(a.pitch).toBe(0);
    expect(speed / stride).toBeGreaterThan(1.5); expect(speed / stride).toBeLessThan(2.4);
  });
  it.each([1, 4.2, 6.8])('has a continuous looping stride with nonnegative foot clearance at %s m/s', speed => {
    const a = sampleHeroFoot(1 - 0.000001, speed, 0, foot()), b = sampleHeroFoot(0.000001, speed, 0, foot());
    expect(a.z).toBeCloseTo(b.z, 4); expect(a.lift).toBeCloseTo(b.lift, 4);
    for (let i = 0; i < 100; i++) expect(sampleHeroFoot(i / 100, speed, 0, foot()).lift).toBeGreaterThanOrEqual(0);
  });
  it('solves the imported unequal-length leg rather than assuming equal thigh and shin', () => {
    const upper = 0.352984, lower = 0.415494;
    for (const z of [-0.35, -0.1, 0, 0.2, 0.35]) {
      const result = solveHeroLeg(0.66, z, upper, lower, { upper: 0, lower: 0, reached: false });
      expect(result.reached).toBe(true);
      expect(upper * Math.cos(result.upper) + lower * Math.cos(result.upper + result.lower)).toBeCloseTo(0.66, 6);
      expect(-upper * Math.sin(result.upper) - lower * Math.sin(result.upper + result.lower)).toBeCloseTo(z, 6);
    }
  });
  it('clamps unreachable targets to a finite pose instead of scaling or corrupting bones', () => {
    const pose = solveHeroLeg(2, 1, 0.35, 0.415, { upper: 0, lower: 0, reached: true });
    expect(pose.reached).toBe(false); expect(Number.isFinite(pose.upper + pose.lower)).toBe(true);
  });
  it('selects all seven states with airborne and landing transitions ahead of carry', () => {
    expect(chooseHeroState(motion, false)).toBe('idle');
    expect(chooseHeroState({ ...motion, speed: 4.2 }, false)).toBe('walk');
    expect(chooseHeroState({ ...motion, speed: 6.8 }, false)).toBe('run');
    expect(chooseHeroState({ ...motion, grounded: false, verticalVelocity: 3 }, false)).toBe('jump');
    expect(chooseHeroState({ ...motion, grounded: false, verticalVelocity: -1, held: 'crate' }, false)).toBe('fall');
    expect(chooseHeroState({ ...motion, held: 'crate' }, true)).toBe('land');
    expect(chooseHeroState({ ...motion, held: 'crate', speed: 4.2 }, false)).toBe('carry');
  });
});
