// Composition root for the chat-composer slice: binds a concrete transport/DOM
// adapter to the slice's port. This is the ONE feature file allowed to import
// `providers/` — everything else in the slice depends on the port, so swapping
// the adapter (or a fake in tests) touches only this file.
import { getViewportSize, readComposerDraft, writeComposerDraft } from '../../providers/dom';
import {
  dirExists,
  fetchRecentLinkedDirs,
  pushRecentLinkedDir,
} from '../../providers/registry';
// `fetchMcpServers`/`listPlugins` live in `state/`, not `providers/`, but are
// bound here anyway (like the two providers/ adapters above) so the catalogue
// hook stays port-only — nothing else in the orchestrator calls them directly.
import { fetchMcpServers } from '../../state/mcp';
import { listPlugins } from '../../state/projects';
import type { ComposerCataloguePort, ComposerDraftPort, ViewportPort, WorkingDirPort } from './ports';

/** Default binding: the real browser viewport. */
export const viewportPort: ViewportPort = {
  getViewportSize,
};

/** Default binding: the real localStorage-backed draft persistence. */
export const composerDraftPort: ComposerDraftPort = {
  readComposerDraft,
  writeComposerDraft,
};

/** Default binding: the real registry provider. */
export const workingDirPort: WorkingDirPort = {
  dirExists,
  fetchRecentLinkedDirs,
  pushRecentLinkedDir,
};

/** Default binding: the real MCP + plugins providers. */
export const composerCataloguePort: ComposerCataloguePort = {
  fetchMcpServers,
  listInstalledPlugins: () => listPlugins(),
};
