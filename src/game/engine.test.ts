import { describe, expect, it } from "vitest";
import {
  advanceDay,
  BOT,
  createGame,
  getActions,
  getDayBrief,
  getEnding,
  resolveDay,
} from "./engine";
import type { GameState } from "./types";

function play(state: GameState, actionId: string, promise = false): GameState {
  const resolved = resolveDay(state, actionId, state.day, promise);
  expect(resolved).not.toBe(state);
  return advanceDay(resolved);
}

function allEndings(seed: number): GameState[] {
  const outcomes: GameState[] = [];
  function visit(state: GameState, makePromise: boolean) {
    if (state.phase === "ended") {
      outcomes.push(state);
      return;
    }
    const actions = getActions(state).filter(
      (action) => !action.disabledReason,
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      visit(
        advanceDay(resolveDay(state, action.id, state.day, makePromise)),
        makePromise,
      );
    }
  }
  visit(createGame("Тест", "#e56b56", seed), false);
  visit(createGame("Тест", "#e56b56", seed), true);
  return outcomes;
}

describe("three-day game engine", () => {
  it("charges the real selected action once, applies bots in announced rotating order, and leaves the source immutable", () => {
    const initial = createGame("Саша", "#e56b56", 0);
    const source = JSON.stringify(initial);
    const next = resolveDay(initial, "bridge_repair", 1);
    expect(JSON.stringify(initial)).toBe(source);
    expect(next.phase).toBe("recap");
    expect(next.world.bridge).toBe(2);
    expect(next.history[0].entries[0].resourceDelta).toEqual({
      budget: -4,
      supplies: -2,
      trust: 1,
    });
    expect(next.history[0].entries.map((entry) => entry.actorId)).toEqual([
      "player",
      ...BOT.map((bot) => bot.id),
    ]);
    expect(next.resources).toEqual({ budget: 3, supplies: 3, trust: 6 });
    const dayTwo = play(advanceDay(next), "delivery");
    expect(
      dayTwo.history[1].entries
        .filter((entry) => BOT.some((bot) => bot.id === entry.actorId))
        .map((entry) => entry.actorId),
    ).toEqual(["boris", "mira", "nina"]);
  });

  it("does not charge unavailable actions or stale submissions, and provides an affordable fallback", () => {
    const state = createGame("Тест", "#e56b56", 1);
    state.resources.budget = 0;
    state.resources.supplies = 0;
    expect(
      getActions(state).find((action) => action.id === "bridge_repair")
        ?.disabledReason,
    ).toBeTruthy();
    expect(resolveDay(state, "bridge_repair", 1)).toBe(state);
    expect(resolveDay(state, "missing", 1)).toBe(state);
    expect(resolveDay(state, "fundraise", 2)).toBe(state);
    const funded = resolveDay(state, "fundraise", 1);
    expect(funded).not.toBe(state);
    expect(Object.values(funded.resources).every((value) => value >= 0)).toBe(
      true,
    );
    expect(
      funded.history[0].entries.some((entry) =>
        entry.text.includes("не хватило ресурсов"),
      ),
    ).toBe(true);
  });

  it("preserves recaps across serialization and prevents repeated resolve or advance", () => {
    const state = createGame("Тест", "#e56b56", 2);
    const recap = resolveDay(state, "fundraise", 1, true);
    const restored = JSON.parse(JSON.stringify(recap)) as GameState;
    expect(resolveDay(restored, "fundraise", 1, true)).toBe(restored);
    const dayTwo = advanceDay(restored);
    expect(dayTwo.day).toBe(2);
    expect(dayTwo.history).toHaveLength(1);
    expect(dayTwo.resources.supplies).toBe(recap.resources.supplies - 1);
    expect(advanceDay(dayTwo)).toBe(dayTwo);
    expect(resolveDay(dayTwo, "fundraise", 1)).toBe(dayTwo);
  });

  it("opens delivery only after a bridge repair and reveals day-specific private information", () => {
    const state = createGame("Тест", "#e56b56", 0);
    expect(getDayBrief(state).privateInfo).not.toContain("Водитель");
    expect(getDayBrief(state).promiseOffer).toBeTruthy();
    const repaired = play(state, "bridge_repair");
    const unrepaired = play(state, "home_seal");
    expect(getActions(repaired).map((action) => action.id)).toContain(
      "delivery",
    );
    expect(getActions(unrepaired).map((action) => action.id)).toContain(
      "footpath",
    );
    expect(getDayBrief(repaired).promiseOffer).toBeUndefined();
    expect(getDayBrief(repaired).privateInfo).toContain("пять ящиков");
    expect(getActions(repaired)).toHaveLength(3);
    expect(getActions(unrepaired)).toHaveLength(3);
  });

  it("fulfills explicit promises only through an actual reserve action and penalizes broken promises once", () => {
    let fulfilled = play(
      createGame("Тест", "#e56b56", 0),
      "bridge_repair",
      true,
    );
    expect(fulfilled.promise.status).toBe("pending");
    fulfilled = play(fulfilled, "delivery");
    expect(fulfilled.promise).toMatchObject({
      status: "fulfilled",
      madeDay: 1,
      resolvedDay: 2,
    });
    const broken = allEndings(0).find(
      (state) => state.promise.status === "broken",
    );
    expect(broken).toBeDefined();
    const penalty = broken!.history[2].entries.find(
      (entry) => entry.actorId === "promise",
    );
    expect(penalty?.resourceDelta.trust).toBe(-3);
    expect(resolveDay(broken!, "community_reserve", 3)).toBe(broken);
    expect(advanceDay(broken!)).toBe(broken);
  });

  it("has three reachable endings for every bot order and keeps all transitions and history consistent", () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const results = allEndings(seed);
      expect(new Set(results.map((state) => getEnding(state)?.kind))).toEqual(
        new Set(["success", "mixed", "failure"]),
      );
      expect(results.some((state) => getEnding(state)?.personalSuccess)).toBe(
        true,
      );
      expect(results.some((state) => !getEnding(state)?.personalSuccess)).toBe(
        true,
      );
      for (const state of results) {
        expect(state.day).toBe(3);
        expect(state.history).toHaveLength(3);
        expect(state.world.weather).toBe("cloud");
        expect(state.resources.budget).toBeGreaterThanOrEqual(0);
        expect(state.resources.supplies).toBeGreaterThanOrEqual(0);
        expect(state.resources.trust).toBeGreaterThanOrEqual(0);
        expect(state.resources.trust).toBeLessThanOrEqual(10);
        for (const history of state.history) {
          // The only event supply changes are day 2's gust and day 3's power outage.
          for (const key of ["budget", "trust"] as const) {
            expect(
              history.before[key] +
                history.entries.reduce(
                  (sum, entry) => sum + entry.resourceDelta[key],
                  0,
                ),
            ).toBe(history.after[key]);
          }
          for (const entry of history.entries) {
            if (entry.worldDelta.bridge === 2)
              expect(entry.text).toContain("мост");
            expect(
              Object.values(entry.resourceDelta).every(Number.isFinite),
            ).toBe(true);
          }
        }
      }
    }
  });

  it("is deterministic when replaying the same persisted seed and choices", () => {
    function run() {
      let state = createGame("Ира", "#e56b56", 2973);
      state = play(state, "bridge_repair", true);
      state = play(state, "delivery");
      state = play(state, "community_reserve");
      return state;
    }
    expect(run()).toEqual(run());
    expect(getEnding(createGame("Тест", "#e56b56", 0))).toBeNull();
  });

  it("keeps a real private reserve useful even after the home was secured and shared supplies run out", () => {
    let state = play(createGame("Тест", "#e56b56", 0), "home_seal", true);
    expect(state.world.home).toBe(2);
    expect(state.player.privateSupplies).toBe(0);
    const before = state;
    state = play(state, "private_pantry");
    expect(state.player.privateSupplies).toBe(1);
    expect(before.player.privateSupplies).toBe(0);
    const playerAction = state.history[1].entries.find(entry => entry.actorId === "player");
    expect(playerAction?.resourceDelta).toEqual({ budget: -1, supplies: -1, trust: -1 });
    state = play(state, "lanterns");
    expect(state.resources.supplies).toBe(0);
    expect(state.player.privateSupplies).toBe(1);
    expect(getEnding(state)).toMatchObject({ kind: "failure", personalSuccess: true });
    expect(getEnding(state)?.personalText).toContain("личный ящик пережил грозу");
  });

  it("shows the storm during the final recap and cloudy aftermath at the ending", () => {
    let state = play(createGame("Тест", "#e56b56", 0), "bridge_repair");
    state = play(state, "delivery");
    const recap = resolveDay(state, "community_reserve", 3);
    expect(recap.phase).toBe("recap");
    expect(recap.world.weather).toBe("storm");
    const ended = advanceDay(recap);
    expect(ended.phase).toBe("ended");
    expect(ended.world.weather).toBe("cloud");
    expect(ended.resources).toEqual(recap.resources);
    expect(ended.history).toEqual(recap.history);
    expect(advanceDay(ended)).toBe(ended);
  });
});
