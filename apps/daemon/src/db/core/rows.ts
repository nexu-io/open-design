/** @module core/rows
 * Helpers that normalize raw better-sqlite3 query results to typed `DbRow` values.
 * Imports no sibling subdirectory; depends only on `core/types`.
 */
import type { DbRow } from './types.js';

/**
 * Narrow a single `db.prepare(…).get()` result to `DbRow | null`.
 * Returns `null` for falsy or non-object returns so callers can distinguish "no row" from an empty row.
 * @param value - raw return from better-sqlite3's `.get()`
 */
export function row(value: unknown): DbRow | null {
  return value && typeof value === 'object' ? value as DbRow : null;
}

/**
 * Map a `db.prepare(…).all()` result array to `DbRow[]`, replacing any falsy or non-object
 * entries with an empty object so the array length is always preserved.
 * @param value - raw return from better-sqlite3's `.all()`
 */
export function rows(value: unknown[]): DbRow[] {
  return value.map((item) => row(item) ?? {});
}

