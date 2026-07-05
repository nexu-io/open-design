// @ts-nocheck
/** @module cli/system
 * Barrel for the system domain: re-exports daemon lifecycle, config, AMR wallet, and status handlers to the root dispatcher.
 * System commands are the headless ops surface: start/stop the daemon, read/write app config, probe AMR wallet, and inspect health.
 */
export * from './amr.js';
export * from './config.js';
export * from './daemon.js';
export * from './status.js';
