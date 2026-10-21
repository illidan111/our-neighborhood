import { Suspense, useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { DirectionalLight, Group } from 'three';
import { AvatarErrorBoundary, HeroAvatar, retryHeroAvatar } from './CharacterAvatar';
import type { HeroMotion, HeroAnimationState } from './heroAnimation';
import type { HeroAsset } from './heroAsset';
import { ItemModel } from './Controller';
import type { ItemId, Vec3 } from './model';

const ANIMATIONS: Array<[HeroAnimationState, string]> = [
  ['idle', 'Ожидание'], ['walk', 'Ходьба'], ['run', 'Бег'], ['jump', 'Прыжок'],
  ['fall', 'Падение'], ['land', 'Приземление'], ['carry', 'Перенос'],
];
const ITEMS: Array<[ItemId, string]> = [['crate', 'Ящик'], ['battery', 'Аккумулятор'], ['boards', 'Доски']];
const VIEWS = {
  'Спереди': { position: [0, 1.05, 2.9], target: [0, .96, 0] },
  'Сбоку': { position: [2.9, 1.05, 0], target: [0, .96, 0] },
  'Сзади': { position: [0, 1.05, -2.9], target: [0, .96, 0] },
  'Три четверти': { position: [1.9, 1.1, 2.3], target: [0, .96, 0] },
  'Лицо': { position: [0, 1.54, .62], target: [0, 1.54, 0] },
} satisfies Record<string, { position: Vec3; target: Vec3 }>;
type View = keyof typeof VIEWS;
type StudioProps = {
  animation: HeroAnimationState; item: ItemId; view: View; storm: boolean; paused: boolean; carryWalk: boolean;
  timeline: MutableRefObject<number>; onTime: (time: number) => void;
  onReady: (metrics: HeroAsset['metrics']) => void; onError: (error: Error) => void;
};

function StudioScene({ animation, item, view, storm, paused, carryWalk, timeline, onTime, onReady, onError }: StudioProps) {
  const actor = useRef<Group>(null), sun = useRef<DirectionalLight>(null), reportClock = useRef(0);
  const motion = useRef<HeroMotion>({ speed: 0, distance: 0, grounded: true, verticalVelocity: 0, held: null, heading: 0, animation, previewTime: 0 });
  useFrame(({ camera }, frameDelta) => {
    const delta = Math.min(.05, frameDelta);
    if (!paused) timeline.current += delta;
    const speed = animation === 'run' ? 6.8 : animation === 'walk' || (animation === 'carry' && carryWalk) ? 4.2 : 0;
    const air = animation === 'jump' || animation === 'fall';
    const current = motion.current;
    current.animation = animation; current.previewTime = timeline.current;
    current.speed = speed; current.distance = timeline.current * speed; current.grounded = !air;
    current.verticalVelocity = animation === 'jump' ? 3.5 : animation === 'fall' ? -3.5 : 0;
    current.held = animation === 'carry' ? item : null;
    // Actual translating parent + a repeating two-metre floor grid make support-foot drift visible.
    // The isolated jump/fall poses are raised for inspection; they do not simulate a physical jump.
    const z = current.distance % 16, y = air ? .4 : 0;
    if (actor.current) actor.current.position.set(0, y, z);
    const pose = VIEWS[view];
    camera.position.set(pose.position[0], pose.position[1] + y, pose.position[2] + z);
    camera.lookAt(pose.target[0], pose.target[1] + y, pose.target[2] + z);
    if (sun.current) {
      sun.current.position.set(-4, 7, z + 5); sun.current.target.position.set(0, 1, z); sun.current.target.updateMatrixWorld();
    }
    reportClock.current += frameDelta;
    if (reportClock.current >= .2) { reportClock.current = 0; onTime(timeline.current); }
  }, -3);
  return <>
    <color attach="background" args={[storm ? '#8093a4' : '#e7e7d6']} />
    <hemisphereLight args={[storm ? '#b5cadc' : '#edf0df', storm ? '#697b79' : '#a5ad91', storm ? 1.05 : 1.5]} />
    <directionalLight ref={sun} position={[-4, 7, 5]} intensity={storm ? .75 : 2.1} color={storm ? '#c9d9e5' : '#fff1d8'} castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5}
      shadow-camera-near={.1} shadow-camera-far={18} shadow-bias={-.0002} shadow-normalBias={.015} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[160, 160]} /><meshStandardMaterial color={storm ? '#899b90' : '#c8cdb2'} roughness={1} /></mesh>
    <gridHelper args={[160, 80, storm ? '#73867c' : '#aeb89b', storm ? '#7d9083' : '#b9c2a8']} position={[0, .002, 0]} />
    <group ref={actor}>
      <AvatarErrorBoundary onError={onError}><Suspense fallback={null}>
        <HeroAvatar motionRef={motion} color="#5c9290" onReady={onReady} />
      </Suspense></AvatarErrorBoundary>
      {animation === 'carry' && <group position={[0, 1.15, item === 'boards' ? .56 : .52]}><ItemModel id={item} /></group>}
    </group>
  </>;
}

/** Isolated licensed VRM/skeleton inspection; no game state, saves or Pointer Lock. */
export default function HeroStudio() {
  const [animation, setAnimation] = useState<HeroAnimationState>('idle'), [item, setItem] = useState<ItemId>('crate');
  const [view, setView] = useState<View>('Спереди'), [storm, setStorm] = useState(false), [paused, setPaused] = useState(true);
  const [carryWalk, setCarryWalk] = useState(false), [time, setTime] = useState(0), [session, setSession] = useState(0);
  const [metrics, setMetrics] = useState<HeroAsset['metrics'] | null>(null), [error, setError] = useState('');
  const timeline = useRef(0);
  const ready = useCallback((value: HeroAsset['metrics']) => { setMetrics(value); setError(''); }, []);
  const failure = useCallback((value: Error) => setError(value.message), []);
  const chooseAnimation = (value: HeroAnimationState) => { timeline.current = 0; setTime(0); setAnimation(value); };
  const advance = (amount: number) => { setPaused(true); timeline.current = Math.max(0, timeline.current + amount); setTime(timeline.current); };
  const button = { border: '1px solid #b8c5bb', background: '#fff9e8', color: '#284d49', borderRadius: 5, padding: '7px 10px', cursor: 'pointer', font: '600 12px system-ui' };
  const selected = { ...button, background: '#d5e7ce' };
  return <main style={{ position: 'fixed', inset: 0, background: '#e7e7d6', fontFamily: 'system-ui, sans-serif' }}>
    <Canvas shadows dpr={1.5} camera={{ fov: 50, near: .03, far: 180, position: VIEWS['Спереди'].position }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <StudioScene key={session} animation={animation} item={item} view={view} storm={storm} paused={paused} carryWalk={carryWalk}
        timeline={timeline} onTime={setTime} onReady={ready} onError={failure} />
    </Canvas>
    {!metrics && !error && <div role="status" style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translateX(-50%)', padding: 16, color: 'white', background: '#31534cdd', borderRadius: 8 }}>Загружаем локальную VRM-модель и скелет…</div>}
    {error && <div role="alert" style={{ position: 'absolute', top: '38%', left: '25%', right: '25%', padding: 20, color: '#fff', background: '#8c3b3b', borderRadius: 8 }}>
      {error}<br /><button style={{ ...button, marginTop: 12 }} onClick={() => { setError(''); setMetrics(null); void retryHeroAvatar().catch(failure); setSession(value => value + 1); }}>Повторить загрузку</button>
    </div>}
    <nav aria-label="Студия героя" style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {ANIMATIONS.map(([value, label]) => <button key={value} style={animation === value ? selected : button} onClick={() => chooseAnimation(value)}>{label}</button>)}
      <button style={button} onClick={() => setPaused(value => !value)}>{paused ? 'Воспроизвести' : 'Пауза'}</button>
      <button style={button} onClick={() => advance(-.125)}>−⅛ с</button><button style={button} onClick={() => advance(.125)}>+⅛ с</button>
      <button style={button} onClick={() => { timeline.current = 0; setTime(0); setPaused(true); }}>В начало</button>
      <span style={{ flexBasis: '100%' }} />
      {(Object.keys(VIEWS) as View[]).map(value => <button key={value} style={view === value ? selected : button} onClick={() => setView(value)}>{value}</button>)}
      <button style={!storm ? selected : button} onClick={() => setStorm(false)}>Солнечный свет</button>
      <button style={storm ? selected : button} onClick={() => setStorm(true)}>Грозовой свет</button>
      {animation === 'carry' && <>
        {ITEMS.map(([value, label]) => <button key={value} style={item === value ? selected : button} onClick={() => setItem(value)}>{label}</button>)}
        <label style={{ ...button, display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={carryWalk} onChange={event => setCarryWalk(event.target.checked)} />Идти с предметом</label>
      </>}
    </nav>
    <aside style={{ position: 'absolute', bottom: 10, left: 10, padding: '10px 14px', color: '#fff', background: '#173d39e8', borderRadius: 6, fontSize: 12, maxWidth: 740 }}>
      <strong>Студия героя · импортированная VRM-модель и настоящий скелет</strong><br />
      <span data-testid="hero-studio-status">{ANIMATIONS.find(([value]) => value === animation)?.[1]} · {paused ? 'пауза' : 'воспроизведение'} · время {time.toFixed(3)} с · {storm ? 'грозовой' : 'солнечный'} свет · {view}</span><br />
      {metrics && <span data-testid="hero-studio-model">Модель: {metrics.triangles.toLocaleString('ru-RU')} треугольников · {metrics.drawMeshes} мешей · {metrics.skeletons} скелет · {metrics.textures} текстур<br /></span>}
      Пауза и шаг времени фиксируют позу. Сетка 2 м; ходьба 4,2 м/с, бег 6,8 м/с.<br />
      Это проверка модели и анимаций; прыжок, коллизии и ввод проверяются в игре отдельно.
    </aside>
  </main>;
}
