/**
 * @module codex/core
 *
 * Foundation kernel for the codex domain: pure primitives every sibling
 * concern may import directly, with no dependency on any sibling. Currently
 * this is the shared Codex home-directory resolver used by the pets and
 * rollout concerns.
 */

export { defaultCodexHome } from './codex-home.js';
