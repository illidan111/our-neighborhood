import { Profiler, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';
import type { DirectionalLight, Group } from 'three';
import Neighborhood from './Neighborhood';
import Diagnostics from './Diagnostics';
import type { BenchmarkMetrics, ReactMeasurements } from './Diagnostics';
import { createFPSGame } from './model';
import type { FPSState, Vec3 } from './model';
import { Character } from './Character';
import type { CharacterMotion, CharacterVariant } from './Character';
import type { CharacterAnimation } from './characterAnimation';
import { AvatarErrorBoundary, HeroAvatar } from './CharacterAvatar';
import type { HeroMotion } from './heroAnimation';
import type { GraphicsQuality } from './quality';

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
const reviewParams = new URLSearchParams(location.search);
const reviewDpr = reviewParams.get('dpr') === '1' ? 1 : 1.5;
const reviewWeather = reviewParams.get('weather') === 'storm' ? 'storm' : reviewParams.get('weather') === 'sun' ? 'sun' : 'route';
const reviewHero = reviewParams.get('hero') === '1';
const requestedQuality = reviewParams.get('quality');
const reviewQuality: GraphicsQuality = requestedQuality === 'low' || requestedQuality === 'balanced' ? requestedQuality : 'high';
const base = createFPSGame('Графический замер', '#e78064', 314159);
const STUDIO_VARIANTS: Array<[CharacterVariant, string]> = [['base', 'База']];
const STUDIO_ANIMATIONS: Array<[CharacterAnimation, string]> = [['idle', 'Ожидание'], ['walk', 'Ходьба'], ['run', 'Бег'], ['carry', 'Перенос'], ['react', 'Реакция']];
const STUDIO_VIEWS = {
  'Спереди': [0, 1.18, 2.65], 'Сбоку': [2.65, 1.18, 0], 'Три четверти': [1.6, 1.2, 1.9], 'Игровая дистанция': [0, 1.67, 6],
} satisfies Record<string, Vec3>;
type StudioView = keyof typeof STUDIO_VIEWS;

function CharacterStudio({ variant, animation, view, paused, step, reaction }: {
  variant: CharacterVariant; animation: CharacterAnimation; view: StudioView; paused: boolean; step: number; reaction: number;
}) {
  const actor = useRef<Group>(null), sun = useRef<DirectionalLight>(null);
  const motion = useRef<CharacterMotion>({ speed: 0, distance: 0, animation });
  const timeline = useRef(0), lastStep = useRef(step);
  useEffect(() => { timeline.current = 0; }, [animation, reaction]);
  useFrame(({ camera }, delta) => {
    if (!paused) timeline.current += Math.min(delta, .05);
    if (step !== lastStep.current) { timeline.current += .125 * (step - lastStep.current); lastStep.current = step; }
    const speed = animation === 'run' ? 2.5 : animation === 'walk' ? 1.05 : animation === 'carry' ? .8 : 0;
    motion.current.speed = speed; motion.current.animation = animation; motion.current.distance = timeline.current * speed; motion.current.previewTime = timeline.current;
    // The camera follows an actual translating parent. The grid repeats every two metres,
    // so the 16 m loop has no visible jump and planted feet can be inspected against it.
    const z = motion.current.distance % 16;
    if (actor.current) actor.current.position.z = z;
    const position = STUDIO_VIEWS[view];
    camera.position.set(position[0], position[1], position[2] + z); camera.lookAt(0, 1, z);
    if (sun.current) {
      sun.current.position.set(-4, 7, z + 5); sun.current.target.position.set(0, 1, z); sun.current.target.updateMatrixWorld();
    }
  }, -3);
  return <>
    <color attach="background" args={['#e4e9d7']} />
    <hemisphereLight args={['#eef1dd', '#9ba68a', 1.7]} />
    <directionalLight ref={sun} position={[-4, 7, 5]} intensity={2.6} color="#fff0d2" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-camera-near={.1} shadow-camera-far={18} shadow-bias={-.0002} shadow-normalBias={.018} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[160, 160]} /><meshStandardMaterial color="#cdd3bc" roughness={1} /></mesh>
    <gridHelper args={[160, 80, '#b7c0a8', '#bec6ae']} position={[0, .002, 0]} />
    <group ref={actor}>
      <Character key={`${variant}:${animation}`} variant={variant} animation={animation} motion={motion.current} reactionToken={animation === 'react' ? reaction : undefined} />
      {animation === 'carry' && <group position={[0, 1.02, .58]}>
        <mesh castShadow receiveShadow><boxGeometry args={[.86, .72, .66]} /><meshStandardMaterial color="#ba8d5b" roughness={.9} /></mesh>
        {[-.27, .27].map(x => <mesh key={x} position={[x, 0, 0]} castShadow><boxGeometry args={[.065, .74, .68]} /><meshStandardMaterial color="#86623f" roughness={.95} /></mesh>)}
        <mesh position={[0, 0, .34]}><boxGeometry args={[.27, .23, .012]} /><meshStandardMaterial color="#e8d9b6" roughness={.9} /></mesh>
      </group>}
    </group>
  </>;
}

function ReviewMotion({ pose, running, started, run, onHeroReady, onHeroError }: {
  pose: Pose; running: boolean; started: number; run: number; onHeroReady: () => void; onHeroError: (error: Error) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const hero = useRef<Group>(null);
  const heroMotion = useRef<HeroMotion>({ speed: 0, distance: 0, grounded: true, verticalVelocity: 0, held: null, heading: 0 });
  const heroPrevious = useRef<Vector3 | null>(null);
  const { rapier } = useRapier();
  const vectors = useRef({ look: new Vector3(), direction: new Vector3(), carry: new Vector3(), heroPosition: new Vector3(), heroDirection: new Vector3(),
    carryRotation: new Quaternion(), up: new Vector3(0, 1, 0) });
  const thrown = useRef(false), carried = useRef(false);
  useEffect(() => {
    thrown.current = false; carried.current = false;
    heroPrevious.current = null; heroMotion.current.distance = 0;
    body.current?.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.current?.setTranslation({ x: -9, y: .7, z: -7 }, true);
    body.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.current?.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.current?.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }, [run, rapier]);
  useFrame(({ camera }, delta) => {
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
    if (reviewHero && hero.current) {
      const data = vectors.current, motion = heroMotion.current;
      data.heroDirection.copy(data.direction); data.heroDirection.y = 0; data.heroDirection.normalize();
      data.heroPosition.copy(camera.position).addScaledVector(data.heroDirection, 2.5); data.heroPosition.y = .03;
      const travelled = heroPrevious.current ? data.heroPosition.distanceTo(heroPrevious.current) : 0;
      if (running && heroPrevious.current && travelled > .0001) {
        motion.heading = Math.atan2(data.heroPosition.x - heroPrevious.current.x, data.heroPosition.z - heroPrevious.current.z);
      } else if (!running || !heroPrevious.current) motion.heading = Math.atan2(data.heroDirection.x, data.heroDirection.z);
      motion.speed = running && delta > 0 ? travelled / delta : 0;
      motion.distance += running ? travelled : 0;
      motion.held = running && t >= 12 && t < 18 ? 'crate' : null;
      motion.animation = motion.held ? 'carry' : motion.speed > 5 ? 'run' : motion.speed > .12 ? 'walk' : 'idle';
      hero.current.position.copy(data.heroPosition); hero.current.rotation.y = motion.heading;
      // This opt-in scenario adds the real skinned avatar. It reuses the existing crate body,
      // placing it in the hero's hands during the same 12–18 s carry interval (never duplicates it).
      if (motion.held) {
        data.carry.set(data.heroPosition.x + Math.sin(motion.heading) * .52, data.heroPosition.y + 1.15,
          data.heroPosition.z + Math.cos(motion.heading) * .52);
        data.carryRotation.setFromAxisAngle(data.up, motion.heading);
      }
      heroPrevious.current ??= new Vector3();
      heroPrevious.current.copy(data.heroPosition);
    }
  }, -2);
  useBeforePhysicsStep(() => {
    if (!body.current || !running) return;
    const t = (performance.now() - started) / 1000;
    if (t >= 12 && t < 18) {
      if (!carried.current) { body.current.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true); carried.current = true; }
      body.current.setNextKinematicTranslation(vectors.current.carry);
      if (reviewHero) body.current.setNextKinematicRotation(vectors.current.carryRotation);
    }
    if (t >= 18 && !thrown.current) {
      body.current.setBodyType(rapier.RigidBodyType.Dynamic, true);
      body.current.setLinvel({ x: vectors.current.direction.x * 7, y: 3, z: vectors.current.direction.z * 7 }, true);
      body.current.setAngvel({ x: 1, y: 1.2, z: .3 }, true); thrown.current = true;
    }
  });
  return <><RigidBody ref={body} type="dynamic" position={[-9, .7, -7]} colliders={false} ccd linearDamping={.18} angularDamping={.8} canSleep>
    <CuboidCollider args={[.43, .36, .33]} friction={.9} restitution={.08} />
    <mesh castShadow receiveShadow><boxGeometry args={[.86, .72, .66]} /><meshStandardMaterial color="#dc9d54" /></mesh>
    {[-.27, .27].map(x => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[.09, .745, .685]} /><meshStandardMaterial color="#bd793e" /></mesh>)}
    <mesh position={[0, .01, .343]}><boxGeometry args={[.3, .28, .015]} /><meshStandardMaterial color="#f7e8b5" /></mesh>
    <mesh position={[0, .01, .355]}><boxGeometry args={[.05, .17, .013]} /><meshStandardMaterial color="#6c9269" /></mesh>
    <mesh position={[0, .01, .365]}><boxGeometry args={[.17, .05, .013]} /><meshStandardMaterial color="#6c9269" /></mesh>
  </RigidBody>
    {reviewHero && <group ref={hero}><AvatarErrorBoundary onError={onHeroError}><Suspense fallback={null}>
      <HeroAvatar motionRef={heroMotion} color="#5c9290" onReady={onHeroReady} />
    </Suspense></AvatarErrorBoundary></group>}
  </>;
}

/** Read-only synthetic graphics route; never reads or writes game saves. */
export default function ReviewApp() {
  const [poseName, setPoseName] = useState('Площадь');
  const [state, setState] = useState<FPSState>({ ...base, phase: reviewWeather === 'storm' ? 'storm' : 'preparation' });
  const [run, setRun] = useState(0), [running, setRunning] = useState(false), [started, setStarted] = useState(0);
  const [metrics, setMetrics] = useState<BenchmarkMetrics | null>(null), [json, setJson] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(!reviewHero), [heroError, setHeroError] = useState('');
  const heroReady = useCallback(() => setHeroLoaded(true), []);
  const heroFailed = useCallback((error: Error) => setHeroError(error.message), []);
  const [studio, setStudio] = useState(false), [variant, setVariant] = useState<CharacterVariant>('base');
  const [animation, setAnimation] = useState<CharacterAnimation>('idle'), [view, setView] = useState<StudioView>('Три четверти');
  const [paused, setPaused] = useState(false), [step, setStep] = useState(0), [reaction, setReaction] = useState(0);
  const reactMeasurements = useRef<ReactMeasurements>({ commits: 0, durationMs: 0 });
  const pose = REVIEW_POSES[poseName];
  useEffect(() => {
    if (!running) return;
    // Mirror the live controller's checkpoint cadence without touching localStorage.
    const timer = window.setInterval(() => setState(value => ({ ...value, checkpoint: { ...value.checkpoint, yaw: value.checkpoint.yaw + .001 } })), 1500);
    const storm = reviewWeather === 'route' ? window.setTimeout(() => setState(value => ({ ...value, phase: 'storm' })), 24000) : undefined;
    return () => { clearInterval(timer); clearTimeout(storm); };
  }, [running]);
  const select = (name: string) => { setRunning(false); setPoseName(name); setState({ ...base, phase: REVIEW_POSES[name].phase }); };
  const start = () => { setState({ ...base, phase: reviewWeather === 'storm' ? 'storm' : 'preparation' }); setStarted(performance.now()); setRun(value => value + 1); setRunning(true); setJson(false); };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'neighborhood-benchmark.json'; link.click(); URL.revokeObjectURL(url);
  };
  const buttonStyle = { border: '1px solid #b8c5bb', background: '#fff9e8', color: '#284d49', borderRadius: 5, padding: '7px 10px', cursor: 'pointer', font: '600 12px system-ui' };
  return <main style={{ position: 'fixed', inset: 0, background: '#bed9d4', fontFamily: 'system-ui, sans-serif' }}>
    <Canvas shadows={reviewQuality !== 'low'} dpr={reviewDpr} camera={{ fov: 70, near: .05, far: 180, position: pose.position }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Suspense fallback={null}>{studio ? <CharacterStudio variant={variant} animation={animation} view={view} paused={paused} step={step} reaction={reaction} /> : <Physics timeStep={1 / 60}>
        <Profiler id="Neighborhood" onRender={(_id, _phase, actualDuration) => { reactMeasurements.current.commits++; reactMeasurements.current.durationMs += actualDuration; }}>
          <Neighborhood state={state} quality={reviewQuality} />
        </Profiler>
        <ReviewMotion pose={pose} run={run} running={running} started={started} onHeroReady={heroReady} onHeroError={heroFailed} />
        <Diagnostics run={run} reactMeasurements={reactMeasurements} onSample={sample => setMetrics({ ...sample, scenario: reviewWeather, buildMode: import.meta.env.MODE, hero: reviewHero, quality: reviewQuality })} onComplete={() => setRunning(false)} />
      </Physics>}</Suspense>
    </Canvas>
    <nav aria-label="Ракурсы проверки" style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <button style={{ ...buttonStyle, background: studio ? '#d5e7ce' : buttonStyle.background }} disabled={running} onClick={() => { setStudio(value => !value); setJson(false); }}>Персонажи</button>
      {!studio && <>{Object.keys(REVIEW_POSES).map(name => <button style={{ ...buttonStyle, background: name === poseName ? '#d5e7ce' : buttonStyle.background }} disabled={running} key={name} onClick={() => select(name)}>{name}</button>)}
      <button style={buttonStyle} disabled={running || !metrics || !heroLoaded || Boolean(heroError)} onClick={start}>{running ? 'Замер идёт…' : 'Замер 30 с'}</button>
      <button style={buttonStyle} onClick={() => setJson(value => !value)}>JSON</button>
      <button style={buttonStyle} disabled={!metrics} onClick={exportJson}>Скачать JSON</button></>}
      {studio && <>
        {STUDIO_VARIANTS.map(([id, label]) => <button style={{ ...buttonStyle, background: variant === id ? '#d5e7ce' : buttonStyle.background }} key={id} onClick={() => setVariant(id)}>{label}</button>)}
        {STUDIO_ANIMATIONS.map(([id, label]) => <button style={{ ...buttonStyle, background: animation === id ? '#d5e7ce' : buttonStyle.background }} key={id} onClick={() => { setAnimation(id); if (id === 'react') setReaction(value => value + 1); }}>{label}</button>)}
        <span style={{ flexBasis: '100%' }} />
        {(Object.keys(STUDIO_VIEWS) as StudioView[]).map(name => <button style={{ ...buttonStyle, background: view === name ? '#d5e7ce' : buttonStyle.background }} key={name} onClick={() => setView(name)}>{name}</button>)}
        <button style={buttonStyle} onClick={() => setPaused(value => !value)}>{paused ? 'Продолжить' : 'Пауза'}</button>
        <button style={buttonStyle} onClick={() => { setPaused(true); setStep(value => value + 1); }}>Шаг ⅛ с</button>
      </>}
    </nav>
    <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '8px 12px', maxWidth: 610, color: '#fff', background: '#173d39dd', borderRadius: 6, fontSize: 12 }}>
      {studio ? <><strong>Студия персонажа · {STUDIO_VARIANTS.find(([id]) => id === variant)?.[1]}</strong><br />
        Высота около 1,85 м · сетка 2 м · движение родителя связано с длиной шага.<br />
        Пауза фиксирует всю позу. «Шаг ⅛ с» сдвигает её на 0,125 с.
      </> : <><strong>Синтетический графический замер · не плейтест</strong><br />
      {running ? `0–12 с: маршрут и NPC · 12–18 с: ящик · 18 с: бросок · ${reviewWeather === 'route' ? '24 с: гроза' : reviewWeather === 'storm' ? 'гроза весь маршрут' : 'солнце весь маршрут'}` : `Камера 70° · DPR ${reviewDpr} · ${reviewWeather} · ${import.meta.env.MODE} · без игровых сохранений`}
      <div>Качество: {reviewQuality} · {reviewHero ? 'район + анимированный VRM-герой (синтетический маршрут)' : 'только район, без модели игрока'}</div>
      {reviewHero && !heroLoaded && <div>{heroError || 'Загружается модель героя; замер пока недоступен.'}</div>}
      {metrics && <div data-testid="benchmark-status">{metrics.status} · {metrics.durationSeconds} с · {metrics.fps ?? '—'} FPS · p95 {metrics.frameMs?.p95 ?? '—'} мс · {metrics.drawCalls?.p50 ?? '—'} calls · {metrics.triangles?.p50 ?? '—'} triangles</div>}
      <div>Видимость DOM не гарантирует отсутствие ограничения частоты браузером.</div></>}
    </div>
    {json && <pre data-testid="benchmark-json" style={{ position: 'absolute', top: 60, right: 10, bottom: 10, width: 440, overflow: 'auto', padding: 14, margin: 0, background: '#14332fef', color: '#e8f2df', fontSize: 11 }}>{JSON.stringify(metrics, null, 2)}</pre>}
  </main>;
}
