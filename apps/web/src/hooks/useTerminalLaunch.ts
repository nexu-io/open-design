// Capability-detected wrapper around the Open Design host shell.openPath
// bridge for the Continue in CLI button (#451). On desktop builds the
// host bridge exposes shell.openPath; the Tauri migration fallback uses
// the same project-ID-only contract through the desktop bridge.
// a *project ID* (not a path) and the desktop main process asks the
// daemon for the canonical resolvedDir before forwarding to
// the OS opener. The bridge opens the file manager at the
// project's working directory (per native shell contract for directory
// paths; it is NOT a terminal launcher). On the browser fallback,
// the hook reports `web-fallback` so the caller can render a
// manual-instruction toast naming the working directory.

import { useMemo } from 'react';
import {
  isOpenDesignHostAvailable,
  openHostProjectPath,
} from '@open-design/host';

import { resolveDesktopBridge } from '../native/desktop-bridge';

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
    const desktopBridge = resolveDesktopBridge();
    const isHost = isOpenDesignHostAvailable() || desktopBridge?.openPath != null;

    async function open(projectId: string): Promise<TerminalLaunchResult> {
      if (!isHost) {
        return { kind: 'web-fallback', ok: true };
      }
      try {
        const result =
          desktopBridge?.openPath == null
            ? await openHostProjectPath(projectId)
            : { ok: (await desktopBridge.openPath(projectId)).length === 0 };
        return { kind: 'host', ok: result.ok };
      } catch {
        return { kind: 'host', ok: false };
      }
    }

    return { isHost, open };
  }, []);
}
