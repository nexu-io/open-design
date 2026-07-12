// Feature-local hook for HtmlViewer's export/download modal + toast state
// (the state/toast half of Cluster F of the FileViewer.tsx decomposition
// plan): the image-export and PPTX-export modals' open/format/mode/error
// state, the shared export progress/result toast, and the "export ready"
// toolbar nudge (including its once-per-session `sessionStorage` dedupe).
//
// This is deliberately ONLY the state half. The actual pixel capture
// (`captureExportImageSnapshot`) and its dependents (`handleCopyScreenshot`,
// `openImageExportModal`, `changeImageExportFormat`, `fireImageExportResult`,
// `handleImageExportSave`) reach into the not-yet-extracted srcDoc/URL-load
// transport engine (Cluster L) for `iframeRef`/`useUrlLoadPreview`/the lazy
// srcDoc transport, so they stay in the orchestrator and call this hook's
// returned setters instead of owning their own state. See EXTRACTION-PLAN.md
// Cluster F for the full split rationale.
import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ImageExportFormat } from '../../../runtime/exports';
import { sessionFlagPort as realSessionFlagPort } from '../dependencies';
import type { SessionFlagPort } from '../ports';
import { exportReadyNudgeKey } from '../rules';
import type { ArtifactExportToast } from '../types';

export type PptxExportMode = 'editable' | 'screenshot';

export interface ArtifactExportController {
  imageExportModalOpen: boolean;
  setImageExportModalOpen: Dispatch<SetStateAction<boolean>>;
  imageExportFormat: ImageExportFormat;
  setImageExportFormat: Dispatch<SetStateAction<ImageExportFormat>>;
  imageExportError: string | null;
  setImageExportError: Dispatch<SetStateAction<string | null>>;
  pptxExportModalOpen: boolean;
  setPptxExportModalOpen: Dispatch<SetStateAction<boolean>>;
  pptxExportMode: PptxExportMode;
  setPptxExportMode: Dispatch<SetStateAction<PptxExportMode>>;
  exportToast: ArtifactExportToast | null;
  setExportToast: Dispatch<SetStateAction<ArtifactExportToast | null>>;
  exportReadyNudge: boolean;
  setExportReadyNudge: Dispatch<SetStateAction<boolean>>;
  /** Per-mount dedupe of nudge keys already evaluated this session — see the nudge effect in FileViewer.tsx. */
  exportReadyNudgeSeenRef: MutableRefObject<Set<string>>;
  hasSeenExportReadyNudge: (projectId: string, fileName: string) => boolean;
  markExportReadyNudgeSeen: (projectId: string, fileName: string) => void;
}

export function useArtifactExport(port: SessionFlagPort): ArtifactExportController {
  const [imageExportModalOpen, setImageExportModalOpen] = useState(false);
  const [imageExportFormat, setImageExportFormat] = useState<ImageExportFormat>('png');
  const [imageExportError, setImageExportError] = useState<string | null>(null);
  const [pptxExportModalOpen, setPptxExportModalOpen] = useState(false);
  const [pptxExportMode, setPptxExportMode] = useState<PptxExportMode>('editable');
  const [exportToast, setExportToast] = useState<ArtifactExportToast | null>(null);
  const [exportReadyNudge, setExportReadyNudge] = useState(false);
  const exportReadyNudgeSeenRef = useRef<Set<string>>(new Set());

  const hasSeenExportReadyNudge = (projectId: string, fileName: string): boolean =>
    port.hasFlagSeen(exportReadyNudgeKey(projectId, fileName));

  const markExportReadyNudgeSeen = (projectId: string, fileName: string): void => {
    port.markFlagSeen(exportReadyNudgeKey(projectId, fileName));
  };

  return {
    imageExportModalOpen,
    setImageExportModalOpen,
    imageExportFormat,
    setImageExportFormat,
    imageExportError,
    setImageExportError,
    pptxExportModalOpen,
    setPptxExportModalOpen,
    pptxExportMode,
    setPptxExportMode,
    exportToast,
    setExportToast,
    exportReadyNudge,
    setExportReadyNudge,
    exportReadyNudgeSeenRef,
    hasSeenExportReadyNudge,
    markExportReadyNudgeSeen,
  };
}

export function useWiredArtifactExport(): ArtifactExportController {
  return useArtifactExport(realSessionFlagPort);
}
