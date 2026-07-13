// Capability-detected wrapper around the Open Design host shell.openPath
// bridge for the Continue in CLI button (#451). On desktop builds the
// host bridge exposes shell.openPath; the renderer hands it
// a *project ID* (not a path) and the desktop main process asks the
// daemon for the canonical resolvedDir before forwarding to
// shell.openPath. The bridge opens the OS file manager at the
// project's working directory (per Electron's contract for directory
// paths; it is NOT a terminal launcher). On the browser fallback,
// the hook reports `web-fallback` so the caller can render a
// manual-instruction toast naming the working directory.

import { useMemo } from 'react';
import {
  isOpenDesignHostAvailable,
  openHostProjectPath,
} from '@open-design/host';

export interface TerminalLaunchResult {
  kind: 'host' | 'web-fallback';
  ok: boolean;
}

export interface TerminalLauncher {
  isHost: boolean;
  open: (projectId: string) => Promise<TerminalLaunchResult>;
}

export function useTerminalLaunch(): TerminalLauncher {
  return useMemo<TerminalLauncher>(() => {
    const isHost = isOpenDesignHostAvailable();

    async function open(projectId: string): Promise<TerminalLaunchResult> {
      if (!isHost) {
        return { kind: 'web-fallback', ok: true };
      }
      try {
        const result = await openHostProjectPath(projectId);
        return { kind: 'host', ok: result.ok };
      } catch {
        return { kind: 'host', ok: false };
      }
    }

    return { isHost, open };
  }, []);
}
