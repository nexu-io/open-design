// Composition root for the project-view slice: binds the concrete transport
// adapters to the slice's port. This is the ONE feature file allowed to import
// `providers/` — everything else in the slice depends on the port, so swapping
// the adapter (or a fake in tests) touches only this file (ADR 0002).
import {
  fetchProjectRawText,
  postMemoryExtract,
  loadQueuedChatSends,
  saveQueuedChatSends,
} from '../../providers/project-view';
import type { ProjectViewTransportPort } from './ports';

/** Default binding: the real project-raw-text + memory-extract transport. */
export const projectViewTransportPort: ProjectViewTransportPort = {
  readProjectRawText: fetchProjectRawText,
  extractMemory: postMemoryExtract,
  loadQueuedChatSends,
  saveQueuedChatSends,
};
