import type { JsonObject } from './types.js';
import { MAX_TIMEOUT_MS } from './constants.js';

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
export function resolveAcpTimeoutMs(env: NodeJS.ProcessEnv, fallbackMs: number): number {
  const raw = Number(env.OD_ACP_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return fallbackMs;
  return Math.min(MAX_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
}
export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' ? value as JsonObject : null;
}
export function acpValueKind(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}
export function objectKeys(value: unknown): string[] {
  const obj = asObject(value);
  return obj ? Object.keys(obj).sort() : [];
}
export function extractAcpTextValue(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (Array.isArray(value)) {
    const text = value
      .map((item) => extractAcpTextValue(item, depth + 1))
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join('');
    return text.length > 0 ? text : null;
  }
  const obj = asObject(value);
  if (!obj) return null;
  for (const key of [
    'text',
    'delta',
    'content',
    'message',
    'output',
    'answer',
    'value',
    'body',
    'parts',
    'choices',
  ]) {
    const text = extractAcpTextValue(obj[key], depth + 1);
    if (text) return text;
  }
  return null;
}
export function extractAcpUpdateText(update: JsonObject): string | null {
  for (const key of [
    'content',
    'text',
    'delta',
    'message',
    'output',
    'answer',
    'value',
    'body',
    'parts',
    'choices',
  ]) {
    const text = extractAcpTextValue(update[key]);
    if (text) return text;
  }
  return null;
}
