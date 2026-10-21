import { Component, use, useEffect, useLayoutEffect, useMemo } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { MToonMaterial } from '@pixiv/three-vrm';
import { preloadHeroAvatar } from './heroAsset';
import type { HeroAsset } from './heroAsset';
import type { HeroMotion } from './heroAnimation';
import { HeroRig } from './heroRig';

export type { HeroMotion, HeroAnimationState } from './heroAnimation';
export { preloadHeroAvatar, retryHeroAvatar } from './heroAsset';

export type HeroAvatarProps = {
  motionRef: MutableRefObject<HeroMotion>;
  visible?: boolean;
  color?: string;
  onReady?: (metrics: HeroAsset['metrics']) => void;
};

/** Mount under a group whose origin is at the feet and whose +Z follows Controller heading.
 * Suspends while the local model loads. Game and studio intentionally mount this single player
 * on separate routes, retaining the bounded model/texture cache between new games. */
export function HeroAvatar({ motionRef, visible = true, color = '#5c9290', onReady }: HeroAvatarProps) {
  const asset = use(preloadHeroAvatar());
  const rig = useMemo(() => new HeroRig(asset), [asset]);
  useLayoutEffect(() => { rig.reset(motionRef.current); }, [rig, motionRef]);
  useEffect(() => {
    for (const material of asset.vrm.materials ?? []) {
      if (material instanceof MToonMaterial && !material.isOutline && material.name.startsWith('Tops_')) {
        material.color.set(color); material.shadeColorFactor.set(color).multiplyScalar(0.68);
      }
    }
  }, [asset, color]);
  useEffect(() => { onReady?.(asset.metrics); }, [asset, onReady]);
  useFrame((_state, delta) => { if (!motionRef.current.paused) rig.update(motionRef.current, delta); });
  return <primitive object={asset.vrm.scene} visible={visible} dispose={null} />;
}

export class AvatarErrorBoundary extends Component<{
  children: ReactNode; fallback?: ReactNode; onError?: (error: Error) => void;
}, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { this.props.onError?.(error); }
  render() { return this.state.error ? this.props.fallback ?? null : this.props.children; }
}
