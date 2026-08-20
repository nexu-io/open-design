// Agent-tool registry PORT — a pure interface describing the boundary reviewers
// evaluate now. This is TYPES ONLY. The IMPLEMENTATION is slice 2: it lives in a
// new standalone `packages/agent-tools` package, is persisted in the daemon's
// SQLite store under the resolved data root, and MUST NOT import `apps/*` or any
// project-specific code (enforced by a `check-cross-app-imports.ts`-style guard
// wired into `pnpm guard`). Contracts stays runtime-free — nothing here has a body.

import type { AgentToolDescriptor, AgentToolName } from './descriptor.js';
import type {
  AgentToolManifest,
  AgentToolSearchQuery,
  AgentToolSearchResult,
} from './manifest.js';

/**
 * The port the rest of the system depends on to declare, look up, list, and
 * search capability tools. Methods are async because the backing store is
 * SQLite (see the RFC "Registry persistence"); the port itself carries no
 * transport, no persistence detail, and no app/project coupling.
 */
export interface AgentToolRegistry {
  /** Declare (or replace by `name`) a tool. Idempotent on the descriptor name. */
  register(descriptor: AgentToolDescriptor): Promise<void>;
  /** Look up one tool by its stable name; `undefined` if not registered. */
  get(name: AgentToolName): Promise<AgentToolDescriptor | undefined>;
  /** Assemble the full advertised catalog for a run (the `tools/list` analog). */
  manifest(runId: string): Promise<AgentToolManifest>;
  /** Progressive/paged discovery over a large registry (the `tools/search` analog). */
  search(query: AgentToolSearchQuery): Promise<AgentToolSearchResult>;
}
