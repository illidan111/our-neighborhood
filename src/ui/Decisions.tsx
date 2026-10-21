import { useState } from "react";
import { ArrowRight, Check, Info, X } from "lucide-react";
import { getActions, getDayBrief, type GameState } from "../game";
import { Cost, PlaceIcon } from "./Primitives";
export default function Decisions({
  state,
  onClose,
  onConfirm,
}: {
  state: GameState;
  onClose: () => void;
  onConfirm: (id: string, promise: boolean) => void;
}) {
  const actions = getActions(state);
  const [selected, setSelected] = useState<string | null>(null);
  const [promise, setPromise] = useState(false);
  const action = actions.find((a) => a.id === selected);
  const brief = getDayBrief(state);
  return (
    <section className="decision-sheet sheet" aria-label="Выбор действия">
      <div className="sheet-heading">
        <div>
          <span className="eyebrow">Ваш ход · день {state.day}</span>
          <h2>На всё вас не хватит.</h2>
          <p>Выберите одно дело. Остальное соседи решат сами.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Закрыть выбор"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="decision-options">
        {actions.map((a, i) => (
          <button
            key={a.id}
            className={`decision-option ${selected === a.id ? "selected" : ""}`}
            aria-pressed={selected === a.id}
            disabled={!!a.disabledReason}
            onClick={() => setSelected(a.id)}
          >
            <div className="option-top">
              <span className="option-number">0{i + 1}</span>
              <PlaceIcon id={a.location} />
              <span className="radio-mark">
                {selected === a.id && <Check size={13} />}
              </span>
            </div>
            <h3>{a.title}</h3>
            <p>{a.description}</p>
            <div className="option-bottom">
              <Cost {...a.cost} />
              {a.disabledReason && <small>{a.disabledReason}</small>}
            </div>
          </button>
        ))}
      </div>
      {action && (
        <div className="consequence">
          <Info size={17} />
          <span>{action.consequence}</span>
        </div>
      )}
      {state.day === 1 && brief.promiseOffer && (
        <label className="promise-check">
          <input
            type="checkbox"
            checked={promise}
            onChange={(e) => setPromise(e.target.checked)}
          />
          <span>
            <strong>Дать слово соседям</strong>
            {brief.promiseOffer}
          </span>
        </label>
      )}
      {state.promise.status === "pending" && (
        <p className="pending-promise">
          Вы обещали собрать общий резерв до грозы. Доставка или общий резерв
          выполнят обещание.
        </p>
      )}
      <div className="decision-footer">
        <span>Сначала ваш выбор, затем ходы трёх ботов.</span>
        <button
          className="button primary"
          disabled={!action || !!action.disabledReason}
          onClick={() => action && onConfirm(action.id, promise)}
        >
          Подтвердить ход <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
