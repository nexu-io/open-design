/**
 * @module library/core
 *
 * Foundation kernel of the Library domain: shared record types plus pure media
 * and path primitives. Everything under `library/` may import from here; this
 * layer imports no sibling subdirectory.
 */

export * from './types.js';
export * from './mime.js';
export * from './paths.js';
