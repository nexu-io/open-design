import path from 'node:path';
import { homedir } from 'node:os';

export function expandConfiguredEnv(configuredEnv: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!configuredEnv || typeof configuredEnv !== 'object') return out;
  for (const [key, value] of Object.entries(configuredEnv)) {
    if (typeof value !== 'string') continue;
    out[key] = expandHomePath(value);
  }
  return out;
}

export function expandHomePath(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}
