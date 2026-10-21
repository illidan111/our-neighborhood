import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  CloudLightning,
  House,
  LockKeyhole,
  MapPin,
  Maximize,
  Menu,
  RotateCcw,
  Sun,
  Users,
  X,
} from "lucide-react";
import {
  advanceDay,
  createGame,
  getDayBrief,
  getLocationInfo,
  resolveDay,
  type GameState,
  type LocationId,
} from "./game";
import { clearGame, loadGame, saveGame } from "./persistence";
import { Modal, PlaceIcon, Resources, locations } from "./ui/Primitives";
import StartScreen from "./ui/StartScreen";
import Decisions from "./ui/Decisions";
import Neighbors from "./ui/Neighbors";
import { Ending, Episode } from "./ui/Episode";

const TownScene = lazy(() => import("./scene/TownScene"));
const demo = createGame("Саша", "#ee795e", 2973);
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("3D-сцена недоступна", error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <House size={60} />
        <p>
          Браузер не смог открыть 3D-карту.
          <br />
          Все места доступны в списке ниже; партия работает.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function App() {
  const [loaded] = useState(loadGame);
  const [state, setState] = useState<GameState | null>(loaded.state);
  const [started, setStarted] = useState(false);
  const [loadError, setLoadError] = useState(loaded.error);
  const [saved, setSaved] = useState(true);
  const [selected, setSelected] = useState<LocationId | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [secret, setSecret] = useState(false);
  const [people, setPeople] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reset, setReset] = useState(false);
  const [rules, setRules] = useState(false);
  const [mapAtEnd, setMapAtEnd] = useState(false);
  const game = state ?? demo;
  const brief = getDayBrief(game);
  const location = selected ? getLocationInfo(game, selected) : null;
  const stormResolved = game.day === 3 && game.phase !== "planning";
  const currentEvent = stormResolved
    ? (game.history.at(-1)?.entries.find((e) => e.actorId === "storm")?.text ??
      brief.event)
    : brief.event;
  useEffect(() => {
    if (state && started) setSaved(saveGame(state));
  }, [state, started]);
  useEffect(() => {
    setSecret(false);
    setSelected(null);
    setDeciding(false);
  }, [game.day]);
  const start = (name: string, color: string) => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    setState(createGame(name, color, seed));
    setStarted(true);
    setMapAtEnd(false);
  };
  const resetGame = () => {
    const cleared = clearGame();
    if (!cleared) {
      setLoadError(
        "Браузер не разрешил удалить сохранение. Разрешите локальное хранилище и попробуйте снова.",
      );
      setSaved(false);
      setReset(false);
      return;
    }
    setState(null);
    setStarted(false);
    setReset(false);
    setLoadError(null);
    setMenu(false);
    setSelected(null);
    setDeciding(false);
    setMapAtEnd(false);
  };
  const confirm = (id: string, promise: boolean) => {
    const expected = game.day;
    setState((current) =>
      current ? resolveDay(current, id, expected, promise) : current,
    );
    setDeciding(false);
    setSelected(null);
    setPeople(false);
  };
  const next = () => {
    setState((current) => (current ? advanceDay(current) : current));
    setSelected(null);
  };
  const choosePlace = (id: LocationId) => {
    setSelected((current) => (current === id ? null : id));
    setDeciding(false);
  };
  const showMain = started && state;
  return (
    <main
      className={`game-app ${showMain ? "is-playing" : "is-welcome"} weather-${game.world.weather} ${deciding ? "is-deciding" : ""}`}
    >
      <div className="world">
        <SceneBoundary>
          <Suspense
            fallback={
              <div className="scene-loading">
                <House size={34} />
                <span>Расставляем дома…</span>
              </div>
            }
          >
            <TownScene
              world={game.world}
              supplies={game.resources.supplies}
              privateSupplies={game.player.privateSupplies ?? 0}
              playerColor={game.player.color}
              selected={showMain ? selected : null}
              interactive={!!showMain}
              onSelect={(id) => showMain && choosePlace(id)}
            />
          </Suspense>
        </SceneBoundary>
      </div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <House size={27} strokeWidth={2.7} />
          </span>
          <div>
            <strong>
              Наш район<span className="brand-dot">.</span>
            </strong>
            <small>Маленький город. Большие последствия.</small>
          </div>
        </div>
        {showMain && (
          <div className="hud">
            <div className="day-indicator">
              {game.world.weather === "sun" ? (
                <Sun size={22} />
              ) : game.world.weather === "storm" ? (
                <CloudLightning size={22} />
              ) : (
                <Cloud size={22} />
              )}
              <span>
                День <strong>{game.day}</strong>
                <small> / 3</small>
              </span>
            </div>
            <Resources value={game.resources} />
          </div>
        )}
        <button
          className="icon-button menu-button"
          aria-label="Меню игры"
          onClick={() => setMenu(true)}
        >
          <Menu size={23} />
        </button>
      </header>
      {!showMain ? (
        <>
          <StartScreen
            onStart={start}
            onContinue={() => setStarted(true)}
            hasSave={!!state}
            error={loadError}
            onReset={() => setReset(true)}
          />
          <div className="welcome-caption">
            <span className="tiny-sun" />
            <p>Сегодня здесь ещё тихо.</p>
            <span>Завтра всё будет зависеть от вас.</span>
          </div>
        </>
      ) : (
        <>
          <div className="day-brief">
            <div className="brief-heading">
              <span className="weather-icon">
                {game.day === 1 ? (
                  <Cloud size={23} />
                ) : (
                  <CloudLightning size={23} />
                )}
              </span>
              <div>
                <span className="eyebrow">
                  {stormResolved
                    ? "Последствия наших решений"
                    : `До грозы · ${4 - game.day} ${game.day === 3 ? "день" : "дня"}`}
                </span>
                <h2>{stormResolved ? "После грозы" : brief.title}</h2>
              </div>
            </div>
            <p>{currentEvent}</p>
            <button
              className={`private-button ${secret ? "open" : ""}`}
              onClick={() => setSecret((s) => !s)}
              aria-expanded={secret}
            >
              <LockKeyhole size={15} />
              {secret ? "Личное сообщение" : "Вам кое-что известно"}
              <span>{secret ? "−" : "+"}</span>
            </button>
            {secret && <p className="private-intel">{brief.privateInfo}</p>}
          </div>
          <Neighbors
            state={game}
            mobileOpen={people}
            onClose={() => setPeople(false)}
          />
          <div className="map-tools">
            <button
              className="icon-button"
              aria-label="Общий вид карты"
              onClick={() => setSelected(null)}
            >
              <Maximize size={19} />
            </button>
            <span>{selected ? "Место выбрано" : "Рассмотрите район"}</span>
          </div>
          {selected && location && !deciding && game.phase !== "recap" && (
            <section className="location-panel sheet">
              <div className="location-heading">
                <span className="place-icon">
                  <PlaceIcon id={selected} />
                </span>
                <div>
                  <h2>{location.title}</h2>
                  <span className={`location-status level-${location.level}`}>
                    {location.status}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Закрыть место"
                  onClick={() => setSelected(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <p>{location.description}</p>
              {game.phase === "planning" && (
                <button
                  className="text-button"
                  onClick={() => {
                    setDeciding(true);
                    setSelected(null);
                  }}
                >
                  Обсудить сегодняшние дела <ArrowRight size={17} />
                </button>
              )}
            </section>
          )}
          <nav className="location-nav" aria-label="Места района">
            {locations.map((l) => (
              <button
                key={l.id}
                aria-label={l.name}
                title={l.name}
                aria-pressed={selected === l.id}
                className={selected === l.id ? "active" : ""}
                onClick={() => choosePlace(l.id)}
              >
                <PlaceIcon id={l.id} size={17} />
                <span>{l.name}</span>
              </button>
            ))}
          </nav>
          {game.phase === "planning" && !deciding && (
            <div className="task-dock sheet">
              <div className="task-icon">
                <MapPin size={30} />
              </div>
              <div className="task-copy">
                <span className="eyebrow">Сегодня вы решаете</span>
                <h2>{brief.task}</h2>
                <span>Одно дело на день. У каждого свой план.</span>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setDeciding(true);
                  setSelected(null);
                  setPeople(false);
                }}
              >
                Выбрать действие <ArrowRight size={19} />
              </button>
            </div>
          )}
          {deciding && game.phase === "planning" && (
            <Decisions
              key={game.day}
              state={game}
              onClose={() => setDeciding(false)}
              onConfirm={confirm}
            />
          )}
          {game.phase === "recap" && (
            <Episode key={game.day} state={game} onNext={next} />
          )}
          {game.phase === "ended" && !mapAtEnd && (
            <Ending
              state={game}
              onNew={() => setReset(true)}
              onMap={() => setMapAtEnd(true)}
            />
          )}
          {game.phase === "ended" && mapAtEnd && (
            <div className="task-dock sheet">
              <div className="task-copy">
                <span className="eyebrow">После грозы</span>
                <h2>Вот что осталось после наших решений.</h2>
              </div>
              <button
                className="button primary"
                onClick={() => setMapAtEnd(false)}
              >
                Вернуться к финалу <ArrowLeft size={18} />
              </button>
            </div>
          )}
          <footer className="game-footer">
            <span className={saved ? "save-status" : "save-status error"}>
              {saved ? <Check size={13} /> : <Cloud size={13} />}
              <span>
                {saved
                  ? "Сохранено на этом устройстве"
                  : "Автосохранение недоступно"}
              </span>
            </span>
            <button
              className="mobile-people text-button"
              onClick={() => {
                setPeople((p) => !p);
                setDeciding(false);
                setSelected(null);
              }}
            >
              <Users size={17} />
              Соседи и цель
            </button>
            <span className="footer-chapter">История 01 / До грозы</span>
          </footer>
        </>
      )}
      {menu && (
        <Modal
          title="Меню игры"
          onClose={() => setMenu(false)}
          className="menu-modal"
        >
          <span className="eyebrow">Наш район</span>
          <h2>Сделаем передышку?</h2>
          <p>Время здесь идёт только после вашего хода.</p>
          <button className="button primary" onClick={() => setMenu(false)}>
            Вернуться в район <ArrowRight size={18} />
          </button>
          <button
            className="button secondary"
            onClick={() => {
              setMenu(false);
              setRules(true);
            }}
          >
            Как всё устроено
          </button>
          {state && (
            <button
              className="text-button"
              onClick={() => {
                setMenu(false);
                setReset(true);
              }}
            >
              <RotateCcw size={16} />
              Новая партия
            </button>
          )}
          <small>Локальное демо · 1 человек и 3 бота</small>
        </Modal>
      )}
      {rules && (
        <Modal
          title="Правила района"
          onClose={() => setRules(false)}
          className="rules-modal"
        >
          <span className="eyebrow">Пара минут на знакомство</span>
          <h2>У каждого свой план.</h2>
          <p>
            В день можно сделать одно дело. Сначала выполняется ваш выбор, затем
            — ходы Нины, Бориса и Миры. Порядок ботов меняется каждый день и
            зависит от seed партии.
          </p>
          <p>
            Все тратят общий бюджет и запасы. Если боту не хватает ресурсов, он
            выбирает бесплатный запасной вариант; несостоявшийся ремонт не
            оплачивается.
          </p>
          <p>
            Исследуйте места и спросите соседей о планах. Личное сообщение
            доступно только вам. Боты учитывают общие ресурсы и собственные
            приоритеты.
          </p>
          <p>
            <strong>Общая победа:</strong> мост и электростанция уровня 2,
            минимум 3 ящика после грозы и доверие от 4. Два или три условия —
            победа с потерями; меньше двух — провал.
          </p>
          <p>
            <strong>Личная цель:</strong> дом уровня 2 и хотя бы один общий или
            личный ящик после грозы. Личный запас помогает вам, но изымается из
            общего. Обещанный резерв нужно собрать доставкой во второй день или
            на площади в третий. За нарушение доверие уменьшается на 3.
          </p>
          <button className="button primary" onClick={() => setRules(false)}>
            Всё, я к соседям <ArrowRight size={18} />
          </button>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Начать новую партию?"
          onClose={() => setReset(false)}
          className="reset-modal"
        >
          <span className="reset-symbol">
            <RotateCcw size={27} />
          </span>
          <h2>Начать с чистого листа?</h2>
          <p>
            Текущая партия и история решений будут удалены с этого устройства.
            Новый район начнёт с первого дня.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setReset(false)}
            >
              Оставить партию
            </button>
            <button className="button primary" onClick={resetGame}>
              Начать заново
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
