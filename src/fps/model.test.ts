import { describe, expect, it } from "vitest";
import { advanceDay, createGame, resolveDay } from "../game";
import { applyCommand, createFPSGame, createFPSGameFromLegacy, describeTarget, getFPSOutcome, getObjective, ITEM_SPAWNS, prepareFPSResume, RECOVERY_SPOT } from "./model";
import type { FPSState, ItemId, TargetId } from "./model";

const fresh = () => createFPSGame("Саша", "#e78064", 42);
const deliver = (state: FPSState, item: ItemId, target: TargetId) => applyCommand(applyCommand(state, { type: "pick", item }), { type: "install", target });
const finish = (state: FPSState) => applyCommand(applyCommand(state, { type: "startStorm" }), { type: "finishStorm" });

describe("physical first-day scenario", () => {
  it("retains the old campaign and creates a distinct physical day without replaying legacy events", () => {
    const legacy = advanceDay(resolveDay(createGame("Саша", "#e78064", 42), "bridge_repair", 1));
    const state = createFPSGameFromLegacy(legacy);
    expect(state.base).toEqual(legacy);
    expect(state.base).not.toBe(legacy);
    expect(state.legacyImported).toBe(true);
    expect(state.phase).toBe("preparation");
    expect(state.bridgeRepaired).toBe(false);
    expect(state.seed).toBe(42);
    expect(state.history.some((event) => event.id === "legacy_imported")).toBe(true);
    const after = finish(deliver(state, "crate", "home_supply"));
    expect(after.base).toEqual(legacy);
  });

  it("carries exactly one item and only installs the correct carried object", () => {
    const initial = fresh();
    const before = JSON.stringify(initial);
    expect(applyCommand(initial, { type: "install", target: "home_supply" })).toBe(initial);
    const holding = applyCommand(initial, { type: "pick", item: "crate" });
    expect(holding.held).toBe("crate");
    expect(holding.items.crate.status).toBe("carried");
    expect(applyCommand(holding, { type: "pick", item: "battery" })).toBe(holding);
    expect(applyCommand(holding, { type: "install", target: "home_battery" })).toBe(holding);
    const delivered = applyCommand(holding, { type: "interact", target: "home_supply" });
    expect(delivered.deliveredSupplies).toBe(true);
    expect(delivered.held).toBe(null);
    expect(delivered.items.crate.status).toBe("installed");
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("makes the battery choice exclusive, irreversible, and visible in all three bot reactions", () => {
    const initial = fresh();
    const home = deliver(initial, "battery", "home_battery");
    const shop = deliver(initial, "battery", "shop_battery");
    expect(home.batteryAt).toBe("home");
    expect(shop.batteryAt).toBe("shop");
    expect(home.botReactions.nina).not.toBe(initial.botReactions.nina);
    expect(home.botReactions.boris).not.toBe(initial.botReactions.boris);
    expect(home.botReactions.mira).not.toBe(initial.botReactions.mira);
    expect(shop.botReactions.boris).toMatch(/Холодильник гудит/);
    for (const command of [{ type: "pick", item: "battery" }, { type: "install", target: "shop_battery" }, { type: "interact", target: "home_battery" }] as const) expect(applyCommand(home, command)).toBe(home);
    expect(describeTarget(home, "shop_battery").canInteract).toBe(false);
  });

  it("physically drops at the supplied position and recovers escaped items without duplicating installations", () => {
    const holding = applyCommand(fresh(), { type: "pick", item: "crate" });
    const dropped = applyCommand(holding, { type: "drop", position: [1, 3, 2] });
    expect(dropped.held).toBe(null);
    expect(dropped.items.crate).toEqual({ status: "world", position: [1, 3, 2] });
    const recovered = applyCommand(dropped, { type: "snapshot", position: [-14, 1, 15], yaw: 0, pitch: 0, items: { crate: [1, -10, 2], battery: [99, 1, 0] } });
    expect(recovered.items.crate.position).toEqual(ITEM_SPAWNS.crate);
    expect(recovered.items.battery.position).toEqual(ITEM_SPAWNS.battery);
    const installed = deliver(recovered, "battery", "home_battery");
    const snapshot = applyCommand(installed, { type: "snapshot", position: [-14, 1, 15], yaw: 1, pitch: 0.2, items: { battery: [90, -20, 0] } });
    expect(snapshot.items.battery).toEqual(installed.items.battery);
    expect(snapshot.history).toEqual(installed.history);
  });

  it("rejects invalid positions and safely resumes a carried object without changing completed progress", () => {
    const holding = applyCommand(deliver(fresh(), "battery", "shop_battery"), { type: "pick", item: "crate" });
    expect(applyCommand(holding, { type: "drop", position: [NaN, 1, 0] })).toBe(holding);
    expect(applyCommand(holding, { type: "snapshot", position: [0, 1, 0], yaw: Infinity, pitch: 0 })).toBe(holding);
    const resumed = prepareFPSResume(holding);
    expect(resumed.held).toBe(null);
    expect(resumed.items.crate).toEqual({ status: "world", position: RECOVERY_SPOT });
    expect(resumed.batteryAt).toBe("shop");
    expect(holding.held).toBe("crate");
  });

  it("needs the real bell to start the storm and makes the phase transitions idempotent", () => {
    const initial = fresh();
    expect(applyCommand(initial, { type: "finishStorm" })).toBe(initial);
    const storm = applyCommand(initial, { type: "interact", target: "day_bell" });
    expect(storm.phase).toBe("storm");
    expect(applyCommand(storm, { type: "startStorm" })).toBe(storm);
    expect(applyCommand(storm, { type: "pick", item: "crate" })).toBe(storm);
    const after = applyCommand(storm, { type: "finishStorm" });
    expect(after.phase).toBe("aftermath");
    expect(applyCommand(after, { type: "finishStorm" })).toBe(after);
    expect(getObjective(after)).toMatch(/Осмотри/);
    expect(after.history.filter((event) => event.id === "storm_finished")).toHaveLength(1);
  });

  it("produces all three communal outcomes and tracks the conflicting private goal separately", () => {
    const supplied = deliver(fresh(), "crate", "home_supply");
    const repaired = deliver(supplied, "boards", "bridge_repair");
    const best = getFPSOutcome(finish(deliver(repaired, "battery", "shop_battery")));
    expect(best.kind).toBe("success");
    expect(best.personalSuccess).toBe(false);
    const privateWin = getFPSOutcome(finish(deliver(repaired, "battery", "home_battery")));
    expect(privateWin.kind).toBe("mixed");
    expect(privateWin.personalSuccess).toBe(true);
    expect(privateWin.highlights.join(" ")).toMatch(/испортилась/);
    expect(getFPSOutcome(finish(fresh())).kind).toBe("failure");
    expect(getFPSOutcome(finish(supplied)).personalSuccess).toBe(false);
  });

  it("offers short contextual instructions and keeps repeated dialogue out of the journal", () => {
    const initial = fresh();
    expect(describeTarget(initial, "home_supply").canInteract).toBe(false);
    const carrying = applyCommand(initial, { type: "interact", target: "crate" });
    expect(describeTarget(carrying, "home_supply").canInteract).toBe(true);
    const talked = applyCommand(initial, { type: "interact", target: "boris" });
    expect(talked.history.at(-1)?.text).toMatch(/холодильнику/);
    expect(applyCommand(talked, { type: "interact", target: "boris" })).toBe(talked);
    const withNote = applyCommand(talked, { type: "interact", target: "note" });
    expect(withNote.history.at(-1)?.text).toMatch(/единственный/);
  });

  it("allows physical exploration after the storm while keeping the outcome and installations final", () => {
    const after = finish(fresh());
    const outcome = getFPSOutcome(after);
    expect(after.botReactions.nina).toMatch(/Ночь была/);
    expect(after.botReactions.boris).toMatch(/испортил/);
    expect(after.botReactions.mira).toMatch(/повредила/);
    expect(describeTarget(after, "battery").canInteract).toBe(true);
    const holding = applyCommand(after, { type: "pick", item: "battery" });
    expect(holding.held).toBe("battery");
    expect(applyCommand(holding, { type: "install", target: "shop_battery" })).toBe(holding);
    expect(describeTarget(holding, "shop_battery").canInteract).toBe(false);
    const dropped = applyCommand(holding, { type: "drop", position: [0, 1, 0] });
    expect(dropped.held).toBe(null);
    expect(getFPSOutcome(dropped)).toEqual(outcome);
    const talked = applyCommand(dropped, { type: "interact", target: "boris" });
    expect(talked.history.at(-1)?.id).toBe("talk_boris_after");
  });
});
