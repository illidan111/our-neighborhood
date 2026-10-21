import { advanceDay, createGame, resolveDay, RESOURCE_LIMITS } from "./game";
import type { GameState } from "./game";

export const SAVE_KEY = "our-neighborhood-v1";
const MAX_SAVE_LENGTH = 80_000;
const CORRUPT_SAVE =
  "Сохранение повреждено или несовместимо. Оно сохранено без изменений. Начните новую игру и подтвердите сброс, чтобы продолжить.";
const STORAGE_UNAVAILABLE =
  "Браузер не разрешает читать сохранение. Проверьте настройки хранилища; пока можно играть без автосохранения.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerBetween(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameValue(item, b[i]))
    );
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  );
}

/** Replaying at most three days also validates event text, deltas and bot order. */
function isGameState(value: unknown): value is GameState {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !integerBetween(value.day, 1, 3)
  )
    return false;
  if (!["planning", "recap", "ended"].includes(String(value.phase)))
    return false;
  if (value.phase === "ended" && value.day !== 3) return false;
  if (!integerBetween(value.seed, 0, 0xffff_ffff)) return false;
  if (
    !isRecord(value.player) ||
    typeof value.player.name !== "string" ||
    value.player.name.length > 24 ||
    !value.player.name.trim() ||
    value.player.name !== value.player.name.trim()
  )
    return false;
  if (
    typeof value.player.color !== "string" ||
    !/^#[\da-f]{6}$/i.test(value.player.color)
  )
    return false;
  if (
    !isRecord(value.resources) ||
    !isRecord(value.world) ||
    !isRecord(value.promise)
  )
    return false;
  for (const key of ["budget", "supplies", "trust"] as const) {
    if (!integerBetween(value.resources[key], 0, RESOURCE_LIMITS[key]))
      return false;
  }
  for (const key of ["bridge", "home", "power", "shop"]) {
    if (!integerBetween(value.world[key], 0, 2)) return false;
  }
  if (!["sun", "cloud", "storm"].includes(String(value.world.weather)))
    return false;
  if (
    !["none", "pending", "fulfilled", "broken"].includes(
      String(value.promise.status),
    )
  )
    return false;
  if (!Array.isArray(value.history)) return false;
  const historyLength = value.phase === "planning" ? value.day - 1 : value.day;
  if (value.history.length !== historyLength) return false;

  let expected = createGame(value.player.name, value.player.color, value.seed);
  for (let i = 0; i < value.history.length; i++) {
    const history: unknown = value.history[i];
    if (
      !isRecord(history) ||
      history.day !== i + 1 ||
      typeof history.actionId !== "string" ||
      history.actionId.length > 40
    )
      return false;
    const resolved = resolveDay(
      expected,
      history.actionId,
      i + 1,
      value.promise.madeDay === 1 && i === 0,
    );
    if (resolved === expected) return false;
    expected = resolved;
    if (i < value.history.length - 1 || value.phase !== "recap")
      expected = advanceDay(expected);
  }
  return sameValue(expected, value);
}

function parseSave(raw: string): GameState | null {
  if (raw.length > MAX_SAVE_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isGameState(value) ? value : null;
  } catch {
    return null;
  }
}

export function loadGame(): { state: GameState | null; error: string | null } {
  try {
    const raw = globalThis.localStorage.getItem(SAVE_KEY);
    if (raw === null) return { state: null, error: null };
    const state = parseSave(raw);
    return state
      ? { state, error: null }
      : { state: null, error: CORRUPT_SAVE };
  } catch {
    return { state: null, error: STORAGE_UNAVAILABLE };
  }
}

export function saveGame(state: GameState): boolean {
  try {
    const raw = JSON.stringify(state);
    if (!raw || !parseSave(raw)) return false;
    const previous = globalThis.localStorage.getItem(SAVE_KEY);
    // A failed load must never be silently replaced by an autosave.
    if (previous !== null && !parseSave(previous)) return false;
    globalThis.localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearGame(): boolean {
  try {
    globalThis.localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
