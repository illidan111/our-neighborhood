import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceDay, createGame, getActions, resolveDay } from "./game";
import type { GameState } from "./game";
import { clearGame, loadGame, SAVE_KEY, saveGame } from "./persistence";

let storage: Map<string, string>;
let mockStorage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  storage = new Map();
  mockStorage = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
  };
  vi.stubGlobal("localStorage", mockStorage);
});

afterEach(() => vi.unstubAllGlobals());

function freshGame(): GameState {
  return createGame("Саша", "#e78064", 42);
}

describe("local saves", () => {
  it("reports an empty slot without an error", () => {
    expect(loadGame()).toEqual({ state: null, error: null });
  });

  it("round-trips planning, recap and the final state without applying events twice", () => {
    let state = freshGame();
    while (state.phase !== "ended") {
      expect(saveGame(state)).toBe(true);
      expect(loadGame()).toEqual({ state, error: null });
      state =
        state.phase === "recap"
          ? advanceDay(state)
          : resolveDay(
              state,
              getActions(state).find((action) => !action.disabledReason)!.id,
              state.day,
              state.day === 1,
            );
    }
    expect(saveGame(state)).toBe(true);
    expect(loadGame()).toEqual({ state, error: null });
  });

  it("preserves corrupt data until an explicit reset", () => {
    storage.set(SAVE_KEY, "{broken json");
    expect(loadGame().error).toMatch(/сброс/);
    expect(saveGame(freshGame())).toBe(false);
    expect(storage.get(SAVE_KEY)).toBe("{broken json");
    expect(clearGame()).toBe(true);
    expect(saveGame(freshGame())).toBe(true);
  });

  it.each([
    [
      "negative supplies",
      (state: GameState) => {
        state.resources.supplies = -1;
      },
    ],
    [
      "non-finite budget",
      (state: GameState) => {
        state.resources.budget = Infinity;
      },
    ],
    [
      "fractional trust",
      (state: GameState) => {
        state.resources.trust = 3.5;
      },
    ],
    [
      "resource overflow",
      (state: GameState) => {
        state.resources.budget = 31;
      },
    ],
    [
      "invalid level",
      (state: GameState) => {
        state.world.home = 3;
      },
    ],
    [
      "missing history",
      (state: GameState) => {
        state.day = 2;
      },
    ],
    [
      "premature ending",
      (state: GameState) => {
        state.phase = "ended";
      },
    ],
    [
      "negative seed",
      (state: GameState) => {
        state.seed = -1;
      },
    ],
    [
      "invalid color",
      (state: GameState) => {
        state.player.color = "url(bad)";
      },
    ],
    [
      "overlong name",
      (state: GameState) => {
        state.player.name = "a".repeat(25);
      },
    ],
    [
      "impossible promise",
      (state: GameState) => {
        state.promise = { status: "fulfilled", madeDay: 1, resolvedDay: 1 };
      },
    ],
    [
      "inconsistent supplies",
      (state: GameState) => {
        state.resources.supplies = 9;
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const invalid = freshGame();
    mutate(invalid);
    const raw = JSON.stringify(invalid);
    storage.set(SAVE_KEY, raw);
    expect(loadGame().state).toBeNull();
    expect(loadGame().error).toBeTruthy();
    expect(saveGame(invalid)).toBe(false);
    expect(storage.get(SAVE_KEY)).toBe(raw);
  });

  it("rejects fabricated history even when totals look plausible", () => {
    const state = resolveDay(freshGame(), "bridge_repair", 1);
    state.history[0].entries[0].text =
      "Мост не починили, а цифры почему-то говорят обратное.";
    storage.set(SAVE_KEY, JSON.stringify(state));
    expect(loadGame().state).toBeNull();
    expect(loadGame().error).toBeTruthy();
  });

  it("accepts reordered object keys and both promise outcomes", () => {
    for (const secondAction of ["delivery", "private_pantry"]) {
      let state = resolveDay(freshGame(), "bridge_repair", 1, true);
      state = advanceDay(state);
      state = resolveDay(state, secondAction, 2);
      state = advanceDay(state);
      const lastAction = getActions(state).find(
        (action) => action.id !== "community_reserve" && !action.disabledReason,
      )!;
      state = advanceDay(resolveDay(state, lastAction.id, 3));
      const reordered = Object.fromEntries(Object.entries(state).reverse());
      storage.set(SAVE_KEY, JSON.stringify(reordered));
      expect(loadGame()).toEqual({ state, error: null });
    }
  });

  it("reports unavailable storage without crashing or deleting progress", () => {
    mockStorage.getItem.mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    mockStorage.removeItem.mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(loadGame().error).toMatch(/Браузер/);
    expect(saveGame(freshGame())).toBe(false);
    expect(clearGame()).toBe(false);
  });

  it("keeps the previous save if a write exceeds browser quota", () => {
    const initial = freshGame();
    expect(saveGame(initial)).toBe(true);
    mockStorage.setItem.mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    expect(saveGame(resolveDay(initial, "bridge_repair", 1))).toBe(false);
    expect(loadGame()).toEqual({ state: initial, error: null });
  });
});
