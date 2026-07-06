// Public API of the memory slice. Consumers (currently MemorySection) import
// only from here — never from the slice's internal files. Barrels mark
// boundaries: this is the slice boundary.
export type { MemoryConfigPort } from './ports';
export type { MemoryConfigFlagKey } from './rules';
export { enabledPatch, singleFlagPatch } from './rules';
export { memoryConfigPort } from './dependencies';
