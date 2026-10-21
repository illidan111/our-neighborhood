import { useEffect, useRef, type ReactNode } from "react";
import {
  House,
  Store,
  Zap,
  Flag,
  Waypoints,
  X,
  Coins,
  Package,
  HeartHandshake,
} from "lucide-react";
import type { LocationId } from "../game";

export const locations: { id: LocationId; name: string }[] = [
  { id: "home", name: "Общий дом" },
  { id: "shop", name: "Магазин" },
  { id: "power", name: "Электростанция" },
  { id: "square", name: "Площадь" },
  { id: "bridge", name: "Мост" },
];
export const colors = [
  { name: "Коралл", value: "#ee795e" },
  { name: "Бирюза", value: "#459d96" },
  { name: "Солнечный", value: "#e8b84e" },
  { name: "Лаванда", value: "#9d8bc2" },
];
export function PlaceIcon({
  id,
  size = 20,
}: {
  id: LocationId;
  size?: number;
}) {
  const Icon = {
    home: House,
    shop: Store,
    power: Zap,
    square: Flag,
    bridge: Waypoints,
  }[id];
  return <Icon size={size} />;
}
export function Avatar({
  color,
  kind = "you",
  small = false,
}: {
  color: string;
  kind?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${kind} ${small ? "avatar-small" : ""}`}
      style={{ "--avatar-color": color } as React.CSSProperties}
    >
      <span className="avatar-body" />
      <span className="avatar-head">
        <i />
        <i />
      </span>
      <span className="avatar-hat" />
    </span>
  );
}
export function Cost({
  budget,
  supplies,
}: {
  budget: number;
  supplies: number;
}) {
  return (
    <span className="cost">
      {budget === 0 && supplies === 0 ? (
        <span>Без затрат</span>
      ) : (
        <>
          {budget > 0 && (
            <span>
              <Coins size={14} />
              {budget}
            </span>
          )}
          {supplies > 0 && (
            <span>
              <Package size={14} />
              {supplies}
            </span>
          )}
        </>
      )}
    </span>
  );
}
export function Resources({
  value,
  compact = false,
}: {
  value: { budget: number; supplies: number; trust: number };
  compact?: boolean;
}) {
  return (
    <div className={`resources ${compact ? "compact" : ""}`}>
      {(
        [
          { key: "budget", label: "Бюджет", icon: Coins },
          { key: "supplies", label: "Запасы", icon: Package },
          { key: "trust", label: "Доверие", icon: HeartHandshake },
        ] as const
      ).map(({ key, label, icon: Icon }) => (
        <div
          className={`resource resource-${key}`}
          key={key}
          role="group"
          aria-label={`${label}: ${value[key]}${key === "trust" ? "/10" : ""}`}
          title={label}
        >
          <Icon size={20} />
          <span>{label}</span>
          <strong>
            {value[key]}
            {key === "trust" && <small>/10</small>}
          </strong>
        </div>
      ))}
    </div>
  );
}
export function Modal({
  children,
  title,
  onClose,
  className = "",
}: {
  children: ReactNode;
  title: string;
  onClose?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
      if (e.key === "Tab" && el) {
        const items = el.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, [tabindex="0"]',
        );
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-shade" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            className="icon-button close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
