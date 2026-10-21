export type GraphicsQuality = 'low' | 'balanced' | 'high';

export const GRAPHICS = {
  low: { label: 'Низкое', shadowMap: 0, rainCount: 150 },
  balanced: { label: 'Среднее', shadowMap: 1024, rainCount: 350 },
  high: { label: 'Высокое', shadowMap: 2048, rainCount: 650 },
} as const;

export function graphicsQuality(value: unknown): GraphicsQuality {
  return value === 'low' || value === 'high' ? value : 'balanced';
}

export function renderScale(value: unknown): number {
  return value === 0.75 || value === 1.25 || value === 1.5 ? value : 1;
}
