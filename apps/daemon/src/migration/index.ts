/**
 * @module migration
 *
 * Barrel for daemon data/version migration lifecycle: legacy-data-migrator
 * (legacy data-directory layout migration) and update-apply-observations
 * (installer apply-across-version-upgrade telemetry).
 */
export * from './legacy-data-migrator.js';
export * from './update-apply-observations.js';
