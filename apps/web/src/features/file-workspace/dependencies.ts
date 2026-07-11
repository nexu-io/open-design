// Composition root for the file-workspace slice: binds a concrete transport
// adapter to the slice's port. This is the ONE feature file allowed to
// import `providers/` — everything else in the slice depends on the port, so
// swapping the adapter (or a fake in tests) touches only this file.
import {
  deleteDesignSystemDraft,
  fetchProjectFileText,
  projectFileUrl,
  projectRawUrl,
  startDesignSystemTokenContractRebuildJob,
  updateDesignSystemDraft,
  writeProjectTextFile,
} from '../../providers/registry';
import { confirmDialog } from '../../providers/dom';
import { finalizeBrandProject } from '../../runtime/brands';
import { downloadDesignSystemArchive, downloadProjectArchive } from '../../runtime/exports';
import { deleteBrandImage, deleteBrandLogo, readDesignMd, updateBrandColor } from '../../runtime/kit-edit';
import type { DesignSystemKitActionsPort, DesignSystemPreviewPort } from './ports';

/** Default binding: the real project-file-text + raw/file URL transport. */
export const designSystemPreviewPort: DesignSystemPreviewPort = {
  fetchProjectFileText,
  projectFileUrl,
  projectRawUrl,
};

/** Default binding: the real design-system kit-action transport + the
 *  `window.confirm` DOM bridge. */
export const designSystemKitActionsPort: DesignSystemKitActionsPort = {
  writeProjectTextFile,
  updateDesignSystemDraft,
  fetchProjectFileText,
  readDesignMd,
  finalizeBrandProject,
  startDesignSystemTokenContractRebuildJob,
  downloadProjectArchive,
  downloadDesignSystemArchive,
  deleteDesignSystemDraft,
  updateBrandColor,
  deleteBrandLogo,
  deleteBrandImage,
  confirmDelete: confirmDialog,
};
