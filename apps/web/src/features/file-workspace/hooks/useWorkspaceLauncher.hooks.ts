// Feature-local hook for the file-workspace "+" tab launcher: the launcher
// open/toast state and the launcher's create-new action wiring (file search,
// new sketch/document/terminal/browser/side-chat). `createTerminal` is the
// existing `state/projects` helper called directly (not wrapped in a slice
// port) — it is a project-lifecycle action, not a file-workspace transport
// concern, and this mirrors how the pre-extraction orchestrator already
// called it directly rather than through `providers/registry`.
import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { createTerminal } from '../../../state/projects';
import { buildLauncherActions, type LauncherAction, type LauncherContext } from '../../../components/workspace/tab-launcher';
import type { TranslateFn } from '../types';

export interface UseWorkspaceLauncherParams {
  projectId: string;
  openFile: (name: string) => void;
  openBrowserTab: () => void;
  startNewSketch: () => Promise<void>;
  createMarkdownDocument: () => Promise<void>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  t: TranslateFn;
}

export interface WorkspaceLauncherController {
  launcherOpen: boolean;
  setLauncherOpen: Dispatch<SetStateAction<boolean>>;
  launcherToast: string | null;
  setLauncherToast: Dispatch<SetStateAction<string | null>>;
  launcherBtnRef: RefObject<HTMLButtonElement>;
  launcherContext: LauncherContext;
  launcherActions: LauncherAction[];
  openWorkspaceTabLauncher: () => void;
}

export function useWorkspaceLauncher(params: UseWorkspaceLauncherParams): WorkspaceLauncherController {
  const {
    projectId,
    openFile,
    openBrowserTab,
    startNewSketch,
    createMarkdownDocument,
    fileInputRef,
    t,
  } = params;

  // "+" launcher (file search + registry-driven create-new actions:
  // Side Chat, Terminal, Browser).
  const [launcherOpen, setLauncherOpen] = useState(false);
  // Transient feedback when a launcher "create" action (e.g. New Terminal)
  // fails on the daemon side, so the click is never a silent no-op.
  const [launcherToast, setLauncherToast] = useState<string | null>(null);
  const launcherBtnRef = useRef<HTMLButtonElement | null>(null);

  function openWorkspaceTabLauncher() {
    setLauncherOpen(true);
    launcherBtnRef.current?.focus();
  }

  // The "+" launcher's create-new actions come from the registry. `openTab`
  // reuses the same tab-state path as opening a file so a new terminal:<id>
  // tab is focused; `createBrowser` opens an embedded browser tab.
  // Built fresh each render (not memoized): `createBrowser` closes over
  // `openBrowserTab`, which reads the live `browserTabs` state — memoizing it
  // would capture a stale closure and make every "New Browser" click overwrite
  // the same single tab. The terminal action routes through `openFile`
  // (ref-based upstream), so freshness here is cheap and only matters while
  // the launcher is open.
  const launcherContext: LauncherContext = {
    projectId,
    openTab: openFile,
    // Browser is owned by this branch's DesignBrowserPanel: spin up a browser
    // tab synchronously (no daemon round-trip) and let the launcher close.
    createBrowser: () => openBrowserTab(),
    createSketch: () => void startNewSketch(),
    createDocument: () => void createMarkdownDocument(),
    uploadDesignFiles: () => fileInputRef.current?.click(),
    // Terminal needs only the project id — spawn the PTY here and hand the
    // resulting session id back so the launcher opens a terminal:<id> tab.
    // Surface a toast when the daemon can't start one (e.g. node-pty not
    // compiled) instead of silently no-opping the launcher action.
    createTerminal: async () => {
      const term = await createTerminal(projectId);
      if (!term) {
        setLauncherToast(t('workspace.terminalStartFailed'));
        return null;
      }
      return term.id;
    },
  };
  const launcherActions = buildLauncherActions(launcherContext);

  return {
    launcherOpen,
    setLauncherOpen,
    launcherToast,
    setLauncherToast,
    launcherBtnRef,
    launcherContext,
    launcherActions,
    openWorkspaceTabLauncher,
  };
}
