import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import Controller from './Controller';
import type { ControllerPose, ControllerReviewInput } from './Controller';
import Neighborhood from './Neighborhood';
import { applyCommand, createFPSGame, describeTarget, ITEM_NAMES } from './model';
import type { FPSState, GameCommand, TargetId, Vec3 } from './model';

type Fixture = { position: Vec3; yaw: number; pitch: number };
export const CAMERA_REVIEW_FIXTURES: Record<string, Fixture> = {
  'Дом': { position: [-14, 1, 15], yaw: 0, pitch: -.25 },
  'Площадь': { position: [1.5, 1, 5], yaw: 0, pitch: -.25 },
  'Ящик': { position: [-9, 1, -4.8], yaw: 0, pitch: -.35 },
  'Генератор': { position: [12, 1, -7.8], yaw: 0, pitch: -.35 },
  'Доски': { position: [0, 1, -3.8], yaw: 0, pitch: -.35 },
  'Мост': { position: [19, 1, 6.2], yaw: 0, pitch: -.35 },
  'Стена': { position: [-14, 1, 18.4], yaw: 0, pitch: -.2 },
  'Склон / ступени': { position: [28.1, 1, 4], yaw: -Math.PI / 2, pitch: -.25 },
  'Полка дома': { position: [-16, 1, 15.2], yaw: 0, pitch: -.45 },
  'Разъём дома': { position: [-11, 1, 12.6], yaw: 0, pitch: -.25 },
  'Разъём магазина': { position: [-12, 1, -5.6], yaw: 0, pitch: -.25 },
  'Колокол': { position: [0, 1, 3.2], yaw: 0, pitch: -.15 },
};
const emptyInput = (): ControllerReviewInput => ({ forward: 0, right: 0, sprint: false, jump: false, steps: 0 });
function newReview(fixture = CAMERA_REVIEW_FIXTURES['Дом']): FPSState {
  return { ...createFPSGame('Проверка камеры', '#b9775d', 314159), checkpoint: { ...fixture, position: [...fixture.position] } };
}
class ReviewBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) }; }
  render() { return this.state.error ? <div style={{ padding: 28, color: '#fff', background: '#8c3b3b' }}>Не удалось загрузить сцену проверки: {this.state.error}<br />Обновите страницу; игровые сохранения не менялись.</div> : this.props.children; }
}

/** Explicit button-driven harness for real KCC/camera/interaction code, never a Pointer Lock playtest. */
export default function CameraReview() {
  const [state, setState] = useState(newReview), [session, setSession] = useState(0);
  const [paused, setPaused] = useState(false), [ready, setReady] = useState(false), [fixtureName, setFixtureName] = useState('Дом');
  const [preserve, setPreserve] = useState(false), [details, setDetails] = useState(false), [scenario, setScenario] = useState(false);
  const [focus, setFocus] = useState<TargetId | null>(null), [pose, setPose] = useState<ControllerPose | null>(null);
  const [lastAction, setLastAction] = useState('Ожидание загрузки'), [poseRange, setPoseRange] = useState({ minY: 1, maxY: 1 });
  const input = useRef<ControllerReviewInput>(emptyInput()), poseRef = useRef<ControllerPose | null>(null);
  const command = useCallback((action: GameCommand) => {
    setState(before => applyCommand(before, action));
    if (action.type !== 'snapshot' && action.type !== 'saveCheckpoint') setLastAction(action.type === 'interact' ? `E → ${action.target}` : action.type);
  }, []);
  const receivePose = useCallback((value: ControllerPose) => {
    poseRef.current = value; setPose(value); setReady(true);
    setPoseRange(range => ({ minY: Math.min(range.minY, value.position[1]), maxY: Math.max(range.maxY, value.position[1]) }));
  }, []);
  useEffect(() => {
    if (state.phase !== 'storm' || paused) return;
    const timer = window.setTimeout(() => command({ type: 'finishStorm' }), 18000);
    return () => clearTimeout(timer);
  }, [state.phase, paused, command]);

  const fixture = (name: string) => {
    const destination = CAMERA_REVIEW_FIXTURES[name];
    input.current = emptyInput(); poseRef.current = null; setPose(null); setFocus(null); setReady(false); setPaused(false);
    setPoseRange({ minY: destination.position[1], maxY: destination.position[1] });
    setState(previous => {
      if (!preserve) return newReview(destination);
      const next: FPSState = { ...previous, checkpoint: { ...destination, position: [...destination.position] }, items: { ...previous.items } };
      // This explicitly selected fixture relocates a held item too; it is not claimed as a carried route.
      if (next.held) next.items[next.held] = { ...next.items[next.held], position: [destination.position[0], destination.position[1] + .25, destination.position[2] - .52] };
      return next;
    });
    setFixtureName(name); setSession(value => value + 1); setLastAction(`Тестовая точка: ${name}${preserve ? ' · прогресс перенесён' : ' · новая партия в памяти'}`);
  };
  const movement = (forward: number, right: number, sprint = false, jump = false) => {
    Object.assign(input.current, { forward, right, sprint, jump, steps: 30 });
    setLastAction(`${jump ? 'Прыжок' : sprint ? 'Бег' : 'Движение'}: 30 шагов × 1/60 с`);
  };
  const orbit = (delta: number) => {
    input.current.yaw = (input.current.yaw ?? poseRef.current?.yaw ?? 0) + delta;
    setLastAction(`Поворот камеры ${Math.round(delta * 180 / Math.PI)}°`);
  };
  const look = (delta: number) => {
    input.current.pitch = Math.max(-.95, Math.min(.35, (input.current.pitch ?? poseRef.current?.pitch ?? -.25) + delta));
    setLastAction(delta > 0 ? 'Обзор вверх' : 'Обзор вниз');
  };
  const action = (value: 'interact' | 'drop' | 'throw') => { input.current.action = value; setLastAction(`Ожидает контроллера: ${value}`); };
  const description = focus ? describeTarget(state, focus) : null;
  const buttonStyle = { border: '1px solid #b8c5bb', background: '#fff9e8', color: '#284d49', borderRadius: 5, padding: '6px 9px', cursor: 'pointer', font: '600 12px system-ui' };
  const status = { fixture: fixtureName, paused, remainingInputSteps: input.current.steps, focus, held: state.held, phase: state.phase, supplies: state.deliveredSupplies, batteryAt: state.batteryAt, bridgeRepaired: state.bridgeRepaired,
    pose: pose ? { ...pose, position: pose.position.map(n => +n.toFixed(3)), cameraPosition: pose.cameraPosition.map(n => +n.toFixed(3)), cameraDistance: +pose.cameraDistance.toFixed(3) } : null,
    sampledHeightRange: poseRange, lastAction };
  return <main style={{ position: 'fixed', inset: 0, background: '#bed9d4', fontFamily: 'system-ui, sans-serif' }}>
    <ReviewBoundary key={session}>
      <Canvas shadows dpr={1.5} camera={{ fov: 65, near: .05, far: 180, position: [-14, 3, 19] }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <Suspense fallback={null}><Physics timeStep={1 / 60} paused={paused} gravity={[0, -22, 0]}>
          <Neighborhood state={state} />
          <Controller state={state} active={!paused} sensitivity={1} bob={false} onCommand={command} onFocus={setFocus} onPose={receivePose} reviewInput={input} />
        </Physics></Suspense>
      </Canvas>
    </ReviewBoundary>
    {!ready && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#31534c55', color: 'white', pointerEvents: 'none' }}>Загружаем район и модель героя…</div>}
    <nav aria-label="Проверка камеры" style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      <select aria-label="Тестовая точка" value={fixtureName} onChange={event => fixture(event.target.value)} style={buttonStyle}>{Object.keys(CAMERA_REVIEW_FIXTURES).map(name => <option key={name}>{name}</option>)}</select>
      <button style={buttonStyle} onClick={() => fixture(fixtureName)}>Повторить точку</button>
      <label style={{ ...buttonStyle, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={preserve} onChange={event => setPreserve(event.target.checked)} />Переносить прогресс между точками</label>
      <button style={buttonStyle} disabled={!ready} onClick={() => setPaused(value => !value)}>{paused ? 'Продолжить физику' : 'Пауза физики'}</button>
      <button style={buttonStyle} onClick={() => setDetails(value => !value)}>JSON</button>
      <button style={buttonStyle} onClick={() => setScenario(value => !value)}>Сценарные фикстуры</button>
      <span style={{ flexBasis: '100%' }} />
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => movement(1, 0)}>W · вперёд</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => movement(-1, 0)}>S · назад</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => movement(0, -1)}>A · влево</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => movement(0, 1)}>D · вправо</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => movement(1, 0, true)}>Shift W · бег</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => movement(0, 0, false, true)}>Space · прыжок</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => movement(1, 0, false, true)}>W Space</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => { input.current.steps = 0; setLastAction('Ввод остановлен'); }}>Стоп ввода</button>
      <span style={{ flexBasis: '100%' }} />
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => orbit(Math.PI / 2)}>Камера ← 90°</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => orbit(-Math.PI / 2)}>Камера → 90°</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => orbit(Math.PI / 12)}>← 15°</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => orbit(-Math.PI / 12)}>→ 15°</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => look(.15)}>Обзор ↑</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => look(-.15)}>Обзор ↓</button>
      {[2, 4, 6].map(distance => <button style={buttonStyle} disabled={!ready || paused} key={distance} onClick={() => { input.current.distance = distance; setLastAction(`Дистанция камеры ${distance} м`); }}>{distance} м</button>)}
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => action('interact')}>E · действие</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => action('drop')}>Q · отпустить</button>
      <button style={buttonStyle} disabled={!ready || paused} onClick={() => action('throw')}>G · бросить</button>
      {scenario && <>
        <span style={{ flexBasis: '100%' }} />
        <span style={{ ...buttonStyle, background: '#edcf9d' }}>Фикстуры состояния — не действия игрока:</span>
        <button style={buttonStyle} onClick={() => command({ type: 'startStorm' })}>Начать грозу</button>
        <button style={buttonStyle} onClick={() => command({ type: 'finishStorm' })}>Итоги грозы</button>
      </>}
    </nav>
    <div aria-hidden="true" style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, margin: -3, background: 'white', border: '1px solid #254a47', borderRadius: '50%', pointerEvents: 'none' }} />
    {description && <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translateX(-50%)', padding: '8px 14px', background: '#183f3beb', color: 'white', borderRadius: 6, fontSize: 13 }}>E · {description.label}</div>}
    <div style={{ position: 'absolute', left: 8, bottom: 8, padding: '8px 12px', color: '#fff', background: '#173d39e8', borderRadius: 6, fontSize: 12, maxWidth: 720 }}>
      <strong>Проверка реального контроллера кнопками · не Pointer Lock плейтест</strong><br />
      30 шагов = 0,5 с симуляции. Точки явно переносят героя; сохранения игры не используются.<br />
      <span data-testid="camera-review-status">{lastAction} · Осталось шагов: {input.current.steps} · {state.held ? ITEM_NAMES[state.held] : 'Руки свободны'} · {state.phase}</span><br />
      {pose && <span data-testid="camera-review-pose">Позиция {pose.position.map(n => n.toFixed(2)).join(', ')} · Камера {pose.cameraDistance.toFixed(2)} м · {pose.grounded ? 'на земле' : 'в воздухе'}</span>}<br />
      <span data-testid="camera-review-outcome">Припасы: {state.deliveredSupplies ? 'да' : 'нет'} · Питание: {state.batteryAt ?? 'нет'} · Мост: {state.bridgeRepaired ? 'готов' : 'нет'}</span>
    </div>
    {details && <pre data-testid="camera-review-json" style={{ position: 'absolute', top: scenario ? 180 : 150, right: 8, bottom: 8, width: 365, overflow: 'auto', padding: 12, margin: 0, background: '#14332fef', color: '#e8f2df', fontSize: 11 }}>{JSON.stringify(status, null, 2)}</pre>}
  </main>;
}
