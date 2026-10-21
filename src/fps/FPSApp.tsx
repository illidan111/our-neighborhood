import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { BookOpen, House, ArrowRight, RotateCcw, Volume2, Footprints, Sun, CloudRain, Check, X } from 'lucide-react';
import Controller from './Controller';
import Neighborhood from './Neighborhood';
import { applyCommand, createFPSGame, describeTarget, getFPSOutcome, getObjective, ITEM_NAMES, PERSONAL_NOTE } from './model';
import type { FPSState, GameCommand, TargetId, Vec3 } from './model';
import { clearFPS, loadFPS } from './storage';
import { persistFPS, saveTelemetry } from './saveTelemetry';
import Diagnostics from './Diagnostics';
import type { BenchmarkMetrics } from './Diagnostics';
import { BOT } from '../game';
import { enableAudio, sound, unlockAudio } from './audio';

type Settings = { sensitivity: number; bob: boolean; audio: boolean };
const SETTINGS_KEY = 'our-neighborhood-controls';
function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { sensitivity: typeof value?.sensitivity === 'number' && Number.isFinite(value.sensitivity) ? Math.min(2, Math.max(.2, value.sensitivity)) : 1, bob: value?.bob === true, audio: value?.audio !== false };
  } catch { return { sensitivity: 1, bob: false, audio: true }; }
}
class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Не удалось запустить 3D-сцену', error, info); }
  render() { return this.state.error ? <div className="scene-error">Не удалось запустить 3D. Обнови страницу в браузере с включённым WebGL. Прогресс сохранён отдельно.</div> : this.props.children; }
}
const phaseNames = { preparation: 'День 1 · до грозы', storm: 'День 1 · гроза', aftermath: 'После грозы · утро' };

export default function FPSApp() {
  const [loaded] = useState(loadFPS);
  const [state, setState] = useState<FPSState>(() => loaded.state ?? createFPSGame('Сосед', '#e78064'));
  const stateRef = useRef(state);
  const [settings, setSettings] = useState(readSettings);
  const [menu, setMenu] = useState<'start' | 'pause' | 'journal' | null>('start');
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<TargetId | null>(null);
  const [toast, setToast] = useState('');
  const [inputError, setInputError] = useState('');
  const [saveError, setSaveError] = useState(loaded.error ?? '');
  const [confirmReset, setConfirmReset] = useState(false);
  const [session, setSession] = useState(0);
  const [name, setName] = useState(state.player.name);
  const [color, setColor] = useState(state.player.color);
  const [hasBegun, setHasBegun] = useState(false);
  const begunRef = useRef(false);
  const lastSaveAttempt = useRef<FPSState | null>(null);
  const [diagnostics, setDiagnostics] = useState(false);
  const [metrics, setMetrics] = useState<BenchmarkMetrics | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const surface = useRef<HTMLDivElement | null>(null);
  const walking = useRef(false);
  const active = locked && menu === null;
  const outcome = getFPSOutcome(state);
  const target = focus ? describeTarget(state, focus) : null;
  const [remaining, setRemaining] = useState(18);

  const command = useCallback((action: GameCommand) => {
    const before = stateRef.current;
    const after = applyCommand(before, action);
    if (action.type === 'interact' && BOT.some(bot => bot.id === action.target)) {
      const bot = BOT.find(bot => bot.id === action.target)!;
      setToast(`${bot.name}: ${after.botReactions[bot.id]}`);
    } else if (action.type === 'interact' && action.target === 'note') {
      document.exitPointerLock(); setMenu('journal');
    } else if (after.history.length > before.history.length) {
      setToast(after.history.at(-1)!.text);
    }
    if (after === before) return;
    if (after.phase !== before.phase && after.phase === 'storm') { sound('bell'); setRemaining(18); }
    else if (after.held && !before.held) sound('pick');
    else if (!after.held && before.held) sound(action.type === 'drop' ? 'drop' : 'install');
    stateRef.current = after;
    if (begunRef.current && (action.type === 'snapshot' || action.type === 'saveCheckpoint')) {
      // This synchronous path also flushes pagehide/blur. The effect below skips it.
      lastSaveAttempt.current = after;
      setSaveError(persistFPS(after) ? '' : 'Не удалось сохранить прогулку. Проверь доступ к хранилищу браузера.');
    }
    setState(after);
  }, []);

  useEffect(() => {
    const pointer = () => {
      const nowLocked = document.pointerLockElement === canvas.current;
      setLocked(nowLocked);
      if (nowLocked) { begunRef.current = true; setMenu(null); setHasBegun(true); setInputError(''); }
      if (!nowLocked) { walking.current = false; setMenu(value => value === null ? 'pause' : value); }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.code === 'F3') { event.preventDefault(); setDiagnostics(value => !value); }
      if (event.code === 'Escape') setMenu(value => value === 'journal' ? 'pause' : value);
      if (event.code === 'KeyJ' && document.pointerLockElement === canvas.current) {
        event.preventDefault(); setMenu('journal'); document.exitPointerLock();
      }
    };
    const blur = () => { if (document.pointerLockElement) document.exitPointerLock(); };
    document.addEventListener('pointerlockchange', pointer);
    window.addEventListener('keydown', keyboard);
    window.addEventListener('blur', blur);
    return () => { document.removeEventListener('pointerlockchange', pointer); window.removeEventListener('keydown', keyboard); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => {
    enableAudio(settings.audio);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* game remains playable */ }
  }, [settings]);
  useEffect(() => {
    if (!hasBegun || lastSaveAttempt.current === state) return;
    lastSaveAttempt.current = state;
    if (!persistFPS(state)) setSaveError('Не удалось сохранить прогулку. Проверь доступ к хранилищу браузера.');
    else setSaveError('');
  }, [state, hasBegun]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 8500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (state.phase !== 'storm' || !active) return;
    const id = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [state.phase, active]);
  useEffect(() => {
    if (state.phase === 'storm' && remaining === 0) command({ type: 'finishStorm' });
    if (state.phase === 'storm' && (remaining === 16 || remaining === 8)) sound('thunder');
  }, [remaining, state.phase, command]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { if (walking.current) sound('step'); }, 420);
    return () => clearInterval(id);
  }, [active]);

  const resume = async () => {
    canvas.current = surface.current?.querySelector('canvas') ?? canvas.current;
    if (!canvas.current || !ready) return;
    unlockAudio(); setInputError('');
    try {
      canvas.current.focus({ preventScroll: true });
      await canvas.current.requestPointerLock();
      setLocked(document.pointerLockElement === canvas.current);
      if (document.pointerLockElement === canvas.current) { begunRef.current = true; setMenu(null); setHasBegun(true); }
      else setInputError('Нажми «Продолжить» ещё раз, чтобы включить обзор мышью.');
    } catch { setInputError('Браузер пока не захватил мышь. Переключись в окно игры и нажми кнопку ещё раз.'); }
  };
  const begin = () => {
    if (!loaded.state && !hasBegun) {
      const fresh = createFPSGame(name, color, state.seed);
      stateRef.current = fresh; setState(fresh);
    }
    void resume();
  };
  const restart = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    if (!clearFPS()) { setSaveError('Браузер не разрешил сброс сохранения. Прогресс оставлен без изменений.'); return; }
    const fresh = createFPSGame(name, color);
    stateRef.current = fresh; setState(fresh); setFocus(null); setToast(''); setRemaining(18);
    setSession(value => value + 1); setConfirmReset(false); setHasBegun(true); setSaveError('');
    setMenu('pause');
  };
  const reportPose = useCallback((pose: { position: Vec3; yaw: number; pitch: number; grounded?: boolean }) => {
    // Read-only test observability. No debug actions are exposed to the game UI.
    if (surface.current) { surface.current.dataset.playerPosition = JSON.stringify(pose.position); surface.current.dataset.playerRotation = JSON.stringify([pose.yaw, pose.pitch]); }
  }, []);

  return <main className="fps-app">
    <div className="world-surface" ref={surface} data-phase={state.phase} data-battery={state.batteryAt ?? 'none'} data-held={state.held ?? 'none'} data-supplies={state.deliveredSupplies} data-bridge={state.bridgeRepaired} data-pointer-locked={locked}>
      <SceneBoundary>
        <Canvas ref={canvas} tabIndex={0} shadows camera={{ fov: 70, near: .05, far: 180, position: [-14, 1.65, 15] }} dpr={[1, 1.6]} gl={{ antialias: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { canvas.current = gl.domElement; gl.domElement.setAttribute('aria-label', 'Трёхмерный район'); gl.domElement.tabIndex = 0; }}>
          <Suspense fallback={null}>
            <Physics timeStep={1 / 60} paused={!active} gravity={[0, -22, 0]}>
              <Neighborhood state={state} />
              <Controller key={session} state={state} active={active} sensitivity={settings.sensitivity} bob={settings.bob} onFocus={setFocus} onCommand={command} onMotion={value => { walking.current = value; }} onPose={reportPose} />
              <Ready onReady={setReady} />
              {diagnostics && <Diagnostics run={0} onSample={setMetrics} />}
            </Physics>
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>

    {menu !== 'start' && <div className={`game-hud ${menu ? 'hud-dim' : ''}`}>
      <div className="hud-top"><div className="brand"><House size={23} /><div><strong>Наш район<span>🌿</span></strong><small>{phaseNames[state.phase]}</small></div></div><span className="local-label">Локальная игра <i /> 3 бота</span></div>
      <div className="objective"><span className="objective-dot" /><p>{getObjective(state)}</p></div>
      {active && <><div className={`crosshair ${target?.canInteract ? 'crosshair-ready' : ''}`} /><div className="context-prompt" aria-live="polite">{target && <><kbd className={!target.canInteract ? 'inactive-key' : ''}>E</kbd><span>{target.label}</span></>}</div></>}
      {toast && <div className="world-toast" role="status">{toast}</div>}
      <div className="hud-bottom"><span className="movement-hints"><kbd>WASD</kbd> идти <b>·</b> <kbd>Shift</kbd> бежать <b>·</b> <kbd>Space</kbd> прыжок <b>·</b> <kbd>J</kbd> дневник</span><span className="carried-label">{state.held ? <><strong>{ITEM_NAMES[state.held]}</strong><span><kbd>Q</kbd> отпустить <kbd>G</kbd> бросить</span></> : <span><kbd>Esc</kbd> пауза</span>}</span></div>
      {saveError && <div className="save-warning">{saveError}</div>}
    </div>}

    {menu === 'start' && <div className="menu-backdrop start-backdrop"><section className="start-card">
      <div className="eyebrow"><Sun size={17} /> маленький район · большие решения</div>
      <h1>Наш район<span>🌿</span></h1>
      <p className="start-description">До вечера ещё есть время.<br />Принеси припасы домой и реши, кому нужнее единственный аккумулятор.</p>
      <div className="start-line"><Footprints size={19} /><span>Гуляй, переноси предметы, помогай соседям.</span></div>
      {!loaded.state && <div className="identity"><label>Твоё имя<input maxLength={22} value={name} onChange={event => setName(event.target.value)} placeholder="Сосед" /></label><div className="color-options" aria-label="Цвет рукавов">{['#e78064', '#54a9ae', '#8d78b4', '#e5b54b'].map(value => <button key={value} className={color === value ? 'selected' : ''} style={{ background: value }} aria-label={`Цвет ${value}`} aria-pressed={color === value} onClick={() => setColor(value)}>{color === value && <Check size={15} />}</button>)}</div></div>}
      {loaded.state?.legacyImported && <p className="fine-print">Прежняя история сохранена. Прогулка от первого лица — новый день подготовки.</p>}
      {loaded.error && <p className="inline-warning">{loaded.error} {loaded.error.includes('поврежден') && 'Начать новую можно через сброс в меню паузы.'}</p>}
      <button className="primary-button" onClick={begin} disabled={!ready}>{ready ? (loaded.state ? 'Вернуться в район' : 'Начать прогулку') : 'Открываем дверь…'}<ArrowRight size={20} /></button>
      {inputError && <p className="inline-warning">{inputError}</p>}
      <p className="fine-print">Клавиатура + мышь · около 8 минут · 3 местных бота<br />Нажатие включает обзор мышью. Esc — освободить курсор.</p>
    </section><div className="start-caption">День перед грозой<br /><span>Общий дом</span></div></div>}

    {menu === 'pause' && <div className="menu-backdrop"><section className="pause-card"><div className="eyebrow">Наш район · прогулка приостановлена</div><h2>Можно выдохнуть.</h2><p className="menu-subtitle">{state.phase === 'aftermath' ? outcome.title : 'Соседи подождут, пока ты вернёшься.'}</p>
      <button className="primary-button" onClick={() => void resume()}>Продолжить<ArrowRight size={20} /></button>
      {inputError && <p className="inline-warning">{inputError}</p>}
      <button className="secondary-button" onClick={() => setMenu('journal')}><BookOpen size={18} /> Дневник и личная цель</button>
      <div className="settings"><label htmlFor="sensitivity">Чувствительность мыши <b>{settings.sensitivity.toFixed(1)}</b></label><input id="sensitivity" type="range" min=".2" max="2" step=".1" value={settings.sensitivity} onChange={event => setSettings(value => ({ ...value, sensitivity: Number(event.target.value) }))} /><label className="toggle-row"><span><Footprints size={17} /> Лёгкое покачивание камеры</span><input type="checkbox" checked={settings.bob} onChange={event => setSettings(value => ({ ...value, bob: event.target.checked }))} /></label><label className="toggle-row"><span><Volume2 size={17} /> Звуки района</span><input type="checkbox" checked={settings.audio} onChange={event => setSettings(value => ({ ...value, audio: event.target.checked }))} /></label></div>
      <div className="controls-grid"><span><kbd>WASD</kbd> движение</span><span><kbd>Мышь</kbd> обзор</span><span><kbd>Shift</kbd> бег</span><span><kbd>Space</kbd> прыжок</span><span><kbd>E</kbd> взаимодействие</span><span><kbd>Q / G</kbd> отпустить / бросить</span><span><kbd>J</kbd> дневник</span><span><kbd>Esc</kbd> пауза</span></div>
      <button className="reset-button" onClick={restart}><RotateCcw size={15} />{confirmReset ? 'Да, начать новый день с начала' : 'Начать заново'}</button>{confirmReset && <button className="cancel-reset" onClick={() => setConfirmReset(false)}>Отмена</button>}
      {saveError && <p className="inline-warning">{saveError}</p>}
    </section></div>}

    {menu === 'journal' && <div className="menu-backdrop"><section className="journal-card"><header><div><div className="eyebrow">{phaseNames[state.phase]}</div><h2>Дневник соседа</h2></div><button className="icon-button" aria-label="Закрыть дневник" onClick={() => setMenu('pause')}><X size={23} /></button></header><div className="journal-scroll"><article className="personal-note"><span>Только для тебя</span><h3>Тёплая ночь</h3><p>{PERSONAL_NOTE}</p></article>
      {state.phase === 'aftermath' && <article className="outcome"><CloudRain size={24} /><h3>{outcome.title}</h3><p>{outcome.description}</p><ul>{outcome.highlights.map(text => <li key={text}>{text}</li>)}</ul><p className="personal-result">{outcome.personalText}</p></article>}
      <h3 className="journal-heading">Соседи · локальные боты</h3><div className="neighbors">{BOT.map(bot => <article key={bot.id}><span className="neighbor-avatar" style={{ background: bot.color }}>{bot.name[0]}</span><div><strong>{bot.name}</strong><p>{state.botReactions[bot.id]}</p></div></article>)}</div>
      <h3 className="journal-heading">Что произошло</h3><ol className="event-list">{state.history.map(entry => <li key={entry.id}>{entry.text}</li>)}</ol>
      {state.legacyImported && <details><summary>Архив прежней кампании · {state.base.history.length} записей</summary><p>Архив сохранён в состоянии игры. Новый физический сценарий использует отдельный журнал.</p></details>}
    </div><footer><button className="primary-button" onClick={() => void resume()}>Вернуться к прогулке<ArrowRight size={19} /></button></footer></section></div>}
    <div className="desktop-note">Для прогулки нужны клавиатура и мышь.</div>
    {diagnostics && <aside className="diagnostics-panel" aria-label="Диагностика производительности"><strong>Диагностика · F3 скрыть</strong><pre>{metrics ? JSON.stringify({ frameMs: metrics.frameMs, calls: metrics.drawCalls?.p50, triangles: metrics.triangles?.p50, cpuRenderMs: metrics.renderSubmitCpuMs?.p50, gpuMs: metrics.gpuMs?.p50, physicsMs: metrics.physicsStepCpuMs?.p95, geometry: metrics.geometries, saves: saveTelemetry }, null, 2) : 'Собираем кадры…'}</pre><small>FPS в фоновой вкладке может быть ограничен браузером.</small></aside>}
  </main>;
}

function Ready({ onReady }: { onReady: (ready: boolean) => void }) { useEffect(() => { onReady(true); return () => onReady(false); }, [onReady]); return null; }
