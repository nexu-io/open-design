/** @module core/index
 * Foundation barrel: the memory domain's shared change bus and change-event vocabulary.
 * Every sibling subdirectory may import these directly; core itself imports no sibling.
 */

export { memoryEvents } from './events.js';
export type { MemoryChangeKind, MemoryChangeEvent } from './events.js';
