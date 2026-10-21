import { advanceDay, createGame, resolveDay } from "../game";
import type { GameState } from "../game";
import { SAVE_KEY as LEGACY_SAVE_KEY } from "../persistence";
import { applyCommand, createFPSGame, createFPSGameFromLegacy, isFinitePosition, ITEM_IDS, prepareFPSResume } from "./model";
import type { FPSState, TargetId } from "./model";

export const FPS_SAVE_KEY = "our-neighborhood-fps-v2";
export const SAVE_KEY = FPS_SAVE_KEY;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const MAX_LENGTH = 160_000;
const CORRUPT_SAVE = "Сохранение прогулки повреждено или несовместимо. Оно сохранено без изменений. Для новой игры используйте явный сброс.";
const STORAGE_ERROR = "Браузер не разрешает читать сохранение. Можно играть без автосохранения.";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equal(value, b[index]));
  return record(a) && record(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

/** Validate the archived campaign with its original reducer; never advance the actual archive. */
function validBase(value: unknown): value is GameState {
  if (!record(value) || value.version !== 1 || !record(value.player) || typeof value.player.name !== "string" || !value.player.name.trim() || value.player.name !== value.player.name.trim() || value.player.name.length > 24 || typeof value.player.color !== "string" || !/^#[\da-f]{6}$/i.test(value.player.color) || typeof value.seed !== "number" || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) return false;
  if (!Number.isInteger(value.day) || Number(value.day) < 1 || Number(value.day) > 3 || !["planning", "recap", "ended"].includes(String(value.phase)) || !record(value.promise) || !Array.isArray(value.history) || value.history.length > 3) return false;
  let expected = createGame(value.player.name, value.player.color, value.seed);
  for (let index = 0; index < value.history.length; index++) {
    const entry: unknown = value.history[index];
    if (!record(entry) || typeof entry.actionId !== "string" || entry.actionId.length > 40) return false;
    const resolved = resolveDay(expected, entry.actionId, index + 1, value.promise.madeDay === 1 && index === 0);
    if (resolved === expected) return false;
    expected = resolved;
    if (index < value.history.length - 1 || value.phase !== "recap") expected = advanceDay(expected);
  }
  return equal(value, expected);
}

function validFPS(value: unknown): value is FPSState {
  if (!record(value) || value.version !== 2 || !validBase(value.base) || !record(value.player) || value.player.name !== value.base.player.name || value.player.color !== value.base.player.color || value.seed !== value.base.seed || typeof value.legacyImported !== "boolean") return false;
  if (!["preparation", "storm", "aftermath"].includes(String(value.phase)) || typeof value.deliveredSupplies !== "boolean" || typeof value.bridgeRepaired !== "boolean" || ![null, "home", "shop"].includes(value.batteryAt as null | string) || ![null, ...ITEM_IDS].includes(value.held as null | typeof ITEM_IDS[number])) return false;
  if (!record(value.checkpoint) || !isFinitePosition(value.checkpoint.position) || typeof value.checkpoint.yaw !== "number" || !Number.isFinite(value.checkpoint.yaw) || typeof value.checkpoint.pitch !== "number" || !Number.isFinite(value.checkpoint.pitch) || Math.abs(value.checkpoint.pitch) > 1.5 || !record(value.items)) return false;
  for (const id of ITEM_IDS) {
    const item = value.items[id];
    if (!record(item) || !["world", "carried", "installed"].includes(String(item.status)) || !isFinitePosition(item.position)) return false;
    if ((item.status === "carried") !== (value.held === id)) return false;
    const installed = id === "crate" ? value.deliveredSupplies : id === "battery" ? value.batteryAt !== null : value.bridgeRepaired;
    if ((item.status === "installed") !== installed) return false;
  }
  if (!Array.isArray(value.history) || value.history.length > 32 || !record(value.botReactions)) return false;
  let expected = value.legacyImported ? createFPSGameFromLegacy(value.base) : createFPSGame(value.base.player.name, value.base.player.color, value.base.seed);
  if (!value.legacyImported && !equal(value.base, expected.base)) return false;
  const initialLength = expected.history.length;
  if (value.history.length < initialLength || !equal(value.history.slice(0, initialLength), expected.history)) return false;
  for (const entry of value.history.slice(initialLength)) {
    if (!record(entry) || typeof entry.id !== "string" || typeof entry.text !== "string") return false;
    const previousLength = expected.history.length;
    switch (entry.id) {
      case "supplies_delivered":
        expected = applyCommand(applyCommand(expected, { type: "pick", item: "crate" }), { type: "install", target: "home_supply" }); break;
      case "battery_home": case "battery_shop":
        expected = applyCommand(applyCommand(expected, { type: "pick", item: "battery" }), { type: "install", target: entry.id === "battery_home" ? "home_battery" : "shop_battery" }); break;
      case "bridge_repaired":
        expected = applyCommand(applyCommand(expected, { type: "pick", item: "boards" }), { type: "install", target: "bridge_repair" }); break;
      case "storm_started": expected = applyCommand(expected, { type: "startStorm" }); break;
      case "storm_finished": expected = applyCommand(expected, { type: "finishStorm" }); break;
      case "note_read": expected = applyCommand(expected, { type: "interact", target: "note" }); break;
      default: {
        const matched = /^talk_(nina|boris|mira)_(before|home|shop|after)$/.exec(entry.id);
        if (!matched) return false;
        expected = applyCommand(expected, { type: "interact", target: matched[1] as TargetId });
      }
    }
    if (expected.history.length !== previousLength + 1 || !equal(expected.history.at(-1), entry)) return false;
  }
  return expected.phase === value.phase && expected.deliveredSupplies === value.deliveredSupplies && expected.batteryAt === value.batteryAt && expected.bridgeRepaired === value.bridgeRepaired && equal(expected.botReactions, value.botReactions);
}

function parse<T>(raw: string, guard: (value: unknown) => value is T): T | null {
  if (raw.length > MAX_LENGTH) return null;
  try { const value: unknown = JSON.parse(raw); return guard(value) ? value : null; } catch { return null; }
}

export function loadFPS(storage?: StorageLike): { state: FPSState | null; error: string | null } {
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = target.getItem(FPS_SAVE_KEY);
    if (raw !== null) {
      const state = parse(raw, validFPS);
      return state ? { state: prepareFPSResume(state), error: null } : { state: null, error: CORRUPT_SAVE };
    }
    const previous = target.getItem(LEGACY_SAVE_KEY);
    if (previous === null) return { state: null, error: null };
    const base = parse(previous, validBase);
    return base ? { state: createFPSGameFromLegacy(base), error: null } : { state: null, error: "Прежнее сохранение не удалось импортировать. Оно оставлено без изменений; новая прогулка использует отдельное сохранение." };
  } catch { return { state: null, error: STORAGE_ERROR }; }
}

export function saveFPS(state: FPSState, storage?: StorageLike): boolean {
  try {
    const target = storage ?? globalThis.localStorage;
    const raw = JSON.stringify(state);
    if (!parse(raw, validFPS)) return false;
    const previous = target.getItem(FPS_SAVE_KEY);
    if (previous !== null && !parse(previous, validFPS)) return false;
    target.setItem(FPS_SAVE_KEY, raw);
    return true;
  } catch { return false; }
}

/** A new physical playthrough never deletes the archived three-day campaign. */
export function clearFPS(storage?: StorageLike): boolean {
  try { (storage ?? globalThis.localStorage).removeItem(FPS_SAVE_KEY); return true; } catch { return false; }
}
