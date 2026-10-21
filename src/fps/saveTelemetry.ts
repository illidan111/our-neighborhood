import { saveFPS } from './storage';
import type { FPSState } from './model';

/** Only actual persistence attempts are timed; no timer and no additional storage access. */
export const saveTelemetry = { attempts: 0, failed: 0, totalMs: 0, maxMs: 0 };
export function persistFPS(state: FPSState): boolean {
  const started = performance.now();
  const success = saveFPS(state);
  const duration = performance.now() - started;
  saveTelemetry.attempts++;
  saveTelemetry.failed += Number(!success);
  saveTelemetry.totalMs += duration;
  saveTelemetry.maxMs = Math.max(saveTelemetry.maxMs, duration);
  return success;
}
