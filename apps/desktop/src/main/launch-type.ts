import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { uptime } from 'node:os';

export interface LaunchMarker { version: string; lastRunAt: number; }
export const COLD_IDLE_MS = 30 * 60_000;

/** Operational heuristic, not a statement about OS disk/page caches. */
export function classifyLaunchType(input: {
  version: string; now: number; osUptimeSeconds: number; marker: LaunchMarker | null;
}): 'cold' | 'warm' {
  const { marker, now, version, osUptimeSeconds } = input;
  if (!marker || marker.version !== version || !Number.isFinite(marker.lastRunAt)
    || marker.lastRunAt > now || !Number.isFinite(osUptimeSeconds) || osUptimeSeconds < 0
    || now - marker.lastRunAt > osUptimeSeconds * 1000
    || now - marker.lastRunAt > COLD_IDLE_MS) return 'cold';
  return 'warm';
}

export function beginLaunchMarker(userData: string, version: string): {
  launchType: 'cold' | 'warm'; end(): void;
} {
  const path = join(userData, 'stability-launch.json');
  let marker: LaunchMarker | null = null;
  try { marker = JSON.parse(readFileSync(path, 'utf8')) as LaunchMarker; } catch { /* First run or damaged marker. */ }
  const now = Date.now();
  const launchType = classifyLaunchType({ version, now, osUptimeSeconds: uptime(), marker });
  const stamp = () => {
    try {
      mkdirSync(userData, { recursive: true });
      writeFileSync(path, JSON.stringify({ version, lastRunAt: Date.now() }), { mode: 0o600 });
    } catch { /* Telemetry metadata cannot prevent launching/quitting. */ }
  };
  stamp(); // Crash fallback; normal quit updates the last-ended timestamp.
  return { launchType, end: stamp };
}
