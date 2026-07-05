/** @module core/json
 * Pure JSON parsing utility that converts SQLite TEXT columns to JS values without throwing.
 * Imports no sibling subdirectory.
 */

/**
 * Safely parse a SQLite TEXT column value to a JS value.
 * Returns `undefined` instead of throwing for non-string, empty, or malformed JSON —
 * callers should narrow the return type before use.
 * @param s - raw column value as stored in SQLite (typically `string | null`)
 * @returns parsed value, or `undefined` if the input is absent or unparseable
 */
export function parseJsonOrUndef(s: unknown): any {
  if (typeof s !== 'string' || !s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

