// Feature-local hook for the "Connect your repo" CTA: owns the GitHub
// connector's tri-state connected flag (undefined = not yet resolved,
// which keeps the CTA neutral/disabled so a fast click can't fire the wrong
// action) and the single handler both the review banner and the chat CTA
// share. Connecting GitHub happens in the Connectors dialog or an external
// OAuth window, neither of which this hook controls, so it re-checks on
// window focus / tab visibility via the injected port's bridge.
import { useCallback, useEffect, useState } from 'react';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface GithubConnectRepoController {
  githubConnected: boolean | undefined;
  handleConnectRepo: () => void;
}

export function useGithubConnectRepo(
  port: ProjectViewTransportPort,
  connectRepoNeeded: boolean,
  buildConnectPrompt: () => string,
  onConnected: (prompt: string) => void,
  onNotConnected: () => void,
): GithubConnectRepoController {
  const [githubConnected, setGithubConnected] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!connectRepoNeeded) {
      setGithubConnected(undefined);
      return;
    }
    let aborted = false;
    const controller = new AbortController();
    const refresh = () => {
      void port.checkGithubConnected({ signal: controller.signal }).then((connected) => {
        if (!aborted) setGithubConnected(connected);
      });
    };
    refresh();
    const unsubscribe = port.subscribeGithubConnectRefreshTriggers(refresh);
    return () => {
      aborted = true;
      controller.abort();
      unsubscribe();
    };
  }, [connectRepoNeeded, port]);

  const handleConnectRepo = useCallback(() => {
    // Status not resolved yet; the CTA is disabled in this window, but guard
    // anyway so a stray call can't route a connected account to Connectors.
    if (githubConnected === undefined) return;
    if (githubConnected) {
      onConnected(buildConnectPrompt());
    } else {
      onNotConnected();
    }
  }, [githubConnected, buildConnectPrompt, onConnected, onNotConnected]);

  return { githubConnected, handleConnectRepo };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredGithubConnectRepo(
  connectRepoNeeded: boolean,
  buildConnectPrompt: () => string,
  onConnected: (prompt: string) => void,
  onNotConnected: () => void,
): GithubConnectRepoController {
  return useGithubConnectRepo(
    projectViewTransportPort,
    connectRepoNeeded,
    buildConnectPrompt,
    onConnected,
    onNotConnected,
  );
}
