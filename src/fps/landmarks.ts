/** World-space metres. Shared by the physical world, journal map and QA routes. */
export type WorldPoint = [number, number, number];

export const LANDMARKS = {
  home: { name: 'Общий дом', position: [-14, 0, 15] as WorldPoint, approach: [-14, 0, 8] as WorldPoint },
  shop: { name: 'Магазин Бориса', position: [-16, 0, -13] as WorldPoint, approach: [-16, 0, -7] as WorldPoint },
  generator: { name: 'Генераторная', position: [12, 0, -14] as WorldPoint, approach: [12, 0, -10] as WorldPoint },
  square: { name: 'Площадь / колокол', position: [0, 0, 0] as WorldPoint, approach: [0, 0, 3] as WorldPoint },
  bridge: { name: 'Мост', position: [24.5, 0, 4] as WorldPoint, approach: [19, 0, 4] as WorldPoint },
} as const;

export const TARGET_POSITIONS = {
  home_supply: [-16, 0.4, 13],
  home_battery: [-11, 0.9, 10.5],
  shop_battery: [-12, 0.9, -8],
  bridge_repair: [19, 0.7, 4],
  day_bell: [0, 1, 1],
  note: [-14, 1.3, 18],
  nina: [-10, 0, 8],
  boris: [-10, 0, -8],
  mira: [10, 0, -11],
} satisfies Record<string, WorldPoint>;

export const WORLD_BOUNDS = { minX: -38, maxX: 38, minZ: -30, maxZ: 38 };
export const PLAYER_SPAWN: WorldPoint = [-14, 1, 15];
