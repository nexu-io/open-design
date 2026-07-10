// The project-view slice's dependency on transport, expressed as an interface it
// owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks (ADR 0002).
import type { ExtractMemoryRequest } from '@open-design/contracts';

/** Transport the project-view orchestrator needs from the outside world. */
export interface ProjectViewTransportPort {
  /**
   * Read a project file's raw text. Best-effort: resolves `null` on a non-ok
   * response or a network error so the caller can cache the miss.
   */
  readProjectRawText(projectId: string, filePath: string): Promise<string | null>;
  /**
   * Fire a per-turn memory extraction. Best-effort: never rejects, so a failed
   * request cannot block or break the chat.
   */
  extractMemory(request: ExtractMemoryRequest): Promise<void>;
}
