// Feature-local hook for the composer's attachment/upload cluster: the
// in-flight flag, the last error message, the drag-over highlight, AND the
// staged-attachment list + its order-assignment ref. The list lives here
// (rather than its own hook) because every consumer already treats it as
// part of this same cluster — see `UploadActionDeps` in attachment-actions.ts,
// whose own docblock calls this "the attachment/upload cluster's deps bag"
// and bundles `staged`/`setStaged`/`nextAttachmentOrderRef` with these
// setters as one unit. Pure UI/list state - no port, no transport - the
// actual upload transport calls stay in the orchestrator
// (uploadProjectFiles / applyLibraryAsset) and just call the setters this
// hook returns, same shape as useComposerModals.
import { useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatAttachment } from '../../../types';

export interface ComposerUploadController {
  uploading: boolean;
  setUploading: (value: boolean) => void;
  uploadError: string | null;
  setUploadError: (value: string | null) => void;
  dragActive: boolean;
  setDragActive: (value: boolean) => void;
  staged: ChatAttachment[];
  setStaged: Dispatch<SetStateAction<ChatAttachment[]>>;
  nextAttachmentOrderRef: MutableRefObject<number>;
}

export function useComposerUpload(): ComposerUploadController {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [staged, setStaged] = useState<ChatAttachment[]>([]);
  const nextAttachmentOrderRef = useRef(0);

  return {
    uploading,
    setUploading,
    uploadError,
    setUploadError,
    dragActive,
    setDragActive,
    staged,
    setStaged,
    nextAttachmentOrderRef,
  };
}
