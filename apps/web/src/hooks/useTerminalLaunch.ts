// Capability-detected wrapper around the desktop openPath
// bridge for the Continue in CLI button (#451). On desktop builds the
// native runtime exposes openPath; the renderer hands it
// a *project ID* (not a path) and the desktop main process asks the
// daemon for the canonical resolvedDir before forwarding to
// the OS opener. The bridge opens the file manager at the
// project's working directory (per native shell contract for directory
// paths; it is NOT a terminal launcher). On the browser fallback,
// the hook reports `web-fallback` so the caller can render a
// manual-instruction toast naming the working directory.
//
// Note that shell.openPath resolves to the empty string on success and
// to a non-empty error string on failure; we treat any non-empty
// string return as `ok: false` so the caller can render the manual
// fallback toast.

import { useMemo } from 'react';

import { resolveDesktopBridge } from '../native/desktop-bridge';

export interface TerminalLaunchResult {
  kind: 'electron' | 'web-fallback';
  ok: boolean;
}

export interface TerminalLauncher {
  isElectron: boolean;
  open: (projectId: string) => Promise<TerminalLaunchResult>;
}

export function useTerminalLaunch(): TerminalLauncher {
  return useMemo<TerminalLauncher>(() => {
    const desktopBridge = resolveDesktopBridge();
    const openPath = desktopBridge?.openPath;
    const isElectron = openPath != null;

    async function open(projectId: string): Promise<TerminalLaunchResult> {
      if (openPath == null) {
        return { kind: 'web-fallback', ok: true };
      }
      try {
        const out = await openPath(projectId);
        // Native openPath bridges resolve to '' on success.
        const ok = typeof out === 'string' ? out.length === 0 : true;
        // Keep the existing public result label stable while Tauri is
        // introduced behind the same desktop capability.
        return { kind: 'electron', ok };
      } catch {
        return { kind: 'electron', ok: false };
      }
    }

    return { isElectron, open };
  }, []);
}
