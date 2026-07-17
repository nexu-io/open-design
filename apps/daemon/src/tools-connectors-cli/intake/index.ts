/** @module intake/index
 * Design-evidence intake: gathers design evidence from a GitHub repository (via the
 * connector read tools or a shallow git clone) or a local folder, producing the
 * evidence snapshot the audit and evidence-writing layers consume. Depends only on core.
 */
export * from './connector-read.js';
export * from './evidence-collect.js';
