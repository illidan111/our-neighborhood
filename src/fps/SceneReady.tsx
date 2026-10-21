import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';

/** Runs once after Suspense assets and the first static-instance flush are ready. */
export default function SceneReady({ onReady }: { onReady: (ready: boolean) => void }) {
  const started = useRef(false), mounted = useRef(true);
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onReady(false); };
  }, [onReady]);
  useFrame(({ gl, scene, camera }) => {
    if (started.current) return;
    started.current = true;
    const began = performance.now();
    void gl.compileAsync(scene, camera).then(() => {
      if (!mounted.current) return;
      gl.domElement.dataset.shaderPreparationMs = (performance.now() - began).toFixed(1);
      gl.domElement.dataset.sceneReadyAtMs = performance.now().toFixed(1);
      onReady(true);
    }).catch(error => {
      if (mounted.current) setFailure(error instanceof Error ? error : new Error(String(error)));
    });
  });
  if (failure) throw failure;
  return null;
}
