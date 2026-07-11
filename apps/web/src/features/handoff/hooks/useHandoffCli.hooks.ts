// Feature-local hook for the CLI tab: the merged agent-CLI catalogue, the
// framework picker, and the two clipboard actions (a CLI hand-off prompt, the
// raw project path). Its transport dependencies (clipboard write, the
// remembered-framework bridge) are INJECTED as slice ports; `fireHandoff` /
// `setError` / `clearError` and the project identity are injected
// coordination from the orchestrator and the shared error hook.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentInfo } from '@open-design/contracts';
import { handoffTargetIdToTracking } from '@open-design/contracts/analytics';
import { useT } from '../../../i18n';
import type { HandoffClipboardPort, HandoffPreferencesPort } from '../ports';
import { handoffClipboardPort, handoffPreferencesPort } from '../dependencies';
import { buildCliHandoffPrompt, cliDisplayName, frameworkPromptLabel, mergeCliTargets } from '../rules';
import { DEFAULT_FRAMEWORK, FRAMEWORKS, PROJECT_PATH_COPY_ID } from '../constants';
import type { CliTarget, FireHandoff, FrameworkId, FrameworkTarget } from '../types';

/** How long the "copied" pill stays visible on a CLI/path copy action. */
const COPIED_FLASH_MS = 1800;

export interface UseHandoffCliOptions {
  fireHandoff: FireHandoff;
  projectId: string;
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  setError: (message: string | null) => void;
  clearError: () => void;
}

export interface HandoffCliController {
  cliTargets: CliTarget[];
  availableCliTargets: CliTarget[];
  unavailableCliTargets: CliTarget[];
  selectedFramework: FrameworkTarget;
  copyBusy: string | null;
  copiedCliId: string | null;
  copyCliPrompt: (cli: CliTarget) => Promise<void>;
  copyProjectPath: () => Promise<void>;
  chooseFramework: (id: FrameworkId) => void;
}

export function useHandoffCli(
  clipboardPort: HandoffClipboardPort,
  preferencesPort: HandoffPreferencesPort,
  options: UseHandoffCliOptions,
): HandoffCliController {
  const t = useT();
  // Hold the latest translator in a ref so the copy actions read the current
  // messages WITHOUT taking `t` as a `useCallback` dependency — `useT()` is
  // only stable under an `<I18nProvider>`, and a bare render (some tests,
  // SSR) hands back a fresh function each render.
  const tRef = useRef(t);
  tRef.current = t;

  const { fireHandoff, projectId, projectName, projectDir, agents, setError, clearError } = options;

  const [copyBusy, setCopyBusy] = useState<string | null>(null);
  const [copiedCliId, setCopiedCliId] = useState<string | null>(null);
  const [frameworkId, setFrameworkId] = useState(() => preferencesPort.readPreferredFramework());
  // Bumped on every successful copy (even a repeat copy of the same target),
  // so the flash effect below always restarts its 1800ms window instead of
  // bailing out on an unchanged `copiedCliId` string.
  const flashTokenRef = useRef(0);
  const [flashToken, setFlashToken] = useState(0);

  const fireCopiedFlash = useCallback((id: string) => {
    flashTokenRef.current += 1;
    setFlashToken(flashTokenRef.current);
    setCopiedCliId(id);
  }, []);

  useEffect(() => {
    if (!copiedCliId) return;
    const id = setTimeout(() => setCopiedCliId(null), COPIED_FLASH_MS);
    return () => clearTimeout(id);
  }, [copiedCliId, flashToken]);

  const cliTargets = useMemo(() => mergeCliTargets(agents), [agents]);
  const availableCliTargets = cliTargets.filter((cli) => cli.available);
  const unavailableCliTargets = cliTargets.filter((cli) => !cli.available);
  const selectedFramework = FRAMEWORKS.find((framework) => framework.id === frameworkId) ?? DEFAULT_FRAMEWORK;

  const copyCliPrompt = useCallback(
    async (cli: CliTarget) => {
      fireHandoff({
        element: 'copy_cli_prompt',
        target_id: handoffTargetIdToTracking(cli.id),
        target_available: cli.available,
        handoff_tab: 'cli',
        framework: selectedFramework.id,
      });
      if (!projectDir) {
        setError(tRef.current('handoff.projectPathUnavailable'));
        return;
      }
      clearError();
      setCopyBusy(cli.id);
      const frameworkPrompt = frameworkPromptLabel(selectedFramework.id, tRef.current);
      const prompt = buildCliHandoffPrompt({
        cli,
        frameworkPrompt,
        labels: {
          promptIntro: tRef.current('handoff.promptIntro'),
          target: tRef.current('handoff.promptTarget'),
          cli: tRef.current('handoff.promptCli'),
          stepsLead: tRef.current('handoff.promptStepsLead', { cli: cliDisplayName(cli) }),
          readFiles: tRef.current('handoff.promptReadFiles'),
          keepDesign: tRef.current('handoff.promptKeepDesign'),
          produceCode: tRef.current('handoff.promptProduceCode', { framework: frameworkPrompt }),
          verify: tRef.current('handoff.promptVerify'),
          commandHint: tRef.current('handoff.promptCommandHint'),
          project: tRef.current('handoff.promptProject'),
          projectId: tRef.current('handoff.promptProjectId'),
        },
        projectDir,
        projectId,
        projectName,
      });
      try {
        const copied = await clipboardPort.copy(prompt);
        if (!copied) {
          setError(tRef.current('handoff.copyFailed'));
          return;
        }
        fireCopiedFlash(cli.id);
      } finally {
        setCopyBusy(null);
      }
    },
    [
      fireHandoff,
      selectedFramework,
      projectDir,
      setError,
      clearError,
      clipboardPort,
      projectId,
      projectName,
      fireCopiedFlash,
    ],
  );

  const copyProjectPath = useCallback(async () => {
    fireHandoff({ element: 'copy_path' });
    if (!projectDir) {
      setError(tRef.current('handoff.projectPathUnavailable'));
      return;
    }
    clearError();
    setCopyBusy(PROJECT_PATH_COPY_ID);
    try {
      const copied = await clipboardPort.copy(projectDir);
      if (!copied) {
        setError(tRef.current('handoff.copyFailed'));
        return;
      }
      fireCopiedFlash(PROJECT_PATH_COPY_ID);
    } finally {
      setCopyBusy(null);
    }
  }, [fireHandoff, projectDir, setError, clearError, clipboardPort, fireCopiedFlash]);

  const chooseFramework = useCallback(
    (id: FrameworkId) => {
      fireHandoff({ element: 'framework', framework: id, handoff_tab: 'cli' });
      setFrameworkId(id);
      preferencesPort.writePreferredFramework(id);
      clearError();
      setCopiedCliId(null);
    },
    [fireHandoff, preferencesPort, clearError],
  );

  return {
    cliTargets,
    availableCliTargets,
    unavailableCliTargets,
    selectedFramework,
    copyBusy,
    copiedCliId,
    copyCliPrompt,
    copyProjectPath,
    chooseFramework,
  };
}

/**
 * Wirer: binds the real provider ports and returns a ready-to-call hook. This
 * is the default the orchestrator uses; swap it via `useHandoffCli(...)` with
 * hand-written fakes in tests.
 */
export function useWiredHandoffCli(options: UseHandoffCliOptions): HandoffCliController {
  return useHandoffCli(handoffClipboardPort, handoffPreferencesPort, options);
}
