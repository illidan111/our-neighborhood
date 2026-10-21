import { describe, expect, it } from "vitest";
import { advanceDay, createGame, resolveDay } from "../game";
import { SAVE_KEY as LEGACY_SAVE_KEY } from "../persistence";
import { applyCommand, createFPSGame, RECOVERY_SPOT } from "./model";
import type { FPSState } from "./model";
import { clearFPS, FPS_SAVE_KEY, loadFPS, saveFPS } from "./storage";

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
const fresh = () => createFPSGame("Саша", "#e78064", 42);

describe("physical scenario saves", () => {
  it("round-trips preparation, storm, and aftermath without replaying installed resources", () => {
    const storage = memory();
    let state = fresh();
    expect(loadFPS(storage)).toEqual({ state: null, error: null });
    state = applyCommand(applyCommand(state, { type: "pick", item: "crate" }), { type: "install", target: "home_supply" });
    state = applyCommand(applyCommand(state, { type: "pick", item: "battery" }), { type: "install", target: "shop_battery" });
    state = applyCommand(state, { type: "interact", target: "boris" });
    state = applyCommand(state, { type: "snapshot", position: [-4, 1, 5], yaw: 1, pitch: 0.2, items: { boards: [2, 0.5, 3] } });
    for (let stage = 0; stage < 3; stage++) {
      expect(saveFPS(state, storage)).toBe(true);
      expect(loadFPS(storage)).toEqual({ state, error: null });
      state = applyCommand(state, { type: stage === 0 ? "startStorm" : "finishStorm" });
    }
  });

  it("reloads a carried item at a safe physical location with no held body duplication", () => {
    const storage = memory();
    const state = applyCommand(fresh(), { type: "pick", item: "battery" });
    expect(saveFPS(state, storage)).toBe(true);
    const loaded = loadFPS(storage).state!;
    expect(loaded.held).toBe(null);
    expect(loaded.items.battery.status).toBe("world");
    expect(loaded.items.battery.position).toEqual(RECOVERY_SPOT);
    expect(loaded.history).toEqual(state.history);
    expect(saveFPS(loaded, storage)).toBe(true);
  });

  it("imports a valid old campaign as an immutable archive and never overwrites or deletes its slot", () => {
    const storage = memory();
    const legacy = advanceDay(resolveDay(createGame("Архив", "#445566", 7), "bridge_repair", 1));
    const original = JSON.stringify(legacy);
    storage.setItem(LEGACY_SAVE_KEY, original);
    const loaded = loadFPS(storage);
    expect(loaded.error).toBe(null);
    expect(loaded.state?.legacyImported).toBe(true);
    expect(loaded.state?.base).toEqual(legacy);
    expect(saveFPS(loaded.state!, storage)).toBe(true);
    expect(loadFPS(storage).state).toEqual(loaded.state);
    expect(clearFPS(storage)).toBe(true);
    expect(storage.getItem(LEGACY_SAVE_KEY)).toBe(original);
    expect(storage.getItem(FPS_SAVE_KEY)).toBe(null);
  });

  it("protects corrupt v2 data until an explicit reset", () => {
    const storage = memory();
    storage.setItem(FPS_SAVE_KEY, "{broken");
    expect(loadFPS(storage).error).toMatch(/сброс/);
    expect(saveFPS(fresh(), storage)).toBe(false);
    expect(storage.getItem(FPS_SAVE_KEY)).toBe("{broken");
    expect(clearFPS(storage)).toBe(true);
    expect(saveFPS(fresh(), storage)).toBe(true);
  });

  it.each([
    ["two carried items", (state: FPSState) => { state.held = "crate"; state.items.crate.status = "carried"; state.items.battery.status = "carried"; }],
    ["invented electricity", (state: FPSState) => { state.batteryAt = "home"; }],
    ["non-finite position", (state: FPSState) => { state.items.crate.position[0] = Infinity; }],
    ["tampered journal", (state: FPSState) => { state.history[0].text = "fake"; }],
    ["tampered archive", (state: FPSState) => { state.base.resources.trust = 10; }],
    ["invented storm end", (state: FPSState) => { state.phase = "aftermath"; }],
    ["tampered bot reaction", (state: FPSState) => { state.botReactions.boris = "fake"; }],
  ] as Array<[string, (state: FPSState) => void]>) ("rejects %s", (_name, corrupt) => {
    const storage = memory();
    const state = fresh();
    corrupt(state);
    expect(saveFPS(state, storage)).toBe(false);
    storage.setItem(FPS_SAVE_KEY, JSON.stringify(state));
    expect(loadFPS(storage).state).toBe(null);
    expect(loadFPS(storage).error).not.toBe(null);
  });

  it("reports unavailable storage and does not throw", () => {
    const storage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(loadFPS(storage).error).toMatch(/Браузер/);
    expect(saveFPS(fresh(), storage)).toBe(false);
    expect(clearFPS(storage)).toBe(false);
  });
});
