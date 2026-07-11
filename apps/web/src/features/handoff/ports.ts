// The hand-off slice's dependency on the outside world, expressed as
// interfaces it owns. The slice depends on these ports, never on `providers/`
// directly; a concrete adapter is bound to each in `dependencies.ts`. Tests
// supply hand-written fakes — no global `fetch`/`localStorage` mocking, no
// module-path mocks.
import type { HostEditorId, HostEditorsResponse, OpenProjectInEditorResponse } from '@open-design/contracts';

/** Transport the editors cluster needs: list installed editors, launch one. */
export interface HandoffEditorsPort {
  fetchHostEditors(): Promise<HostEditorsResponse>;
  openProjectInEditor(
    projectId: string,
    editorId: HostEditorId,
  ): Promise<OpenProjectInEditorResponse>;
}

/** The remembered-picks bridge (localStorage), read/written by the editors
 * and CLI clusters. */
export interface HandoffPreferencesPort {
  readPreferredEditor(): HostEditorId | null;
  writePreferredEditor(id: HostEditorId): void;
  readPreferredFramework(): string;
  writePreferredFramework(id: string): void;
}

/** Clipboard write for the CLI-prompt and project-path copy actions. */
export interface HandoffClipboardPort {
  copy(text: string): Promise<boolean>;
}
