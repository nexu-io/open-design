/**
 * @module migration
 *
 * Barrel for daemon data/version migration lifecycle: legacy-data-migrator
 * (legacy data-directory layout migration), od-next-default-on (one-shot
 * adoption of the OD Next default route), and update-apply-observations
 * (installer apply-across-version-upgrade telemetry).
 */
export * from './legacy-data-migrator.js';
export * from './od-next-default-on.js';
export * from './update-apply-observations.js';
