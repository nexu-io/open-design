// Public API of the memory slice. Consumers (the MemorySection orchestrator,
// which lives outside the slice) import ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the slice boundary, and
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import that
// reaches past it (ADR 0002).

// Config cluster public API.
export type { MemoryConfigPort } from './ports';
export type { MemoryConfigFlagKey } from './rules';
export { enabledPatch, singleFlagPatch, visibleExtractionsFor } from './rules';
export { memoryConfigPort } from './dependencies';

// Dumb components the orchestrator composes.
export { MemoryHowPanel } from './components/MemoryHowPanel';
export { MemoryAdvancedModal } from './components/MemoryAdvancedModal';
export { MemoryList } from './components/MemoryList';
export { MemoryManualEditor } from './components/MemoryManualEditor';
export { MemoryConnectedPanel } from './components/MemoryConnectedPanel';

// Hooks (with their controller/coordination types) the orchestrator wires.
export {
  useWiredMemoryConfig,
  type MemoryConfigController,
} from './hooks/useMemoryConfig.hooks';
export {
  useMemoryFlash,
  type MemoryFlashController,
} from './hooks/useMemoryFlash.hooks';
export {
  useWiredMemoryEntries,
  type MemoryEntriesController,
  type MemoryEntriesCoordination,
} from './hooks/useMemoryEntries.hooks';
export {
  useWiredMemoryExtractions,
  type MemoryExtractionsController,
} from './hooks/useMemoryExtractions.hooks';
export {
  useWiredMemoryConnectors,
  type MemoryConnectorsController,
  type MemoryConnectorsCoordination,
} from './hooks/useMemoryConnectors.hooks';
export {
  useMemoryNavigation,
  type MemoryNavigationController,
} from './hooks/useMemoryNavigation.hooks';

// UI types and pure formatters the orchestrator reads.
export type { MemorySectionProps } from './types';
export { memorySourceTabs } from './formatters';
