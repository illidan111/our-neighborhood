export type LocationId = "home" | "shop" | "power" | "square" | "bridge";
export type PlayerColor = string;
export type Phase = "planning" | "recap" | "ended";
export type Resources = { budget: number; supplies: number; trust: number };
export type World = {
  bridge: number;
  home: number;
  power: number;
  shop: number;
  weather: "sun" | "cloud" | "storm";
};
export type PromiseStatus = "none" | "pending" | "fulfilled" | "broken";
export type HistoryEntry = {
  actor: string;
  actorId: string;
  location: LocationId;
  text: string;
  status: "applied" | "skipped";
  resourceDelta: Resources;
  worldDelta: Partial<Record<Exclude<LocationId, "square">, number>>;
};
export type DayEvent = {
  title: string;
  text: string;
  resourceDelta: Resources;
  before: Resources;
};
export type DayHistory = {
  day: number;
  event: string;
  actionId: string;
  actionTitle: string;
  entries: HistoryEntry[];
  before: Resources;
  after: Resources;
};
export type GameState = {
  version: 1;
  day: number;
  phase: Phase;
  resources: Resources;
  world: World;
  player: { name: string; color: PlayerColor; privateSupplies: number };
  seed: number;
  promise: { status: PromiseStatus; madeDay?: number; resolvedDay?: number };
  dayEvent: DayEvent;
  history: DayHistory[];
};
export type Action = {
  id: string;
  title: string;
  description: string;
  cost: Pick<Resources, "budget" | "supplies">;
  location: LocationId;
  consequence: string;
  disabledReason?: string;
};
export type DayBrief = {
  title: string;
  event: string;
  privateInfo: string;
  task: string;
  promiseOffer?: string;
};
export type Ending = {
  kind: "success" | "mixed" | "failure";
  title: string;
  description: string;
  personalSuccess: boolean;
  personalText: string;
  highlights: string[];
};
export type LocationInfo = {
  title: string;
  status: string;
  description: string;
  level: number;
};
