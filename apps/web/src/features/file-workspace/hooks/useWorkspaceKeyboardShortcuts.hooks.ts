// Feature-local hook for the file-workspace keyboard-shortcuts cluster:
// browser-style Cmd+T / Cmd+W / Ctrl+Tab / Cmd+1-9 tab navigation, and the
// Cmd+P (mac) / Ctrl+P (win/linux) quick-switcher toggle plus the
// document.body class its overlay styling depends on. Both the capture-phase
// `keydown` subscriptions and the body-class toggle are DOM, so they are
// injected as the slice port (`WorkspaceKeyboardShortcutsPort`); tab
// navigation itself is threaded through as PARAMS — this cluster calls back
// into the not-yet-extracted tab-state cluster rather than reimplementing it.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { isMacPlatform } from '../../../utils/platform';
import { workspaceKeyboardShortcutsPort } from '../dependencies';
import type { WorkspaceKeyboardShortcutsPort } from '../ports';
import { consumeFileWorkspaceTabShortcut } from '../rules';
import { QUICK_SWITCHER_DOCUMENT_CLASS } from '../constants';

export interface WorkspaceKeyboardShortcutsParams {
  workspaceTabIds: string[];
  openWorkspaceTabLauncher: () => void;
  closeActiveWorkspaceTab: () => void;
  activateWorkspaceTabByOffset: (offset: number) => void;
  activateWorkspaceTabByIndex: (index: number) => void;
}

export interface WorkspaceKeyboardShortcutsController {
  quickSwitcherOpen: boolean;
  setQuickSwitcherOpen: Dispatch<SetStateAction<boolean>>;
}

export function useWorkspaceKeyboardShortcuts(
  port: WorkspaceKeyboardShortcutsPort,
  params: WorkspaceKeyboardShortcutsParams,
): WorkspaceKeyboardShortcutsController {
  const {
    workspaceTabIds,
    openWorkspaceTabLauncher,
    closeActiveWorkspaceTab,
    activateWorkspaceTabByOffset,
    activateWorkspaceTabByIndex,
  } = params;
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  // Browser-style shortcuts for the high-frequency Design Files workspace
  // tabs. Capture phase (inside the port) prevents the host browser/Electron
  // shell from opening or closing its own top-level tab before the workspace
  // handles the command. No dependency array: re-subscribes every render so
  // the listener always closes over the freshest tab-navigation callbacks and
  // workspaceTabIds instead of a stale closure.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const key = e.key;
      const lowerKey = key.toLowerCase();
      const primaryModifier = (e.metaKey || e.ctrlKey) && !e.altKey;
      const ctrlWithoutPlatformModifiers = e.ctrlKey && !e.metaKey && !e.altKey;
      const commandOption = e.metaKey && e.altKey && !e.ctrlKey;

      if (primaryModifier && !e.shiftKey && lowerKey === 't') {
        consumeFileWorkspaceTabShortcut(e);
        openWorkspaceTabLauncher();
        return;
      }

      if (primaryModifier && !e.shiftKey && lowerKey === 'w') {
        consumeFileWorkspaceTabShortcut(e);
        closeActiveWorkspaceTab();
        return;
      }

      if (ctrlWithoutPlatformModifiers && key === 'Tab') {
        consumeFileWorkspaceTabShortcut(e);
        activateWorkspaceTabByOffset(e.shiftKey ? -1 : 1);
        return;
      }

      if (
        (ctrlWithoutPlatformModifiers && !e.shiftKey && key === 'PageDown')
        || (commandOption && !e.shiftKey && key === 'ArrowRight')
      ) {
        consumeFileWorkspaceTabShortcut(e);
        activateWorkspaceTabByOffset(1);
        return;
      }

      if (
        (ctrlWithoutPlatformModifiers && !e.shiftKey && key === 'PageUp')
        || (commandOption && !e.shiftKey && key === 'ArrowLeft')
      ) {
        consumeFileWorkspaceTabShortcut(e);
        activateWorkspaceTabByOffset(-1);
        return;
      }

      if (primaryModifier && !e.shiftKey && /^[1-9]$/u.test(key)) {
        consumeFileWorkspaceTabShortcut(e);
        const index = key === '9' ? workspaceTabIds.length - 1 : Number(key) - 1;
        activateWorkspaceTabByIndex(index);
      }
    };
    return port.subscribeCaptureKeyDown(onKeyDown);
  });

  // Cmd+P (mac) / Ctrl+P (win/linux) opens the file palette. Platform-gated so
  // macOS doesn't steal Ctrl+P from native readline ("previous line") in text
  // fields, and win/linux doesn't steal Cmd+P (rare but possible on remapped
  // keyboards).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        if (e.isComposing) return;
        e.preventDefault();
        setQuickSwitcherOpen((open) => !open);
      } else if (e.key === 'Escape' && quickSwitcherOpen) {
        // The palette handles Esc itself, but also catch it here for the
        // case where focus has drifted off the palette input.
        setQuickSwitcherOpen(false);
      }
    };
    return port.subscribeCaptureKeyDown(onKeyDown);
  }, [port, quickSwitcherOpen]);

  useEffect(
    () => port.toggleDocumentBodyClass(QUICK_SWITCHER_DOCUMENT_CLASS, quickSwitcherOpen),
    [port, quickSwitcherOpen],
  );

  return { quickSwitcherOpen, setQuickSwitcherOpen };
}

/**
 * Wirer: binds the real DOM bridges and returns a ready-to-call hook. This is
 * the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredWorkspaceKeyboardShortcuts(
  params: WorkspaceKeyboardShortcutsParams,
): WorkspaceKeyboardShortcutsController {
  return useWorkspaceKeyboardShortcuts(workspaceKeyboardShortcutsPort, params);
}
