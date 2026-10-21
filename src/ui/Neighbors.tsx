import { useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  Heart,
  MessageCircle,
  Users,
  X,
} from "lucide-react";
import { getBotPlan, type GameState } from "../game";
import { Avatar } from "./Primitives";
const neighbors = [
  {
    id: "nina",
    name: "Нина",
    color: "#e8b84e",
    trait: "Сначала безопасность",
    kind: "nina",
  },
  {
    id: "boris",
    name: "Борис",
    color: "#9d8bc2",
    trait: "У него свой интерес",
    kind: "boris",
  },
  {
    id: "mira",
    name: "Мира",
    color: "#459d96",
    trait: "Вместе разберёмся",
    kind: "mira",
  },
];
function getTalk(id: string, state: GameState) {
  return state.phase === "planning"
    ? getBotPlan(state, id)
    : (state.history.at(-1)?.entries.find((e) => e.actorId === id)?.text ??
        getBotPlan(state, id));
}
export default function Neighbors({
  state,
  mobileOpen,
  onClose,
}: {
  state: GameState;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"people" | "goal" | "journal">("people");
  const [talk, setTalk] = useState<string | null>(null);
  return (
    <aside
      className={`neighbors-panel ${mobileOpen ? "mobile-open" : ""}`}
      aria-label="Район и соседи"
    >
      <div className="neighbors-title">
        <h2>Наши люди</h2>
        <button
          className="icon-button mobile-close"
          aria-label="Закрыть соседей"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <span className="people-count">4</span>
      </div>
      <div className="side-tabs">
        <button
          className={tab === "people" ? "active" : ""}
          onClick={() => setTab("people")}
          aria-label="Участники"
        >
          <Users size={16} />
        </button>
        <button
          className={tab === "goal" ? "active" : ""}
          onClick={() => setTab("goal")}
          aria-label="Личная цель"
        >
          <Heart size={16} />
        </button>
        <button
          className={tab === "journal" ? "active" : ""}
          onClick={() => setTab("journal")}
          aria-label="Журнал событий"
        >
          <ClipboardList size={16} />
        </button>
        <span>
          {tab === "people"
            ? "Соседи"
            : tab === "goal"
              ? "Ваша цель"
              : "Что произошло"}
        </span>
      </div>
      {tab === "people" ? (
        <>
          <div className="neighbor-row player-row">
            <Avatar color={state.player.color} small />
            <div>
              <strong>
                {state.player.name} <em>ВЫ</em>
              </strong>
              <small>За дом и за своих</small>
            </div>
          </div>
          {neighbors.map((n) => (
            <div key={n.id}>
              <button
                className={`neighbor-row ${talk === n.id ? "talking" : ""}`}
                onClick={() => setTalk(talk === n.id ? null : n.id)}
                aria-expanded={talk === n.id}
              >
                <Avatar color={n.color} kind={n.kind} small />
                <div>
                  <strong>
                    {n.name} <em>БОТ</em>
                  </strong>
                  <small>{n.trait}</small>
                </div>
                <ChevronRight size={15} />
              </button>
              {talk === n.id && (
                <p className="neighbor-talk">{getTalk(n.id, state)}</p>
              )}
            </div>
          ))}
          <div className="local-note">
            <span />
            Локальная партия
          </div>
        </>
      ) : tab === "goal" ? (
        <div className="goal-content">
          <Heart className="goal-icon" size={25} />
          <h3>Чтобы дома было сухо.</h3>
          <p>
            Обеспечьте полную защиту общего дома и сохраните хотя бы один общий
            или личный ящик после грозы.
          </p>
          <div className="goal-progress">
            <span>Защита дома</span>
            <strong>{state.world.home}/2</strong>
          </div>
          <div className="progress-track">
            <i style={{ width: `${state.world.home * 50}%` }} />
          </div>
          <div className="goal-progress">
            <span>Личный резерв</span>
            <strong>{state.player.privateSupplies ?? 0} ящ.</strong>
          </div>
          <p className="goal-aside">
            Можно спасти свой дом и всё равно подвести район. И наоборот.
          </p>
          {state.promise.status !== "none" && (
            <p className="promise-state">
              {state.promise.status === "pending"
                ? "Обещание: собрать резерв до грозы."
                : state.promise.status === "fulfilled"
                  ? "Слово сдержано. Соседи это запомнят."
                  : "Обещание нарушено. Доверие −3."}
            </p>
          )}
        </div>
      ) : (
        <div className="journal-content">
          {state.history.length === 0 ? (
            <p>
              Пока здесь тихо. Выберите первое дело — к вечеру будет что
              обсудить.
            </p>
          ) : (
            state.history.map((day) => (
              <details key={day.day} open={day.day === state.day}>
                <summary>День {day.day}</summary>
                {day.entries.map((entry, i) => (
                  <p key={i}>
                    <strong>{entry.actor}</strong>
                    {entry.text}
                  </p>
                ))}
              </details>
            ))
          )}
        </div>
      )}
      <div className="sidebar-tip">
        <MessageCircle size={14} />
        <span>Нажмите на соседа, чтобы узнать его планы.</span>
      </div>
    </aside>
  );
}
