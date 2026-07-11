// Composition root for the file-workspace slice: binds a concrete transport
// adapter to the slice's port. This is the ONE feature file allowed to
// import `providers/` — everything else in the slice depends on the port, so
// swapping the adapter (or a fake in tests) touches only this file.
import { fetchProjectFileText, projectFileUrl, projectRawUrl } from '../../providers/registry';
import type { DesignSystemPreviewPort } from './ports';

/** Default binding: the real project-file-text + raw/file URL transport. */
export const designSystemPreviewPort: DesignSystemPreviewPort = {
  fetchProjectFileText,
  projectFileUrl,
  projectRawUrl,
};
