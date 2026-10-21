import { Profiler, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';
import Neighborhood from './Neighborhood';
import Diagnostics from './Diagnostics';
import type { BenchmarkMetrics, ReactMeasurements } from './Diagnostics';
import { createFPSGame } from './model';
import type { FPSState, Vec3 } from './model';

type Pose = { position: Vec3; look: Vec3; phase: FPSState['phase'] };
export const REVIEW_POSES: Record<string, Pose> = {
  'Площадь': { position: [1, 1.67, 9], look: [-7, 1.3, -6], phase: 'preparation' },
  'Борис крупно': { position: [-9.1, 1.5, -5.2], look: [-10, 1.08, -8], phase: 'preparation' },
  'Борис сбоку': { position: [-7.2, 1.4, -8.7], look: [-10, 1.07, -8], phase: 'preparation' },
  'Дом': { position: [-14, 1.67, 16], look: [-13.3, 1.35, 10], phase: 'preparation' },
  'Гроза': { position: [1, 1.67, 9], look: [-7, 1.3, -6], phase: 'storm' },
};
const ROUTE: Array<{ time: number; position: Vec3; look: Vec3 }> = [
  { time: 0, position: [-14, 1.67, 8], look: [-7, 1.3, 0] },
  { time: 5, position: [0, 1.67, 5], look: [-10, 1.1, -8] },
  { time: 10, position: [-9.1, 1.5, -5.2], look: [-10, 1.08, -8] },
  { time: 15, position: [-7, 1.67, -3], look: [-2, 1, 0] },
  { time: 20, position: [5, 1.67, 4], look: [12, 1, -11] },
  { time: 25, position: [17, 1.67, 6], look: [24, .6, 4] },
  { time: 30, position: [1, 1.67, 9], look: [-7, 1.3, -6] },
];
const base = createFPSGame('Графический замер', '#e78064', 314159);

function ReviewMotion({ pose, running, started, run }: { pose: Pose; running: boolean; started: number; run: number }) {
  const body = useRef<RapierRigidBody>(null);
  const { rapier } = useRapier();
  const vectors = useRef({ look: new Vector3(), direction: new Vector3(), carry: new Vector3() });
  const thrown = useRef(false), carried = useRef(false);
  useEffect(() => {
    thrown.current = false; carried.current = false;
    body.current?.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.current?.setTranslation({ x: -9, y: .7, z: -7 }, true);
    body.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.current?.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.current?.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }, [run, rapier]);
  useFrame(({ camera }) => {
    const t = running ? Math.min(30, (performance.now() - started) / 1000) : 0;
    if (!running) { camera.position.fromArray(pose.position); vectors.current.look.fromArray(pose.look); }
    else {
      const index = Math.min(ROUTE.length - 2, Math.floor(t / 5));
      const a = ROUTE[index], b = ROUTE[index + 1], u = Math.min(1, (t - a.time) / (b.time - a.time));
      const blend = u * u * (3 - 2 * u);
      camera.position.set(a.position[0] + (b.position[0] - a.position[0]) * blend, a.position[1] + (b.position[1] - a.position[1]) * blend, a.position[2] + (b.position[2] - a.position[2]) * blend);
      vectors.current.look.set(a.look[0] + (b.look[0] - a.look[0]) * blend, a.look[1] + (b.look[1] - a.look[1]) * blend, a.look[2] + (b.look[2] - a.look[2]) * blend);
    }
    camera.lookAt(vectors.current.look);
    camera.getWorldDirection(vectors.current.direction);
    vectors.current.carry.copy(camera.position).addScaledVector(vectors.current.direction, 1.3);
    vectors.current.carry.y -= .4;
  }, -2);
  useBeforePhysicsStep(() => {
    if (!body.current || !running) return;
    const t = (performance.now() - started) / 1000;
    if (t >= 12 && t < 18) {
      if (!carried.current) { body.current.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true); carried.current = true; }
      body.current.setNextKinematicTranslation(vectors.current.carry);
    }
    if (t >= 18 && !thrown.current) {
      body.current.setBodyType(rapier.RigidBodyType.Dynamic, true);
      body.current.setLinvel({ x: vectors.current.direction.x * 7, y: 3, z: vectors.current.direction.z * 7 }, true);
      body.current.setAngvel({ x: 1, y: 1.2, z: .3 }, true); thrown.current = true;
    }
  });
  return <RigidBody ref={body} type="dynamic" position={[-9, .7, -7]} colliders={false} ccd linearDamping={.18} angularDamping={.8} canSleep>
    <CuboidCollider args={[.43, .36, .33]} friction={.9} restitution={.08} />
    <mesh castShadow receiveShadow><boxGeometry args={[.86, .72, .66]} /><meshStandardMaterial color="#dc9d54" /></mesh>
    {[-.27, .27].map(x => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[.09, .745, .685]} /><meshStandardMaterial color="#bd793e" /></mesh>)}
    <mesh position={[0, .01, .343]}><boxGeometry args={[.3, .28, .015]} /><meshStandardMaterial color="#f7e8b5" /></mesh>
    <mesh position={[0, .01, .355]}><boxGeometry args={[.05, .17, .013]} /><meshStandardMaterial color="#6c9269" /></mesh>
    <mesh position={[0, .01, .365]}><boxGeometry args={[.17, .05, .013]} /><meshStandardMaterial color="#6c9269" /></mesh>
  </RigidBody>;
}

/** Read-only synthetic graphics route; never reads or writes game saves. */
export default function ReviewApp() {
  const [poseName, setPoseName] = useState('Площадь');
  const [state, setState] = useState(base);
  const [run, setRun] = useState(0), [running, setRunning] = useState(false), [started, setStarted] = useState(0);
  const [metrics, setMetrics] = useState<BenchmarkMetrics | null>(null), [json, setJson] = useState(false);
  const reactMeasurements = useRef<ReactMeasurements>({ commits: 0, durationMs: 0 });
  const pose = REVIEW_POSES[poseName];
  useEffect(() => {
    if (!running) return;
    // Mirror the live controller's checkpoint cadence without touching localStorage.
    const timer = window.setInterval(() => setState(value => ({ ...value, checkpoint: { ...value.checkpoint, yaw: value.checkpoint.yaw + .001 } })), 1500);
    const storm = window.setTimeout(() => setState(value => ({ ...value, phase: 'storm' })), 24000);
    return () => { clearInterval(timer); clearTimeout(storm); };
  }, [running]);
  const select = (name: string) => { setRunning(false); setPoseName(name); setState({ ...base, phase: REVIEW_POSES[name].phase }); };
  const start = () => { setState({ ...base }); setStarted(performance.now()); setRun(value => value + 1); setRunning(true); setJson(false); };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'neighborhood-benchmark.json'; link.click(); URL.revokeObjectURL(url);
  };
  const buttonStyle = { border: '1px solid #b8c5bb', background: '#fff9e8', color: '#284d49', borderRadius: 5, padding: '7px 10px', cursor: 'pointer', font: '600 12px system-ui' };
  return <main style={{ position: 'fixed', inset: 0, background: '#bed9d4', fontFamily: 'system-ui, sans-serif' }}>
    <Canvas shadows dpr={1.5} camera={{ fov: 70, near: .05, far: 180, position: pose.position }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Suspense fallback={null}><Physics timeStep={1 / 60}>
        <Profiler id="Neighborhood" onRender={(_id, _phase, actualDuration) => { reactMeasurements.current.commits++; reactMeasurements.current.durationMs += actualDuration; }}>
          <Neighborhood state={state} />
        </Profiler>
        <ReviewMotion pose={pose} run={run} running={running} started={started} />
        <Diagnostics run={run} reactMeasurements={reactMeasurements} onSample={setMetrics} onComplete={() => setRunning(false)} />
      </Physics></Suspense>
    </Canvas>
    <nav aria-label="Ракурсы проверки" style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {Object.keys(REVIEW_POSES).map(name => <button style={{ ...buttonStyle, background: name === poseName ? '#d5e7ce' : buttonStyle.background }} disabled={running} key={name} onClick={() => select(name)}>{name}</button>)}
      <button style={buttonStyle} disabled={running || !metrics} onClick={start}>{running ? 'Замер идёт…' : 'Замер 30 с'}</button>
      <button style={buttonStyle} onClick={() => setJson(value => !value)}>JSON</button>
      <button style={buttonStyle} disabled={!metrics} onClick={exportJson}>Скачать JSON</button>
    </nav>
    <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '8px 12px', maxWidth: 610, color: '#fff', background: '#173d39dd', borderRadius: 6, fontSize: 12 }}>
      <strong>Синтетический графический замер · не плейтест</strong><br />
      {running ? '0–12 с: маршрут и NPC · 12–18 с: ящик · 18 с: бросок · 24 с: гроза' : 'Фиксированные ракурсы · камера 70° · DPR 1.5 · без игровых сохранений'}
      {metrics && <div data-testid="benchmark-status">{metrics.status} · {metrics.durationSeconds} с · {metrics.fps ?? '—'} FPS · p95 {metrics.frameMs?.p95 ?? '—'} мс · {metrics.drawCalls?.p50 ?? '—'} calls · {metrics.triangles?.p50 ?? '—'} triangles</div>}
    </div>
    {json && <pre data-testid="benchmark-json" style={{ position: 'absolute', top: 60, right: 10, bottom: 10, width: 440, overflow: 'auto', padding: 14, margin: 0, background: '#14332fef', color: '#e8f2df', fontSize: 11 }}>{JSON.stringify(metrics, null, 2)}</pre>}
  </main>;
}
