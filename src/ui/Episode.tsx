import { useState } from "react";
import {
  ArrowRight,
  Check,
  CloudLightning,
  Moon,
  Sparkles,
} from "lucide-react";
import { getEnding, type GameState } from "../game";
import { Resources } from "./Primitives";
export function Episode({
  state,
  onNext,
}: {
  state: GameState;
  onNext: () => void;
}) {
  const day = state.history[state.history.length - 1];
  const [step, setStep] = useState(0);
  if (!day) return null;
  const entry = day.entries[step];
  const last = step >= day.entries.length - 1;
  return (
    <section className="episode sheet" aria-label="Итоги дня">
      <div className="episode-heading">
        <span className="night-icon">
          {state.day === 3 ? <CloudLightning size={24} /> : <Moon size={24} />}
        </span>
        <div>
          <span className="eyebrow">Пока вы были заняты</span>
          <h2>{state.day === 3 ? "Гроза пришла." : "Вечер в нашем районе."}</h2>
        </div>
        <span className="episode-count">
          {step + 1} / {day.entries.length}
        </span>
      </div>
      <div className="episode-dots">
        {day.entries.map((_, i) => (
          <button
            key={i}
            aria-label={`Событие ${i + 1}`}
            className={i === step ? "active" : i < step ? "read" : ""}
            onClick={() => setStep(i)}
          />
        ))}
      </div>
      {entry && (
        <div className="episode-story" key={`${state.day}-${step}`}>
          <span className="eyebrow">{entry.actor}</span>
          <p>{entry.text}</p>
        </div>
      )}
      <div className="episode-bottom">
        <Resources value={state.resources} compact />
        {last ? (
          <button className="button primary" onClick={onNext}>
            {state.day === 3
              ? "Узнать, чем всё закончилось"
              : "Наступает следующий день"}
            <ArrowRight size={18} />
          </button>
        ) : (
          <button
            className="button primary"
            onClick={() => setStep((s) => s + 1)}
          >
            А что ещё? <ArrowRight size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
export function Ending({
  state,
  onNew,
  onMap,
}: {
  state: GameState;
  onNew: () => void;
  onMap: () => void;
}) {
  const ending = getEnding(state);
  if (!ending) return null;
  return (
    <section
      className={`ending-panel sheet ending-${ending.kind}`}
      aria-label="Финал"
    >
      <div className="ending-icon">
        {ending.kind === "success" ? (
          <Sparkles size={34} />
        ) : (
          <CloudLightning size={34} />
        )}
      </div>
      <span className="eyebrow">Три дня, которые всё решили</span>
      <h1>{ending.title}</h1>
      <p className="ending-description">{ending.description}</p>
      <div
        className={`personal-result ${ending.personalSuccess ? "fulfilled" : ""}`}
      >
        <span>
          {ending.personalSuccess ? <Check size={23} /> : <span>♡</span>}
        </span>
        <div>
          <strong>
            {ending.personalSuccess
              ? "Личная цель выполнена"
              : "Личная цель не выполнена"}
          </strong>
          <p>{ending.personalText}</p>
        </div>
      </div>
      <ul className="ending-facts">
        {ending.highlights.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
      <div className="ending-actions">
        <button className="button primary" onClick={onNew}>
          А если по-другому? <ArrowRight size={18} />
        </button>
        <button className="text-button" onClick={onMap}>
          Посмотреть район
        </button>
      </div>
      <p className="seed-note">
        Seed партии: {state.seed} · 1 человек + 3 бота
      </p>
    </section>
  );
}
