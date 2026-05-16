// Capability-detected wrapper around the Electron shell.openPath
// bridge for the Continue in CLI button (#451). On desktop builds the
// preload exposes window.electronAPI.openPath; the renderer hands it
// a *project ID* (not a path) and the desktop main process asks the
// daemon for the canonical resolvedDir before forwarding to
// shell.openPath. The bridge opens the OS file manager at the
// project's working directory (per Electron's contract for directory
// paths; it is NOT a terminal launcher). On the browser fallback,
// the hook reports `web-fallback` so the caller can render a
// manual-instruction toast naming the working directory.
//
// Note that shell.openPath resolves to the empty string on success and
// to a non-empty error string on failure; we treat any non-empty
// string return as `ok: false` so the caller can render the manual
// fallback toast.

import { useMemo } from 'react';

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
    const isElectron =
      typeof window !== 'undefined' &&
      typeof window.electronAPI?.openPath === 'function';

    async function open(projectId: string): Promise<TerminalLaunchResult> {
      if (!isElectron) {
        return { kind: 'web-fallback', ok: true };
      }
      try {
        const out = await window.electronAPI!.openPath!(projectId);
        // Electron's shell.openPath resolves to '' on success.
        const ok = typeof out === 'string' ? out.length === 0 : true;
        return { kind: 'electron', ok };
      } catch {
        return { kind: 'electron', ok: false };
      }
    }

    return { isElectron, open };
  }, []);
}
