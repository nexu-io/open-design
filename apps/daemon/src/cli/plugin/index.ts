// @ts-nocheck
/** @module cli/plugin
 * Plugin lifecycle — discovery, install, verify/simulate, publish/GitHub workflows, marketplace catalogs.
 * Re-exports all plugin subcommand handlers + GitHub helpers for flat CLI routing.
 */
export * from './dev.js';
export * from './github.js';
export * from './manage.js';
export * from './marketplace.js';
export * from './publish.js';
export * from './verify.js';
