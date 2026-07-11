// Feature-local hook for the "Continue in CLI" / "Finalize design package"
// toolbar: the finalize trigger/cancel, the clipboard-prompt + terminal-open
// flow, lifting a finalize error into the shared toast, and the
// ⌘/Ctrl+Shift+K keyboard shortcut. `finalize`, `designMdState`, and
// `terminalLauncher` are owned by existing app-level hooks the orchestrator
// already calls — this hook takes their (narrowed) results as params rather
// than duplicating them, per the vertical-slice pattern's "one owning
// cluster" rule for cross-cutting callbacks.
import { useCallback, useEffect } from 'react';
import { buildClipboardPrompt } from '../../../lib/build-clipboard-prompt';
import { buildContinueInCliToast } from '../../../lib/build-continue-in-cli-toast';
import {
  buildFinalizeCredentialsMissingToast,
  buildFinalizeRequest,
} from '../../../lib/resolve-finalize-request';
import { isMacPlatform } from '../../../utils/platform';
import type { AppConfig } from '../../../types';
import type { DesignMdState } from '../../../hooks/useDesignMdState';
import type { FinalizeProjectState } from '../../../hooks/useFinalizeProject';
import type { TerminalLauncher } from '../../../hooks/useTerminalLaunch';
import { isContinueInCliShortcut } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface ProjectFinalizeToast {
  message: string;
  details: string | null;
  code?: string | null;
}

export interface ProjectFinalizeActionsController {
  handleFinalize: () => void;
  handleCancelFinalize: () => void;
  handleContinueInCli: () => Promise<void>;
}

export function useProjectFinalizeActions(
  port: ProjectViewTransportPort,
  config: AppConfig,
  finalize: Pick<FinalizeProjectState, 'trigger' | 'cancel' | 'error'>,
  designMdState: Pick<
    DesignMdState,
    'generatedAt' | 'transcriptMessageCount' | 'designSystemId' | 'currentArtifact' | 'exists' | 'refresh'
  >,
  terminalLauncher: Pick<TerminalLauncher, 'open'>,
  project: { id: string; name: string },
  projectDir: string | null,
  onToast: (toast: ProjectFinalizeToast) => void,
): ProjectFinalizeActionsController {
  const handleFinalize = useCallback(() => {
    const request = buildFinalizeRequest(config);
    if (!request) {
      onToast(buildFinalizeCredentialsMissingToast(config));
      return;
    }
    void finalize.trigger(request).then((result) => {
      if (result) void designMdState.refresh();
    });
  }, [config, designMdState, finalize, onToast]);

  const handleCancelFinalize = useCallback(() => {
    finalize.cancel();
  }, [finalize]);

  const handleContinueInCli = useCallback(async () => {
    if (!projectDir) {
      onToast({
        message: 'Working directory unavailable. Update the daemon to enable Continue in CLI.',
        details: null,
      });
      return;
    }
    const prompt = buildClipboardPrompt({
      project,
      designMdState: {
        generatedAt: designMdState.generatedAt,
        transcriptMessageCount: designMdState.transcriptMessageCount,
        designSystemId: designMdState.designSystemId,
        currentArtifact: designMdState.currentArtifact,
      },
      projectDir,
    });
    const copied = await port.copyTextToClipboard(prompt);
    if (!copied) {
      // Clipboard write failed in both the canonical and execCommand
      // fallback paths (locked clipboard / insecure context). Surface
      // the prompt body in the toast so the user can manually
      // select-and-copy. Do not open the folder — the user has nothing
      // to paste yet.
      onToast({
        message: 'Clipboard unavailable. Copy this prompt manually, then run `claude` at the working directory.',
        details: `Working directory: ${projectDir}`,
        code: prompt,
      });
      return;
    }
    const launched = await terminalLauncher.open(project.id);
    onToast(buildContinueInCliToast(projectDir, launched));
  }, [
    designMdState.currentArtifact,
    designMdState.designSystemId,
    designMdState.generatedAt,
    designMdState.transcriptMessageCount,
    onToast,
    port,
    project,
    projectDir,
    terminalLauncher,
  ]);

  // Lift finalize errors into the shared project-actions toast so the user
  // sees both the daemon's category message and any upstream detail.
  useEffect(() => {
    if (finalize.error) {
      onToast({ message: finalize.error.message, details: finalize.error.details });
    }
  }, [finalize.error, onToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isContinueInCliShortcut(event, isMacPlatform())) return;
      if (!designMdState.exists) return;
      event.preventDefault();
      void handleContinueInCli();
    };
    return port.subscribeCapturedKeyDown(onKeyDown);
  }, [designMdState.exists, handleContinueInCli, port]);

  return { handleFinalize, handleCancelFinalize, handleContinueInCli };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredProjectFinalizeActions(
  config: AppConfig,
  finalize: Pick<FinalizeProjectState, 'trigger' | 'cancel' | 'error'>,
  designMdState: Pick<
    DesignMdState,
    'generatedAt' | 'transcriptMessageCount' | 'designSystemId' | 'currentArtifact' | 'exists' | 'refresh'
  >,
  terminalLauncher: Pick<TerminalLauncher, 'open'>,
  project: { id: string; name: string },
  projectDir: string | null,
  onToast: (toast: ProjectFinalizeToast) => void,
): ProjectFinalizeActionsController {
  return useProjectFinalizeActions(
    projectViewTransportPort,
    config,
    finalize,
    designMdState,
    terminalLauncher,
    project,
    projectDir,
    onToast,
  );
}
