/**
 * @module library/store
 *
 * Pure SQLite persistence for the Library: schema migration plus asset, source,
 * enrichment-task, and extension-token CRUD. Depends only on `core/` for shared
 * record types; owns no orchestration, filesystem, or HTTP concerns.
 */

export * from './store.js';
