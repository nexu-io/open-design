// Feature-local hook for the design-files-panel side state: the nav-state
// ref reset-on-projectId-change pattern (mirrors `useProjectFolders`'
// render-time reset) and the "Select from library" picker's open state +
// apply-asset transport, reached through `DesignFilesLibraryPort` rather
// than importing `providers/registry` directly.
import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { LibraryAsset } from '@open-design/contracts';
import type { DesignFilesNavState } from '../../../components/DesignFilesPanel';
import { designFilesLibraryPort } from '../dependencies';
import type { DesignFilesLibraryPort } from '../ports';
import { createDefaultDesignFilesNavState } from '../rules';

export interface UseDesignFilesPanelStateParams {
  projectId: string;
  uploadDir: string;
  onRefreshFiles: () => Promise<void> | void;
  openFile: (name: string) => void;
}

export interface DesignFilesPanelStateController {
  designFilesNavRef: MutableRefObject<DesignFilesNavState>;
  onDesignFilesNavStateChange: (state: DesignFilesNavState) => void;
  showLibraryPicker: boolean;
  setShowLibraryPicker: Dispatch<SetStateAction<boolean>>;
  handleLibraryPickerConfirm: (assets: LibraryAsset[]) => Promise<void>;
}

export function useDesignFilesPanelState(
  port: DesignFilesLibraryPort,
  params: UseDesignFilesPanelStateParams,
): DesignFilesPanelStateController {
  const { projectId, uploadDir, onRefreshFiles, openFile } = params;

  const designFilesNavProjectIdRef = useRef(projectId);
  const designFilesNavRef = useRef<DesignFilesNavState>(createDefaultDesignFilesNavState());
  if (designFilesNavProjectIdRef.current !== projectId) {
    designFilesNavProjectIdRef.current = projectId;
    designFilesNavRef.current = createDefaultDesignFilesNavState();
  }
  function onDesignFilesNavStateChange(state: DesignFilesNavState) {
    designFilesNavRef.current = state;
  }

  const [showLibraryPicker, setShowLibraryPicker] = useState(false);

  // Copy each picked asset into the project's design files (under the
  // folder currently in view, if any). Apply records a provenance back-link
  // so the registry knows the asset was consumed. For element-pick captures,
  // `includeElement` also drops the captured markup as a companion
  // `.element.html` file so the element's text lands in Design Files
  // alongside its screenshot.
  async function handleLibraryPickerConfirm(assets: LibraryAsset[]) {
    const dir = uploadDir || undefined;
    let lastRelPath: string | null = null;
    for (const asset of assets) {
      const res = await port.applyLibraryAsset(asset.id, projectId, dir, { includeElement: true });
      if (res?.relPath) lastRelPath = res.relPath;
      if (res?.elementRelPath) lastRelPath = res.elementRelPath;
    }
    await onRefreshFiles();
    if (lastRelPath) openFile(lastRelPath);
  }

  return {
    designFilesNavRef,
    onDesignFilesNavStateChange,
    showLibraryPicker,
    setShowLibraryPicker,
    handleLibraryPickerConfirm,
  };
}

/**
 * Wirer: binds the real "apply library asset" transport and returns a
 * ready-to-call hook. This is the default the orchestrator injects; swap it
 * via the component prop in tests.
 */
export function useWiredDesignFilesPanelState(
  params: UseDesignFilesPanelStateParams,
): DesignFilesPanelStateController {
  return useDesignFilesPanelState(designFilesLibraryPort, params);
}
