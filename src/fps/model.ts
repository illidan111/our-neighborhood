import { BOT, createGame } from "../game";
import type { Ending, GameState } from "../game";

export type Vec3 = [number, number, number];
export type ItemId = "crate" | "battery" | "boards";
export type BotId = (typeof BOT)[number]["id"];
export type TargetId = ItemId | "home_supply" | "home_battery" | "shop_battery" | "bridge_repair" | "day_bell" | BotId | "note";
export type ItemState = { status: "world" | "carried" | "installed"; position: Vec3 };
export type FPSState = {
  version: 2;
  seed: number;
  player: { name: string; color: string };
  /** The original campaign remains intact; its day reducer is not run by the physical scenario. */
  base: GameState;
  legacyImported: boolean;
  phase: "preparation" | "storm" | "aftermath";
  deliveredSupplies: boolean;
  batteryAt: "home" | "shop" | null;
  bridgeRepaired: boolean;
  held: ItemId | null;
  items: Record<ItemId, ItemState>;
  checkpoint: { position: Vec3; yaw: number; pitch: number };
  history: Array<{ id: string; text: string }>;
  botReactions: Record<BotId, string>;
};

type Snapshot = { position: Vec3; yaw: number; pitch: number; items?: Partial<Record<ItemId, Vec3>> };
export type GameCommand =
  | { type: "pick"; item: ItemId }
  | { type: "drop"; position: Vec3 }
  | { type: "install"; target: TargetId }
  | { type: "interact"; target: TargetId }
  | { type: "startStorm" }
  | { type: "finishStorm" }
  | ({ type: "saveCheckpoint" | "snapshot" } & Snapshot)
  | { type: "recoverItems" };

export const ITEM_IDS: ItemId[] = ["crate", "battery", "boards"];
export const ITEM_NAMES: Record<ItemId, string> = { crate: "Ящик с припасами", battery: "Аккумулятор", boards: "Доски для моста" };
export const ITEM_SPAWNS: Record<ItemId, Vec3> = { crate: [-9, 0.7, -7], battery: [12, 0.7, -10], boards: [0, 0.7, -6] };
export const ITEM_ORIGINS = ITEM_SPAWNS;
export const PLAYER_SPAWN: Vec3 = [-14, 1, 15];
export const RECOVERY_SPOT: Vec3 = [-12.5, 0.8, 15];
export const PERSONAL_NOTE = "Записка в кармане: после простуды мне особенно важно переночевать в тепле. Принеси припасы в общий дом и установи здесь аккумулятор. Но он единственный: без него у Бориса отключится холодильник и район потеряет продукты.";

export function isFinitePosition(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v));
}
export function isInsideWorld(position: Vec3): boolean {
  return isFinitePosition(position) && Math.abs(position[0]) < 45 && Math.abs(position[2]) < 40 && position[1] > -8 && position[1] < 35;
}

function reactions(state: Pick<FPSState, "phase" | "batteryAt" | "deliveredSupplies" | "bridgeRepaired">): Record<BotId, string> {
  if (state.phase === "aftermath") return {
    nina: state.deliveredSupplies
      ? state.batteryAt === "home" ? "Ночь пережили с едой и теплом. Спасибо. Теперь надо помочь магазину восполнить потери." : "Ужин был, одеяла тоже. Пережили холодную ночь вместе. Спасибо за припасы."
      : state.batteryAt === "home" ? "Обогреватель спас от холода, но ящик так и не принесли. Теперь сначала найдём еду." : "Ночь была холодной и голодной. Утром начнём помогать друг другу заново.",
    boris: state.batteryAt === "shop"
      ? "Все продукты целы! Холодильник не подвёл. Давайте разделим утренние булочки на всех."
      : "Часть продуктов испортилась за ночь без холодильника. Что уцелело — раздам соседям. Магазин восстановим.",
    mira: state.bridgeRepaired
      ? "Мост выдержал подъём воды! Теперь можем отнести припасы соседям на другом берегу."
      : "Вода повредила настил. Через мост пока не пройти. В следующий день придётся начать с ремонта.",
  };
  return {
    nina: state.batteryAt === "home"
      ? "Свет есть! Обогреватель заработал. Ночью в доме будет тепло. Надеюсь, Борис найдёт выход."
      : state.deliveredSupplies
        ? "Спасибо за припасы. Если аккумулятор уйдёт в магазин, будем греться одеялами — зато сохраним продукты для всех."
        : "Я Нина. Гроза близко. Принеси ящик из магазина сюда, на коврик у полки. Дом будет нашим убежищем.",
    boris: state.batteryAt === "shop"
      ? "Холодильник гудит! Продукты для всего района переживут ночь. Ладно, утренние булочки за мой счёт."
      : state.batteryAt === "home"
        ? "В доме тепло, я понимаю. Но мой холодильник без света. После грозы часть продуктов придётся выбросить."
        : "Я Борис, держу магазин. Аккумулятор нужен моему холодильнику: без него испортятся продукты для всех. Тебе решать: тепло дома или общий запас.",
    mira: state.bridgeRepaired
      ? "Мост укреплён! После грозы сможем донести продукты соседям. Хорошая работа."
      : state.batteryAt
        ? "Аккумулятор подключён, переставить его до грозы уже не получится. Доски у площади ещё пригодятся: принеси их к мосту."
        : "Я Мира. У генератора остался один аккумулятор. Отнеси его к жёлтому разъёму дома или магазина. Питания хватит только одному зданию.",
  };
}

function initial(base: GameState, legacyImported: boolean): FPSState {
  const state: FPSState = {
    version: 2,
    seed: base.seed,
    player: { name: base.player.name, color: base.player.color },
    base,
    legacyImported,
    phase: "preparation",
    deliveredSupplies: false,
    batteryAt: null,
    bridgeRepaired: false,
    held: null,
    items: Object.fromEntries(ITEM_IDS.map((id) => [id, { status: "world", position: [...ITEM_SPAWNS[id]] }])) as Record<ItemId, ItemState>,
    checkpoint: { position: [...PLAYER_SPAWN], yaw: 0, pitch: 0 },
    history: [{ id: "start", text: "День 1. Гроза придёт вечером. Принеси припасы в общий дом, затем реши, где нужнее единственный аккумулятор." }],
    botReactions: { nina: "", boris: "", mira: "" },
  };
  if (legacyImported) state.history.push({ id: "legacy_imported", text: "Имя, цвет и история прежней кампании сохранены в архиве. Прогулка от первого лица начинается с нового дня подготовки." });
  state.botReactions = reactions(state);
  return state;
}

export function createFPSGame(name: string, color: string, seed?: number): FPSState {
  return initial(createGame(name, /^#[\da-f]{6}$/i.test(color) ? color : "#e78064", seed), false);
}

export function createFPSGameFromLegacy(base: GameState): FPSState {
  return initial(structuredClone(base), true);
}

function event(state: FPSState, id: string, text: string): FPSState {
  if (state.history.some((entry) => entry.id === id)) return state;
  return { ...state, history: [...state.history, { id, text }] };
}

function withReactions(state: FPSState): FPSState {
  return { ...state, botReactions: reactions(state) };
}

function recoverItems(state: FPSState): FPSState {
  let next = state;
  for (const item of ITEM_IDS) {
    if (next.items[item].status === "world" && !isInsideWorld(next.items[item].position)) {
      next = { ...next, items: { ...next.items, [item]: { status: "world", position: [...ITEM_SPAWNS[item]] } } };
    }
  }
  return next;
}

function install(state: FPSState, target: TargetId): FPSState {
  if (state.phase !== "preparation" || state.held === null) return state;
  let next: FPSState = state;
  if (target === "home_supply" && state.held === "crate" && !state.deliveredSupplies) {
    next = event({ ...state, deliveredSupplies: true }, "supplies_delivered", "Припасы доставлены в общий дом. Нина разложила еду и приготовила убежище.");
  } else if ((target === "home_battery" || target === "shop_battery") && state.held === "battery" && state.batteryAt === null) {
    const destination = target === "home_battery" ? "home" : "shop";
    next = event({ ...state, batteryAt: destination }, `battery_${destination}`, destination === "home"
      ? "Единственный аккумулятор подключён к дому. Свет и обогреватель включены; холодильник магазина останется без питания."
      : "Единственный аккумулятор подключён к магазину. Холодильник заработал; общий дом проведёт ночь без электричества.");
  } else if (target === "bridge_repair" && state.held === "boards" && !state.bridgeRepaired) {
    next = event({ ...state, bridgeRepaired: true }, "bridge_repaired", "Доски установлены. Мост укреплён и выдержит подъём воды.");
  }
  if (next === state) return state;
  return withReactions({ ...next, held: null, items: { ...next.items, [state.held]: { ...next.items[state.held], status: "installed" } } });
}

/** Input and physics produce commands; this reducer never reads DOM, time, or a physics body. */
export function applyCommand(state: FPSState, command: GameCommand): FPSState {
  switch (command.type) {
    case "pick":
      if (state.phase === "storm" || state.held || state.items[command.item]?.status !== "world") return state;
      return { ...state, held: command.item, items: { ...state.items, [command.item]: { ...state.items[command.item], status: "carried" } } };
    case "drop": {
      if (!state.held || !isFinitePosition(command.position)) return state;
      return recoverItems({ ...state, held: null, items: { ...state.items, [state.held]: { status: "world", position: [...command.position] } } });
    }
    case "install": return install(state, command.target);
    case "interact": {
      if (ITEM_IDS.includes(command.target as ItemId)) return applyCommand(state, { type: "pick", item: command.target as ItemId });
      if (command.target === "day_bell") return applyCommand(state, { type: "startStorm" });
      if (command.target === "note") return event(state, "note_read", PERSONAL_NOTE);
      if (BOT.some((bot) => bot.id === command.target)) {
        const id = command.target as BotId;
        const suffix = state.phase === "aftermath" ? "after" : state.batteryAt ?? "before";
        return event(state, `talk_${id}_${suffix}`, `${BOT.find((bot) => bot.id === id)!.name}: ${state.botReactions[id]}`);
      }
      return install(state, command.target);
    }
    case "startStorm":
      if (state.phase !== "preparation") return state;
      return withReactions(event({ ...state, phase: "storm" }, "storm_started", "Колокол на площади прозвенел. Ветер крепчает, вода поднимается. День подготовки завершён."));
    case "finishStorm":
      if (state.phase !== "storm") return state;
      return withReactions(event({ ...state, phase: "aftermath" }, "storm_finished", getFPSOutcome(state).description));
    case "saveCheckpoint":
    case "snapshot": {
      if (!isFinitePosition(command.position) || !Number.isFinite(command.yaw) || !Number.isFinite(command.pitch)) return state;
      let items = state.items;
      for (const id of ITEM_IDS) {
        const position = command.items?.[id];
        if (state.items[id].status === "world" && isFinitePosition(position)) {
          items = { ...items, [id]: { ...items[id], position: [...position] } };
        }
      }
      return recoverItems({ ...state, items, checkpoint: { position: [...command.position], yaw: command.yaw, pitch: Math.max(-1.5, Math.min(1.5, command.pitch)) } });
    }
    case "recoverItems": return recoverItems(state);
  }
}

export function describeTarget(state: FPSState, target: TargetId): { label: string; canInteract: boolean } {
  if (target === "note") return { label: "Прочитать личную записку", canInteract: true };
  const bot = BOT.find((entry) => entry.id === target);
  if (bot) return { label: `Поговорить · ${bot.name} (бот)`, canInteract: true };
  if (target === "day_bell") return {
    label: state.phase === "preparation" ? "Позвонить в колокол · начать грозу" : state.phase === "storm" ? "Гроза идёт" : "День завершён · исследуй район",
    canInteract: state.phase === "preparation",
  };
  if (ITEM_IDS.includes(target as ItemId)) {
    const item = target as ItemId;
    return { label: state.phase === "storm" ? "Дождись окончания грозы" : state.held ? "Руки заняты · отпусти предмет" : `Поднять · ${ITEM_NAMES[item]}`, canInteract: state.phase !== "storm" && !state.held && state.items[item].status === "world" };
  }
  if (state.phase !== "preparation") return { label: "Подготовка завершена", canInteract: false };
  const definitions: Record<string, { item: ItemId; done: boolean; action: string; needed: string }> = {
    home_supply: { item: "crate", done: state.deliveredSupplies, action: "Поставить припасы в убежище", needed: "Принеси ящик из магазина" },
    home_battery: { item: "battery", done: state.batteryAt !== null, action: "Подключить дом · магазин останется без света", needed: "Принеси аккумулятор · тепло в доме" },
    shop_battery: { item: "battery", done: state.batteryAt !== null, action: "Подключить холодильник · дом останется без света", needed: "Принеси аккумулятор · спасти общие продукты" },
    bridge_repair: { item: "boards", done: state.bridgeRepaired, action: "Укрепить мост досками", needed: "Принеси доски с площади" },
  };
  const definition = definitions[target];
  if (!definition) return { label: "", canInteract: false };
  if (definition.done) return { label: target.includes("battery") ? (state.batteryAt === (target === "home_battery" ? "home" : "shop") ? "Электричество подключено" : "Аккумулятор уже установлен в другом здании") : "Готово", canInteract: false };
  return { label: state.held === definition.item ? definition.action : definition.needed, canInteract: state.held === definition.item };
}

export function getObjective(state: FPSState): string {
  if (state.phase === "storm") return "Гроза пришла. Укройся в доме и дождись утра.";
  if (state.phase === "aftermath") return "Осмотри район после грозы. J — итоги и дневник.";
  if (!state.deliveredSupplies) return state.held === "crate" ? "Отнеси ящик в общий дом, к полке с припасами." : "Принеси ящик с припасами из магазина в общий дом.";
  if (!state.batteryAt) return state.held === "battery" ? "Выбери: тепло дома или продукты в магазине. Установи аккумулятор у разъёма." : "Аккумулятор у генератора. Поговори с Борисом и реши, кому дать свет.";
  if (!state.bridgeRepaired) return "Можно укрепить мост досками. Когда готов — колокол на площади начинает грозу.";
  return "Район готов настолько, насколько возможно. Начни грозу колоколом на площади.";
}

export function getFPSOutcome(state: FPSState): Ending {
  const score = Number(state.deliveredSupplies) + (state.batteryAt === "shop" ? 2 : Number(state.batteryAt === "home")) + Number(state.bridgeRepaired);
  const kind: Ending["kind"] = score === 4 ? "success" : score >= 2 ? "mixed" : "failure";
  const highlights = [
    state.deliveredSupplies ? "Припасы в доме: никто не остался без ужина." : "Ящик не доставлен: убежище осталось без приготовленного ужина.",
    state.batteryAt === "shop" ? "Холодильник работал всю ночь: общие продукты сохранены. В доме пришлось греться одеялами." : state.batteryAt === "home" ? "В доме были свет и тепло. В магазине без холодильника испортилась часть продуктов." : "Аккумулятор не подключён: дом и магазин остались без электричества, часть продуктов испортилась.",
    state.bridgeRepaired ? "Укреплённый мост выдержал воду. К соседям снова можно пройти." : "Вода повредила настил моста: путь к соседям закрыт до ремонта.",
  ];
  const personalSuccess = state.deliveredSupplies && state.batteryAt === "home";
  return {
    kind,
    title: kind === "success" ? "Район выдержал грозу" : kind === "mixed" ? "Утро с потерями" : "Району нужна помощь",
    description: kind === "success" ? "Припасы доставлены, продукты сохранены, мост уцелел. Ночь в убежище была холодной, но район готов помочь друг другу." : kind === "mixed" ? "Гроза прошла. Часть подготовки помогла соседям, но утро показало цену остальных решений." : "Гроза застала район неподготовленным. Утром соседи считают потери и начинают всё восстанавливать.",
    personalSuccess,
    personalText: personalSuccess ? "Личная цель выполнена: в общем доме есть еда, свет и тепло. Цена решения — часть общих продуктов в магазине." : state.batteryAt === "shop" ? "Личная цель не выполнена: ты отказался от тепла дома ради продуктов для всего района." : "Личная цель не выполнена: для тёплой сытой ночи требовались и припасы, и аккумулятор в доме.",
    highlights,
  };
}

/** Held bodies are recreated at a known unobstructed position, never inside a saved wall. */
export function prepareFPSResume(state: FPSState): FPSState {
  let next = recoverItems(state);
  if (!isInsideWorld(next.checkpoint.position) || next.checkpoint.position[1] < 0.3) {
    next = { ...next, checkpoint: { position: [...PLAYER_SPAWN], yaw: 0, pitch: 0 } };
  }
  if (next.held) next = { ...next, held: null, items: { ...next.items, [next.held]: { status: "world", position: [...RECOVERY_SPOT] } } };
  return next;
}
