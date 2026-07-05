/** @module core/types
 * Shared type aliases for the db module's better-sqlite3 handle and row shapes.
 * Imports no sibling subdirectory; consumed by connection/, schema/, and all caller modules.
 */
import type Database from 'better-sqlite3';

/** Opaque alias for a better-sqlite3 `Database` handle; pass this rather than the class directly so callers stay decoupled from the driver. */
export type SqliteDb = Database.Database;
/** Loosely-typed row shape returned by `db.prepare(…).get()` / `.all()`; prefer narrowing at the call site rather than widening here. */
export type DbRow = Record<string, any>;
/** Plain JSON object with unknown value types — used for serialized column payloads that will be validated before use. */
export type JsonObject = Record<string, unknown>;
/** Discriminated union for the three first-class conversation modes stored in the `conversations.session_mode` column. */
export type ChatSessionMode = 'design' | 'chat' | 'plan';

