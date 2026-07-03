/**
 * @module library/sync
 *
 * Reconcile layer: mirrors design systems and agent-produced project
 * deliverables into the Library as referenced assets. Idempotent, best-effort,
 * safe to run on every Library open. Depends on `assets/` and `store/`.
 */

export * from './sync.js';
