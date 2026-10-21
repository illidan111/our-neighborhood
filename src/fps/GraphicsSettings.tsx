import { GRAPHICS } from './quality';
import type { GraphicsQuality } from './quality';

export default function GraphicsSettings({ quality, scale, onChange }: {
  quality: GraphicsQuality; scale: number;
  onChange: (quality: GraphicsQuality, scale: number) => void;
}) {
  return <div className="graphics-settings">
    <label>Качество графики<select aria-label="Качество графики" value={quality} onChange={event => onChange(event.target.value as GraphicsQuality, scale)}>
      {Object.entries(GRAPHICS).map(([value, profile]) => <option key={value} value={value}>{profile.label}</option>)}
    </select></label>
    <label>Масштаб рендера<select aria-label="Масштаб рендера" value={scale} onChange={event => onChange(quality, Number(event.target.value))}>
      {[0.75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{value * 100}%{value === 1 ? ' · размер окна' : ''}</option>)}
    </select></label>
    <small>Качество меняет тени и дождь. Масштаб 100% сохраняет разрешение окна; 75% снижает чёткость и нагрузку.</small>
  </div>;
}
