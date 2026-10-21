import { useState } from "react";
import { ArrowRight, CloudSun, RotateCcw, ShieldCheck } from "lucide-react";
import { Avatar, colors } from "./Primitives";
export default function StartScreen({
  onStart,
  onContinue,
  hasSave,
  error,
  onReset,
}: {
  onStart: (name: string, color: string) => void;
  onContinue: () => void;
  hasSave: boolean;
  error: string | null;
  onReset: () => void;
}) {
  const [name, setName] = useState("Саша");
  const [color, setColor] = useState(colors[0].value);
  return (
    <section className="start-panel">
      <div className="chapter">
        <CloudSun size={20} />
        История первая
      </div>
      <h1>
        До грозы<span>три дня.</span>
      </h1>
      <p className="start-intro">
        Один район. Четыре соседа.
        <br />И немного разных планов на спасение.
      </p>
      <p className="start-description">
        Подготовьте город к грозе. Решайте, кому помочь, держите обещания — и
        узнайте, что соседи натворили без вас.
      </p>
      {error && (
        <div className="save-error" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={onReset}>
            Сбросить сохранение
          </button>
        </div>
      )}
      {hasSave ? (
        <>
          <button className="button primary start-button" onClick={onContinue}>
            Продолжить историю <ArrowRight size={20} />
          </button>
          <button className="text-button new-start" onClick={onReset}>
            <RotateCcw size={15} /> Начать заново
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onStart(name.trim() || "Саша", color);
          }}
        >
          <div className="identity">
            <Avatar color={color} />
            <label>
              Как вас зовут?
              <input
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                aria-label="Ваше имя"
                autoComplete="off"
              />
            </label>
          </div>
          <fieldset className="color-options">
            <legend>Цвет вашего персонажа</legend>
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`color-choice ${c.value === color ? "active" : ""}`}
                style={{ background: c.value }}
                aria-label={c.name}
                aria-pressed={color === c.value}
                onClick={() => setColor(c.value)}
              >
                {c.value === color ? "✓" : ""}
              </button>
            ))}
          </fieldset>
          <button type="submit" className="button primary start-button">
            {error ? "Играть без сохранения" : "Начать историю"}{" "}
            <ArrowRight size={20} />
          </button>
        </form>
      )}
      <div className="demo-note">
        <ShieldCheck size={16} />
        <span>
          Локальное демо · вы и 3 сценарных бота
          <br />
          <small>Без регистрации. Прогресс хранится в браузере.</small>
        </span>
      </div>
    </section>
  );
}
