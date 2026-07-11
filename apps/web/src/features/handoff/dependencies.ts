// Composition root for the hand-off slice: binds concrete transport adapters
// to the slice's ports. This is the ONE feature file allowed to import
// `providers/` — everything else depends on a port, so swapping an adapter
// (or a fake in tests) touches only this file.
import { fetchHostEditors, openProjectInEditor } from '../../providers/registry';
import {
  readPreferredEditor,
  readPreferredFramework,
  writePreferredEditor,
  writePreferredFramework,
} from '../../providers/handoff-preferences';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import type { HandoffClipboardPort, HandoffEditorsPort, HandoffPreferencesPort } from './ports';

/** Default binding: the shared `/api/editors` + `/api/projects/:id/open-in`
 * transport (also used outside this slice). */
export const handoffEditorsPort: HandoffEditorsPort = {
  fetchHostEditors,
  openProjectInEditor,
};

/** Default binding: the `open-design:preferred-editor` /
 * `open-design:handoff-framework` localStorage bridge. */
export const handoffPreferencesPort: HandoffPreferencesPort = {
  readPreferredEditor,
  writePreferredEditor,
  readPreferredFramework,
  writePreferredFramework,
};

/** Default binding: the shared clipboard-write helper (Clipboard API with an
 * `execCommand` fallback). */
export const handoffClipboardPort: HandoffClipboardPort = {
  copy: copyToClipboard,
};
