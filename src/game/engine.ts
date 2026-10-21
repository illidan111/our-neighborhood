import type {
  Action,
  DayBrief,
  Ending,
  GameState,
  HistoryEntry,
  LocationId,
  LocationInfo,
  PlayerColor,
  Resources,
} from "./types";

export const BOT = [
  {
    id: "nina",
    name: "Нина",
    color: "#e5b54b",
    personality: "Осторожная",
    goal: "Защитить общий дом",
    location: "home" as const,
  },
  {
    id: "boris",
    name: "Борис",
    color: "#8d78b4",
    personality: "Себе на уме",
    goal: "Сохранить магазин",
    location: "shop" as const,
  },
  {
    id: "mira",
    name: "Мира",
    color: "#54a9ae",
    personality: "За всех",
    goal: "Вернуть электричество",
    location: "power" as const,
  },
] as const;
export const BOTS = BOT;
export const RESOURCE_LIMITS: Resources = {
  budget: 30,
  supplies: 20,
  trust: 10,
};

/** Intent uses public information only. Earlier actors may change affordability. */
export function getBotPlan(state: GameState, botId: string): string {
  if (botId === "nina") {
    if (state.world.home < 2)
      return canPay(state, 2, 1)
        ? "Сначала укреплю дом: 2 монеты и 1 ящик. Если до меня всё потратят, сдам стеклотару."
        : "На дом пока не хватает. Если деньги не появятся, сдам стеклотару: хотя бы +1 монета.";
    return state.resources.trust >= 5
      ? "Дом защищён. Если доверие не упадёт ниже 5, принесу один общий ящик."
      : "Дом защищён, но доверия мало. Пока проверю окна и поберегу свою кладовую.";
  }
  if (botId === "boris") {
    if (state.world.shop < 2)
      return canPay(state, 3, 1)
        ? "Ставни магазину: 3 монеты и 1 ящик. Если хватит к моему ходу. Бизнес тоже хочет жить."
        : "На ставни не хватает. Если ресурсы не появятся, останусь дежурить у магазина.";
    return state.resources.supplies >= 2
      ? "Если останется хотя бы 2 ящика, один продам: +2 монеты, −1 доверие. Торговля есть торговля."
      : "Запасов пока мало для продажи. Если появятся хотя бы 2 ящика, один пущу в оборот.";
  }
  if (botId === "mira") {
    if (state.world.power < 2)
      return canPay(state, 2, 1)
        ? "Вложу 2 монеты и 1 ящик в станцию, если к моему ходу они останутся."
        : "На станцию пока не хватает. При доверии от 4 соберу ящик, иначе сдам металлолом за монету.";
    return state.resources.trust >= 4
      ? "Станция готова. Если доверие останется от 4, соберу ящик и добавлю +1 доверие."
      : "Станция готова, но соседи не делятся. Сдам металлолом: +1 монета.";
  }
  return "";
}

const emptyDelta = (): Resources => ({ budget: 0, supplies: 0, trust: 0 });
const clamp = (n: number, maximum: number) => Math.min(maximum, Math.max(0, n));
const resourceDelta = (before: Resources, after: Resources): Resources => ({
  budget: after.budget - before.budget,
  supplies: after.supplies - before.supplies,
  trust: after.trust - before.trust,
});
const addResources = (state: GameState, change: Partial<Resources>) => {
  for (const key of ["budget", "supplies", "trust"] as const) {
    state.resources[key] = clamp(
      state.resources[key] + (change[key] ?? 0),
      RESOURCE_LIMITS[key],
    );
  }
};
const setLevel = (
  state: GameState,
  location: Exclude<LocationId, "square">,
  level: number,
) => {
  state.world[location] = clamp(level, 2);
};
const copyState = (state: GameState): GameState => ({
  ...state,
  resources: { ...state.resources },
  world: { ...state.world },
  player: { ...state.player },
  promise: { ...state.promise },
  dayEvent: {
    ...state.dayEvent,
    before: { ...state.dayEvent.before },
    resourceDelta: { ...state.dayEvent.resourceDelta },
  },
  history: [...state.history],
});

function enterDay(state: GameState): void {
  const before = { ...state.resources };
  const variant = state.seed % 2;
  let title = "До грозы — три дня";
  let text =
    variant === 0
      ? "Синоптик обещает грозу через три дня. Мост скрипит, свет мигает. Пока всё почти уютно."
      : "Чайки ушли вглубь суши. Через три дня — гроза. У района есть мост, генератор и слишком много мнений.";
  state.world.weather = state.day === 1 ? "sun" : "cloud";
  if (state.day === 2) {
    title = "Ветер набирает силу";
    addResources(state, { supplies: -1 });
    text =
      before.supplies > 0
        ? "Порыв ветра унёс общий ящик. Минус один запас. Местные чайки отрицают причастность."
        : "Ветер сорвал брезент со склада. Пустые полки хотя бы не пострадали.";
  } else if (state.day === 3) {
    title = "Последний день до грозы";
    if (state.world.power < 2) {
      addResources(state, { supplies: -1 });
      text =
        before.supplies > 0
          ? "Свет снова погас. Без холодильника испортился один общий ящик. Гроза придёт вечером."
          : "Свет снова погас. Холодильник пуст, зато всем тревожно. Гроза придёт вечером.";
    } else {
      text =
        "Генератор держит напряжение: холодильник работает, запасы целы. Гроза придёт вечером.";
    }
  }
  state.dayEvent = {
    title,
    text,
    before,
    resourceDelta: resourceDelta(before, state.resources),
  };
}

export function createGame(
  name: string,
  color: PlayerColor,
  seed = Date.now(),
): GameState {
  const resources = { budget: 14, supplies: 8, trust: 5 };
  const state: GameState = {
    version: 1,
    day: 1,
    phase: "planning",
    resources,
    world: { bridge: 0, home: 0, power: 0, shop: 1, weather: "sun" },
    player: {
      name: name.trim().slice(0, 24) || "Сосед",
      color,
      privateSupplies: 0,
    },
    seed: Number.isFinite(seed) ? seed >>> 0 : 1,
    promise: { status: "none" },
    dayEvent: {
      title: "",
      text: "",
      resourceDelta: emptyDelta(),
      before: { ...resources },
    },
    history: [],
  };
  enterDay(state);
  return state;
}

export function getDayBrief(state: GameState): DayBrief {
  if (state.day === 1)
    return {
      title: state.dayEvent.title,
      event: state.dayEvent.text,
      privateInfo:
        "Под вашим подоконником трещина. Для личного успеха дом должен быть полностью защищён, а после грозы должен остаться хотя бы один общий или личный ящик. Нина поможет, если хватит ресурсов.",
      task: "С чего начнём: мост, дом или общий кошелёк?",
      promiseOffer:
        "Обещаю до грозы собрать общий резерв. +1 доверие сейчас, ещё +1 за выполнение; −3, если нарушу. Выполняется доставкой завтра (в том числе по тропе) или сбором резерва в последний день.",
    };
  if (state.day === 2)
    return {
      title: state.dayEvent.title,
      event: state.dayEvent.text,
      privateInfo:
        state.world.bridge === 2
          ? "Водитель ждёт вашего звонка. По укреплённому мосту он доставит пять ящиков за две монеты. Соседи пока об этом не знают."
          : "Водитель не поедет по слабому мосту. Вы знаете сухую тропу: можно перенести два ящика за одну монету.",
      task:
        state.promise.status === "pending"
          ? "Вспомните обещание. Резерв нужен всем, крыша — вам."
          : "День второй. Запасы, электричество или свой угол?",
    };
  return {
    title: state.dayEvent.title,
    event: state.dayEvent.text,
    privateInfo:
      "Знакомый синоптик прислал уточнение только вам: каждый неготовый мост, станция и магазин отнимет по одному общему ящику во время грозы. Дом ниже уровня 2 тоже пострадает. Личный ящик в укреплённом доме останется сухим.",
    task: "До грозы — один ход. Что спасаем в последнюю очередь?",
  };
}

function actionDefinitions(state: GameState): Action[] {
  if (state.day === 1)
    return [
      {
        id: "bridge_repair",
        title: "Укрепить мост",
        description:
          "Заменить доски и стянуть опоры. Завтра грузовик сможет добраться до района.",
        cost: { budget: 4, supplies: 2 },
        location: "bridge",
        consequence: "Мост → 2 · доверие +1 · доставка завтра",
      },
      {
        id: "home_seal",
        title: "Защитить свой дом",
        description:
          "Заделать трещины и укрепить крышу. Когда у тебя сухие носки, легче думать об общем.",
        cost: { budget: 3, supplies: 2 },
        location: "home",
        consequence: "Дом → 2 · личная цель защищена при наличии запасов",
      },
      {
        id: "fundraise",
        title: "Собрать взносы",
        description:
          "Пройти по соседям с банкой для пожертвований. Деньги появятся, ремонт подождёт.",
        cost: { budget: 0, supplies: 0 },
        location: "square",
        consequence: "Бюджет +4 · инфраструктура без изменений",
      },
    ];
  if (state.day === 2)
    return [
      state.world.bridge === 2
        ? {
            id: "delivery",
            title: "Встретить грузовик",
            description:
              "Мост готов. Водитель привезёт пять общих ящиков — и немного сплетен.",
            cost: { budget: 2, supplies: 0 },
            location: "bridge",
            consequence: "Запасы +5 · выполнит обещание о резерве",
          }
        : {
            id: "footpath",
            title: "Пронести запасы по тропе",
            description:
              "Без целого моста грузовик не пройдёт. Два ящика можно донести на руках.",
            cost: { budget: 1, supplies: 0 },
            location: "bridge",
            consequence: "Запасы +2 · выполнит обещание о резерве",
          },
      {
        id: "generator",
        title: "Запустить генератор",
        description:
          "Взять ремонт на себя. Холодильник магазина и уличный свет будут работать завтра.",
        cost: { budget: 3, supplies: 2 },
        location: "power",
        consequence:
          "Электростанция → 2 · доверие +1 · завтра еда не испортится",
      },
      {
        id: "private_pantry",
        title: "Укрыть личный запас",
        description:
          "Укрепить дом и спрятать один общий ящик в личной кладовой. Он переживёт грозу, даже если район останется без запасов.",
        cost: { budget: 1, supplies: 1 },
        location: "home",
        consequence: "Дом → 2 · личный запас +1 · общий запас −1 · доверие −1",
      },
    ];
  return [
    state.world.bridge === 2
      ? {
          id: "evacuation",
          title: "Подготовить эвакуацию",
          description:
            "Обозначить путь через целый мост и подготовить дом как безопасное убежище.",
          cost: { budget: 1, supplies: 1 },
          location: "home",
          consequence: "Дом → 2 · доверие +1",
        }
      : {
          id: "last_bridge",
          title: "Успеть с мостом",
          description:
            "Последние сухие часы — на опоры и настил. Дом и генератор останутся соседям.",
          cost: { budget: 4, supplies: 2 },
          location: "bridge",
          consequence: "Мост → 2 · доверие +1",
        },
    state.world.power === 2
      ? {
          id: "lanterns",
          title: "Выставить аварийные фонари",
          description:
            "Станция готова. Отметить безопасные дорожки, чтобы ночью никто не потерялся.",
          cost: { budget: 0, supplies: 1 },
          location: "power",
          consequence: "Доверие +2 · один ящик расходников",
        }
      : {
          id: "last_power",
          title: "Защитить электростанцию",
          description:
            "Укрыть щиток и включить резерв. Вода любит электричество, но это невзаимно.",
          cost: { budget: 3, supplies: 2 },
          location: "power",
          consequence: "Электростанция → 2 · доверие +1",
        },
    {
      id: "community_reserve",
      title: "Собрать общий резерв",
      description:
        "Снести на площадь всё, что ещё осталось по кладовым. Два ящика точно найдутся.",
      cost: { budget: 0, supplies: 0 },
      location: "square",
      consequence: "Запасы +2 · доверие +1 · выполнит обещание",
    },
  ];
}

export function getActions(state: GameState): Action[] {
  return actionDefinitions(state).map((action) => {
    let disabledReason: string | undefined;
    if (state.phase !== "planning") disabledReason = "Этот день уже завершён";
    else if (
      state.resources.budget < action.cost.budget &&
      state.resources.supplies < action.cost.supplies
    )
      disabledReason = "Не хватает монет и запасов";
    else if (state.resources.budget < action.cost.budget)
      disabledReason = "Не хватает монет";
    else if (state.resources.supplies < action.cost.supplies)
      disabledReason = "Не хватает запасов";
    return { ...action, disabledReason };
  });
}

type Effect = (state: GameState) => string;

function applyEntry(
  state: GameState,
  entries: HistoryEntry[],
  actor: string,
  actorId: string,
  location: LocationId,
  effect: Effect,
  status: HistoryEntry["status"] = "applied",
): void {
  const before = { ...state.resources };
  const world = { ...state.world };
  const text = effect(state);
  const worldDelta: HistoryEntry["worldDelta"] = {};
  for (const key of ["bridge", "home", "power", "shop"] as const) {
    if (world[key] !== state.world[key])
      worldDelta[key] = state.world[key] - world[key];
  }
  entries.push({
    actor,
    actorId,
    location,
    text,
    status,
    resourceDelta: resourceDelta(before, state.resources),
    worldDelta,
  });
}

function fulfillPromise(state: GameState): string {
  if (state.promise.status !== "pending") return "";
  state.promise = {
    ...state.promise,
    status: "fulfilled",
    resolvedDay: state.day,
  };
  addResources(state, { trust: 1 });
  return " Обещание выполнено: доверие +1.";
}

function playerEffect(state: GameState, id: string): string {
  switch (id) {
    case "bridge_repair":
    case "last_bridge":
      setLevel(state, "bridge", 2);
      addResources(state, { trust: 1 });
      return "Укрепил мост. Опоры и настил готовы к грозе; доверие выросло.";
    case "home_seal":
      setLevel(state, "home", 2);
      return "Защитил общий дом. Трещины заделаны, крыша закреплена.";
    case "fundraise": {
      const before = state.resources.budget;
      addResources(state, { budget: 4 });
      return `Собрал взносы: в общем бюджете +${state.resources.budget - before} монеты. Ремонт подождал.`;
    }
    case "delivery":
    case "footpath": {
      const before = state.resources.supplies;
      addResources(state, { supplies: id === "delivery" ? 5 : 2 });
      return (
        `${id === "delivery" ? "Встретил грузовик у целого моста" : "Пронёс ящики по тропе"}: запасы +${state.resources.supplies - before}.` +
        fulfillPromise(state)
      );
    }
    case "generator":
    case "last_power":
      setLevel(state, "power", 2);
      addResources(state, { trust: 1 });
      return "Подготовил электростанцию: щиток защищён, генератор работает.";
    case "private_pantry":
      setLevel(state, "home", 2);
      state.player.privateSupplies += 1;
      addResources(state, { trust: -1 });
      return "Защитил дом и перенёс один общий ящик в личную кладовую. Личный запас +1, общий запас −1, доверие −1. Этот ящик переживёт грозу.";
    case "evacuation":
      setLevel(state, "home", 2);
      addResources(state, { trust: 1 });
      return "Подготовил безопасный дом и маршрут эвакуации через укреплённый мост.";
    case "lanterns":
      addResources(state, { trust: 2 });
      return "Выставил аварийные фонари. Готовая станция освещает дорожки; доверие выросло.";
    case "community_reserve": {
      const before = state.resources.supplies;
      addResources(state, { supplies: 2, trust: 1 });
      return (
        `Собрал по кладовым общий резерв: +${state.resources.supplies - before} ящика.` +
        fulfillPromise(state)
      );
    }
    default:
      return "Действие не выполнено.";
  }
}

function canPay(state: GameState, budget: number, supplies: number): boolean {
  return (
    state.resources.budget >= budget && state.resources.supplies >= supplies
  );
}

function runBot(
  state: GameState,
  bot: (typeof BOT)[number],
  entries: HistoryEntry[],
): void {
  applyEntry(state, entries, bot.name, bot.id, bot.location, (current) => {
    if (bot.id === "nina") {
      if (current.world.home < 2 && canPay(current, 2, 1)) {
        addResources(current, { budget: -2, supplies: -1 });
        setLevel(current, "home", current.world.home + 1);
        return current.world.home === 2
          ? "Закрепила крышу. Общий дом полностью защищён. «Теперь можно выдохнуть». "
          : "Заложила трещины в фундаменте. Дом подготовлен наполовину. «Крыша — завтра». ";
      }
      if (current.world.home === 2 && current.resources.trust >= 5) {
        const before = current.resources.supplies;
        addResources(current, { supplies: 1 });
        return `Дом готов: передала ${current.resources.supplies - before} ящик из своей кладовой в общий запас.`;
      }
      if (current.world.home < 2) {
        const before = current.resources.budget;
        addResources(current, { budget: 1 });
        return `На ремонт дома не хватило ресурсов. Сдала стеклотару: бюджет +${current.resources.budget - before}. Дом пока уязвим.`;
      }
      return "Проверила окна готового дома. Соседям пока не доверяет: личную кладовую не открыла.";
    }
    if (bot.id === "boris") {
      if (current.world.shop < 2 && canPay(current, 3, 1)) {
        addResources(current, { budget: -3, supplies: -1 });
        setLevel(current, "shop", 2);
        return "Поставил ставни и поднял товар с пола. Магазин защищён. «Касса должна пережить нас всех». ";
      }
      if (current.world.shop === 2 && current.resources.supplies >= 2) {
        const before = current.resources.budget;
        addResources(current, { budget: 2, supplies: -1, trust: -1 });
        return `Продал общий ящик: запасы −1, бюджет +${current.resources.budget - before}, доверие −1. «Зато наличные есть». `;
      }
      return current.world.shop < 2
        ? "На ставни не хватило ресурсов. Дежурит у магазина; ремонт не состоялся, ресурсы не списаны."
        : "Запасов для торговли мало. Закрыл магазин и пересчитал кассу. Общие ресурсы не изменились.";
    }
    if (current.world.power < 2 && canPay(current, 2, 1)) {
      addResources(current, { budget: -2, supplies: -1 });
      setLevel(current, "power", current.world.power + 1);
      return current.world.power === 2
        ? "Запустила резерв и закрыла щиток. Станция готова. «Да будет свет, желательно надолго». "
        : "Починила проводку. Станция подготовлена наполовину; резерв ещё нужен.";
    }
    if (current.resources.trust >= 4) {
      const before = current.resources.supplies;
      addResources(current, {
        supplies: 1,
        trust: current.world.power === 2 ? 1 : 0,
      });
      return `${current.world.power === 2 ? "Станция готова" : "На ремонт станции не хватило ресурсов"}: собрала у соседей ${current.resources.supplies - before} общий ящик.`;
    }
    const before = current.resources.budget;
    addResources(current, { budget: 1 });
    return `Соседи не открыли кладовые: доверия мало. Мира сдала металлолом, бюджет +${current.resources.budget - before}.`;
  });
}

function applyStorm(state: GameState, entries: HistoryEntry[]): void {
  applyEntry(state, entries, "Гроза", "storm", "square", (current) => {
    current.world.weather = "storm";
    const damaged: string[] = [];
    for (const [location, label] of [
      ["bridge", "мост"],
      ["power", "электростанция"],
      ["home", "дом"],
      ["shop", "магазин"],
    ] as const) {
      if (current.world[location] < 2) {
        setLevel(current, location, 0);
        damaged.push(label);
      }
    }
    const before = current.resources.supplies;
    if (current.world.bridge < 2) addResources(current, { supplies: -1 });
    if (current.world.power < 2) addResources(current, { supplies: -1 });
    if (current.world.shop < 2) addResources(current, { supplies: -1 });
    const loss = before - current.resources.supplies;
    if (damaged.length === 0)
      return "Гроза прошла. Подготовленные здания и мост устояли. Запасы не пострадали.";
    return `Гроза повредила незащищённые объекты: ${damaged.join(", ")}. ${loss > 0 ? `Потеряно ящиков: ${loss}.` : "Дополнительных потерь запасов нет."}`;
  });
}

/** Immutable transition. The expected day protects against stale/double submissions. */
export function resolveDay(
  state: GameState,
  actionId: string,
  expectedDay: number,
  promise = false,
): GameState {
  if (
    state.phase !== "planning" ||
    state.day !== expectedDay ||
    state.history.some((day) => day.day === expectedDay)
  )
    return state;
  const action = getActions(state).find(
    (candidate) => candidate.id === actionId,
  );
  if (!action || action.disabledReason) return state;
  const next = copyState(state);
  const entries: HistoryEntry[] = [];
  if (next.day === 1 && promise && next.promise.status === "none") {
    applyEntry(
      next,
      entries,
      next.player.name,
      "player",
      "square",
      (current) => {
        current.promise = { status: "pending", madeDay: 1 };
        addResources(current, { trust: 1 });
        return "Пообещал собрать общий резерв до грозы. Соседи поверили: доверие выросло.";
      },
    );
  }
  applyEntry(
    next,
    entries,
    next.player.name,
    "player",
    action.location,
    (current) => {
      addResources(current, {
        budget: -action.cost.budget,
        supplies: -action.cost.supplies,
      });
      return playerEffect(current, action.id);
    },
  );
  const firstBot = ((next.seed % BOT.length) + next.day - 1) % BOT.length;
  for (let i = 0; i < BOT.length; i++)
    runBot(next, BOT[(firstBot + i) % BOT.length], entries);
  if (next.day === 3) {
    if (next.promise.status === "pending") {
      applyEntry(next, entries, "Соседи", "promise", "square", (current) => {
        const before = current.resources.trust;
        current.promise = {
          ...current.promise,
          status: "broken",
          resolvedDay: 3,
        };
        addResources(current, { trust: -3 });
        return `Обещанный общий резерв так и не появился. Доверие −${before - current.resources.trust}: в следующий раз словам поверят меньше.`;
      });
    }
    applyStorm(next, entries);
  }
  next.history.push({
    day: next.day,
    event: next.dayEvent.text,
    actionId: action.id,
    actionTitle: action.title,
    entries,
    before: { ...next.dayEvent.before },
    after: { ...next.resources },
  });
  next.phase = "recap";
  return next;
}

/** A recap persists until explicitly advanced. A double advance cannot skip planning. */
export function advanceDay(state: GameState): GameState {
  if (state.phase !== "recap") return state;
  const next = copyState(state);
  if (next.day === 3) {
    next.phase = "ended";
    next.world.weather = "cloud";
  } else {
    next.day += 1;
    next.phase = "planning";
    enterDay(next);
  }
  return next;
}

export function getEnding(state: GameState): Ending | null {
  if (
    state.day !== 3 ||
    state.phase === "planning" ||
    state.history.length !== 3
  )
    return null;
  const checks = [
    state.world.bridge === 2,
    state.world.power === 2,
    state.resources.supplies >= 3,
    state.resources.trust >= 4,
  ];
  const passed = checks.filter(Boolean).length;
  const kind = passed === 4 ? "success" : passed >= 2 ? "mixed" : "failure";
  const personalSuccess =
    state.world.home === 2 &&
    (state.resources.supplies >= 1 || state.player.privateSupplies >= 1);
  const endings = {
    success: {
      title: "Район справился",
      description:
        "Мост устоял, свет горит, запасов хватит. Соседи снова спорят о клумбе — значит, самое страшное позади.",
    },
    mixed: {
      title: "Выстояли. Но с потерями",
      description:
        "Район пережил грозу, но не всё удалось сохранить. Завтра снова придётся договариваться — и чинить.",
    },
    failure: {
      title: "Гроза оказалась сильнее",
      description:
        "Общая подготовка провалилась. Район потерял слишком много опор: теперь нужна помощь извне.",
    },
  };
  return {
    kind,
    ...endings[kind],
    personalSuccess,
    personalText: personalSuccess
      ? state.player.privateSupplies >= 1
        ? "Личная цель выполнена: дом защищён, личный ящик пережил грозу."
        : "Личная цель выполнена: дом защищён, после грозы остались общие запасы."
      : state.world.home < 2
        ? "Личная цель не выполнена: общий дом оказался не готов к грозе."
        : "Дом защищён, но не осталось ни общих, ни личных запасов. Личная цель не выполнена.",
    highlights: [
      checks[0] ? "Мост выдержал грозу" : "Мост повреждён",
      checks[1] ? "Электричество работает" : "Район без электричества",
      `Общие запасы: ${state.resources.supplies} · личные: ${state.player.privateSupplies}`,
      `Доверие соседей: ${state.resources.trust}/10`,
      state.promise.status === "fulfilled"
        ? "Обещание выполнено"
        : state.promise.status === "broken"
          ? "Обещание нарушено"
          : "Вы не давали обещаний",
    ],
  };
}

export function getLocationInfo(
  state: GameState,
  id: LocationId,
): LocationInfo {
  if (id === "square")
    return {
      title: "Площадь",
      status: `Общий запас: ${state.resources.supplies}`,
      description:
        "Здесь встречаются, спорят и собирают общий резерв. У магазина хранятся общие ящики, у дома — личный. Каждый ящик — одна единица.",
      level:
        state.resources.supplies >= 5
          ? 2
          : state.resources.supplies > 0
            ? 1
            : 0,
    };
  const definitions: Record<
    Exclude<LocationId, "square">,
    { title: string; descriptions: [string, string, string] }
  > = {
    home: {
      title: "Общий дом",
      descriptions: [
        "В фундаменте трещины, крыша не закреплена. Это ваша личная цель.",
        "Фундамент укреплён. Крышу ещё нужно подготовить.",
        `Дом защищён от грозы. Для личного успеха нужен хотя бы один общий или личный ящик после шторма. В вашей кладовой: ${state.player.privateSupplies}.`,
      ],
    },
    shop: {
      title: "Магазин Бориса",
      descriptions: [
        "Магазин уязвим. Во время грозы общий запас может пострадать.",
        "Магазин открыт, но ставни ещё не готовы к грозе.",
        "Ставни закрываются, товар поднят с пола. Борис доволен.",
      ],
    },
    power: {
      title: "Электростанция",
      descriptions: [
        "Станция нестабильна. Для готовности нужен полный ремонт.",
        "Проводка починена. Резервный генератор ещё не готов.",
        "Станция готова: есть свет, работает холодильник магазина.",
      ],
    },
    bridge: {
      title: "Мост",
      descriptions: [
        "Настил и опоры требуют ремонта. Грузовик здесь не пройдёт.",
        "Мост подготовлен частично. Для доставки нужен уровень 2.",
        "Мост укреплён. Доставка и безопасный путь через реку открыты.",
      ],
    },
  };
  const level = state.world[id];
  return {
    title: definitions[id].title,
    status: ["Уязвим", "Частично готов", "Готов к грозе"][level],
    description: definitions[id].descriptions[level],
    level,
  };
}
