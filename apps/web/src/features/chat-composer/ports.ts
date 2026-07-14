// The chat-composer slice's dependency on transport/DOM globals, expressed as
// an interface it owns. The slice depends on this port, never on `providers/`
// directly; a provider is bound to it in `dependencies.ts`. Tests supply a
// hand-written fake — no global mocking.
import type { InstalledPluginRecord, McpServersResponse } from '@open-design/contracts';
import type { ViewportSize } from './types';

/** Viewport reads the design-toolbox hover-detail positioning needs. */
export interface ViewportPort {
  getViewportSize(): ViewportSize;
}

/** localStorage reads/writes the composer-draft persistence hook needs. */
export interface ComposerDraftPort {
  readComposerDraft(key: string | undefined): string | null;
  writeComposerDraft(key: string | undefined, draft: string): void;
}

/** Transport the working-directory status hook needs: an existence probe for
 *  the live "still there?" check, plus the recent-dirs list read/write. */
export interface WorkingDirPort {
  dirExists(path: string): Promise<boolean>;
  fetchRecentLinkedDirs(): Promise<string[]>;
  pushRecentLinkedDir(dir: string): Promise<string[]>;
}

/** Transport the composer-catalogue hook needs: the external MCP servers +
 *  templates list, and the installed-plugins list. Both routes are read by
 *  ONLY this hook's fetch effects (unlike `patchProject`/`openFolderDialog`,
 *  which stay plain deps-bag callbacks because other clusters also call
 *  them), so each gets a dedicated port method here rather than a bag entry. */
export interface ComposerCataloguePort {
  fetchMcpServers(): Promise<McpServersResponse | null>;
  listInstalledPlugins(): Promise<InstalledPluginRecord[]>;
}
