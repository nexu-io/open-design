// Hand-off menu in the ChatPane header. The left split button opens the
// current design project folder in a local editor, while the dropdown also
// exposes copy-to-CLI prompts for handing the same local folder to code agents.
//
// When the daemon reports `canRevealFolder: false` (container / remote / Web
// deployment — the user cannot see the daemon host's desktop), the local
// folder-opener surface degrades to web-native actions: Copy Path, Download
// (.zip via /api/projects/:id/archive), and Remote Open (focus the project in
// the web Design Files view). See #787.

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { FOLDER_OPENER_EDITOR_IDS } from '@open-design/contracts';
import type {
  AgentInfo,
  HostEditor,
  HostEditorId,
  HostEditorsResponse,
} from '@open-design/contracts';
import {
  handoffTargetIdToTracking,
  type TrackingArtifactKind,
} from '@open-design/contracts/analytics';
import { fetchHostEditors, openProjectInEditor } from '../providers/registry';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import { trackHandoffClick } from '../analytics/events';
import { useT } from '../i18n';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { downloadProjectArchive } from '../runtime/exports';
import { Icon } from './Icon';
import { EditorIcon } from './EditorIcon';
import { AgentIcon } from './AgentIcon';
import styles from './HandoffButton.module.css';

const PREFERRED_EDITOR_KEY = 'open-design:preferred-editor';
const PREFERRED_FRAMEWORK_KEY = 'open-design:handoff-framework';
const AMR_WEBSITE_URL = 'https://open-design.ai/amr';
const PROJECT_PATH_COPY_ID = 'project-path';
const PROJECT_DOWNLOAD_ID = 'project-download';

type HandoffTab = 'editor' | 'cli';
type FrameworkId = 'react' | 'vue' | 'svelte' | 'solid' | 'next' | 'vanilla';

interface FrameworkTarget {
  id: FrameworkId;
}

const FRAMEWORKS: FrameworkTarget[] = [
  { id: 'react' },
  { id: 'vue' },
  { id: 'svelte' },
  { id: 'solid' },
  { id: 'next' },
  { id: 'vanilla' },
];

const DEFAULT_FRAMEWORK: FrameworkTarget = FRAMEWORKS[0] ?? {
  id: 'react',
};

interface CliTarget {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  version?: string | null;
}

const CLI_ORDER = [
  'amr',
  'claude',
  'codex',
  'opencode',
  'cursor-agent',
  'gemini',
  'qwen',
  'qoder',
  'copilot',
  'grok-build',
  'deepseek',
  'kimi',
  'hermes',
  'devin',
  'kiro',
  'kilo',
  'vibe',
  'antigravity',
  'aider',
  'trae-cli',
  'pi',
  'reasonix',
];

const FALLBACK_CLI_TARGETS: CliTarget[] = [
  { id: 'amr', name: 'Open Design', bin: 'vela', available: false },
  { id: 'claude', name: 'Claude Code', bin: 'claude', available: false },
  { id: 'codex', name: 'Codex CLI', bin: 'codex', available: false },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode-cli', available: false },
  { id: 'cursor-agent', name: 'Cursor Agent', bin: 'cursor-agent', available: false },
  { id: 'qwen', name: 'Qwen Code', bin: 'qwen', available: false },
  { id: 'qoder', name: 'Qoder CLI', bin: 'qodercli', available: false },
  { id: 'copilot', name: 'GitHub Copilot CLI', bin: 'copilot', available: false },
  { id: 'grok-build', name: 'Grok Build', bin: 'grok', available: false },
  { id: 'deepseek', name: 'DeepSeek TUI', bin: 'deepseek', available: false },
  { id: 'kimi', name: 'Kimi CLI', bin: 'kimi', available: false },
  { id: 'hermes', name: 'Hermes', bin: 'hermes', available: false },
  { id: 'devin', name: 'Devin for Terminal', bin: 'devin', available: false },
  { id: 'kiro', name: 'Kiro CLI', bin: 'kiro-cli', available: false },
  { id: 'kilo', name: 'Kilo', bin: 'kilo', available: false },
  { id: 'vibe', name: 'Mistral Vibe CLI', bin: 'vibe-acp', available: false },
  { id: 'antigravity', name: 'Antigravity', bin: 'agy', available: false },
  { id: 'aider', name: 'Aider', bin: 'aider', available: false },
  { id: 'trae-cli', name: 'Trae CLI', bin: 'traecli', available: false },
  { id: 'pi', name: 'Pi', bin: 'pi', available: false },
  { id: 'reasonix', name: 'DeepSeek Reasonix', bin: 'reasonix', available: false },
];

interface Props {
  projectId: string;
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  // Active artifact context, so handoff clicks carry the same artifact_id /
  // artifact_kind dimensions as the rest of the artifact_header funnel.
  // Undefined when no artifact tab is active.
  artifactId?: string;
  artifactKind?: TrackingArtifactKind;
  metricsConsent?: boolean;
  installationId?: string | null;
  // "Remote Open": focus the project in the web Design Files view — the
  // web-native equivalent of a local Finder reveal when the daemon reports
  // canRevealFolder === false. Wired by ProjectView, which owns the
  // workspace tab state; the action is hidden when the callback is absent so
  // the menu never advertises a no-op.
  onOpenInWebFiles?: () => void;
}

function readPreferred(): HostEditorId | null {
  try {
    const v = window.localStorage.getItem(PREFERRED_EDITOR_KEY);
    return (v as HostEditorId) || null;
  } catch {
    return null;
  }
}

function writePreferred(id: HostEditorId): void {
  try {
    window.localStorage.setItem(PREFERRED_EDITOR_KEY, id);
  } catch {
    // ignore — quota or sandboxed
  }
}

function readPreferredFramework(): string {
  if (typeof window === 'undefined') return DEFAULT_FRAMEWORK.id;
  try {
    const stored = window.localStorage.getItem(PREFERRED_FRAMEWORK_KEY);
    if (stored && FRAMEWORKS.some((f) => f.id === stored)) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_FRAMEWORK.id;
}

function writePreferredFramework(id: string): void {
  try {
    window.localStorage.setItem(PREFERRED_FRAMEWORK_KEY, id);
  } catch {
    // ignore — quota or sandboxed
  }
}

function cliDisplayName(agent: Pick<CliTarget, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design' : agent.name;
}

function mergeCliTargets(agents: AgentInfo[] | undefined): CliTarget[] {
  const byId = new Map<string, CliTarget>();
  for (const target of FALLBACK_CLI_TARGETS) {
    byId.set(target.id, target);
  }
  for (const agent of agents ?? []) {
    byId.set(agent.id, {
      id: agent.id,
      name: cliDisplayName(agent),
      bin: agent.bin,
      available: agent.available,
      version: agent.version,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const ai = CLI_ORDER.indexOf(a.id);
    const bi = CLI_ORDER.indexOf(b.id);
    const ao = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bo = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (ao !== bo) return ao - bo;
    return cliDisplayName(a).localeCompare(cliDisplayName(b));
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

type T = ReturnType<typeof useT>;

interface CliHandoffLabels {
  promptIntro: string;
  target: string;
  cli: string;
  stepsLead: string;
  readFiles: string;
  keepDesign: string;
  produceCode: string;
  verify: string;
  commandHint: string;
  project: string;
  projectId: string;
}

function frameworkLabel(id: FrameworkId, t: T): string {
  switch (id) {
    case 'vue':
      return t('handoff.framework.vue');
    case 'svelte':
      return t('handoff.framework.svelte');
    case 'solid':
      return t('handoff.framework.solid');
    case 'next':
      return t('handoff.framework.next');
    case 'vanilla':
      return t('handoff.framework.vanilla');
    case 'react':
    default:
      return t('handoff.framework.react');
  }
}

function frameworkPromptLabel(id: FrameworkId, t: T): string {
  switch (id) {
    case 'vue':
      return t('handoff.frameworkPrompt.vue');
    case 'svelte':
      return t('handoff.frameworkPrompt.svelte');
    case 'solid':
      return t('handoff.frameworkPrompt.solid');
    case 'next':
      return t('handoff.frameworkPrompt.next');
    case 'vanilla':
      return t('handoff.frameworkPrompt.vanilla');
    case 'react':
    default:
      return t('handoff.frameworkPrompt.react');
  }
}

function buildCliHandoffPrompt({
  cli,
  frameworkPrompt,
  labels,
  projectDir,
  projectId,
  projectName,
}: {
  cli: CliTarget;
  frameworkPrompt: string;
  labels: CliHandoffLabels;
  projectDir: string;
  projectId: string;
  projectName?: string;
}): string {
  const name = projectName?.trim() || projectId;
  return `${labels.promptIntro}

\`\`\`
${projectDir}
\`\`\`

${labels.target}: ${frameworkPrompt}
${labels.cli}: ${cliDisplayName(cli)}${cli.bin ? ` (${cli.bin})` : ''}

${labels.stepsLead}
1. ${labels.readFiles}
2. ${labels.keepDesign}
3. ${labels.produceCode}
4. ${labels.verify}

${labels.commandHint}

\`\`\`bash
cd ${shellQuote(projectDir)}
\`\`\`

${labels.project}: ${name}
${labels.projectId}: ${projectId}
`;
}

export function HandoffButton({
  projectId,
  projectName,
  projectDir,
  agents,
  artifactId,
  artifactKind,
  metricsConsent = false,
  installationId,
  onOpenInWebFiles,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  // One-liner so every hand-off interaction emits the same
  // `ui_click` / `area=handoff` shape; callers pass only what varies. The
  // active-artifact context is attached to every event so handoff slices line
  // up with the rest of the artifact_header funnel.
  const fireHandoff = (
    props: Omit<
      Parameters<typeof trackHandoffClick>[1],
      'page_name' | 'area' | 'artifact_id' | 'artifact_kind'
    >,
  ) => {
    trackHandoffClick(analytics.track, {
      page_name: 'artifact',
      area: 'handoff',
      artifact_id: artifactId,
      artifact_kind: artifactKind,
      ...props,
    });
  };
  const [editors, setEditors] = useState<HostEditor[]>([]);
  const [platform, setPlatform] = useState<HostEditorsResponse['platform']>('unknown');
  // Whether the daemon can reveal a local folder to the current user.
  // Older daemons omit the field — treat `undefined` as `true` so a web
  // bundle upgraded ahead of its daemon keeps the local desktop behavior.
  const [canRevealFolder, setCanRevealFolder] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<HostEditorId | null>(null);
  const [copyBusy, setCopyBusy] = useState<string | null>(null);
  const [copiedCliId, setCopiedCliId] = useState<string | null>(null);
  const [frameworkId, setFrameworkId] = useState(readPreferredFramework);
  const [activeTab, setActiveTab] = useState<HandoffTab>('editor');
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const handleAmrWebsiteClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    fireHandoff({ element: 'amr_website', handoff_tab: 'cli' });
    const attribution = recordAmrEntry(analytics.track, 'handoff_amr_website', new Date(), {
      metricsConsent,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    event.currentTarget.href = attributedAmrUrl(
      AMR_WEBSITE_URL,
      attribution,
      deviceId,
    );
  };

  useEffect(() => {
    let cancelled = false;
    fetchHostEditors()
      .then((resp) => {
        if (cancelled) return;
        setEditors(resp.editors);
        setPlatform(resp.platform);
        setCanRevealFolder(resp.canRevealFolder !== false);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEditors([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  // In a non-revealable environment the OS folder openers are hidden — even
  // ones probed as available (e.g. xdg-open inside a container): they would
  // open a window on the daemon host, not for the user browsing the web UI.
  const visibleEditors = canRevealFolder
    ? editors
    : editors.filter((e) => !FOLDER_OPENER_EDITOR_IDS.has(e.id));
  const available = visibleEditors.filter((e) => e.available);
  const unavailable = visibleEditors.filter((e) => !e.available);
  const preferred = readPreferred();
  const primary =
    available.find((e) => e.id === preferred) ?? available[0] ?? null;
  const primaryTitle = primary
    ? t('handoff.openInTarget', { target: primary.label })
    : t('handoff.action');
  const cliTargets = useMemo(() => mergeCliTargets(agents), [agents]);
  const availableCliTargets = cliTargets.filter((cli) => cli.available);
  const unavailableCliTargets = cliTargets.filter((cli) => !cli.available);
  const selectedFramework =
    FRAMEWORKS.find((framework) => framework.id === frameworkId) ?? DEFAULT_FRAMEWORK;

  async function launch(editor: HostEditor) {
    fireHandoff({
      element: 'open_editor',
      target_id: handoffTargetIdToTracking(editor.id),
      target_available: editor.available,
      handoff_tab: 'editor',
    });
    if (!editor.available) {
      // Still try — the user might have an unprobed path (e.g. macOS
      // bundle in /Applications). The daemon will return 409 if it
      // genuinely can't find it.
    }
    setError(null);
    setBusy(editor.id);
    writePreferred(editor.id);
    try {
      await openProjectInEditor(projectId, editor.id);
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setOpen(true);
      setActiveTab('editor');
    } finally {
      setBusy(null);
    }
  }

  async function copyCliPrompt(cli: CliTarget) {
    fireHandoff({
      element: 'copy_cli_prompt',
      target_id: handoffTargetIdToTracking(cli.id),
      target_available: cli.available,
      handoff_tab: 'cli',
      framework: selectedFramework.id,
    });
    if (!projectDir) {
      setError(t('handoff.projectPathUnavailable'));
      return;
    }
    setError(null);
    setCopyBusy(cli.id);
    const cliName = cliDisplayName(cli);
    const frameworkPrompt = frameworkPromptLabel(selectedFramework.id, t);
    const prompt = buildCliHandoffPrompt({
      cli,
      frameworkPrompt,
      labels: {
        promptIntro: t('handoff.promptIntro'),
        target: t('handoff.promptTarget'),
        cli: t('handoff.promptCli'),
        stepsLead: t('handoff.promptStepsLead', { cli: cliName }),
        readFiles: t('handoff.promptReadFiles'),
        keepDesign: t('handoff.promptKeepDesign'),
        produceCode: t('handoff.promptProduceCode', { framework: frameworkPrompt }),
        verify: t('handoff.promptVerify'),
        commandHint: t('handoff.promptCommandHint'),
        project: t('handoff.promptProject'),
        projectId: t('handoff.promptProjectId'),
      },
      projectDir,
      projectId,
      projectName,
    });
    try {
      const copied = await copyToClipboard(prompt);
      if (!copied) {
        setError(t('handoff.copyFailed'));
        return;
      }
      setCopiedCliId(cli.id);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedCliId(null);
        copiedTimerRef.current = null;
      }, 1800);
    } finally {
      setCopyBusy(null);
    }
  }

  async function copyProjectPath() {
    fireHandoff({ element: 'copy_path' });
    if (!projectDir) {
      setError(t('handoff.projectPathUnavailable'));
      return;
    }
    setError(null);
    setCopyBusy(PROJECT_PATH_COPY_ID);
    try {
      const copied = await copyToClipboard(projectDir);
      if (!copied) {
        setError(t('handoff.copyFailed'));
        return;
      }
      setCopiedCliId(PROJECT_PATH_COPY_ID);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedCliId(null);
        copiedTimerRef.current = null;
      }, 1800);
    } finally {
      setCopyBusy(null);
    }
  }

  async function downloadProject() {
    fireHandoff({ element: 'download' });
    setError(null);
    setCopyBusy(PROJECT_DOWNLOAD_ID);
    try {
      const ok = await downloadProjectArchive({
        projectId,
        fallbackTitle: projectName?.trim() || projectId,
      });
      if (!ok) {
        setError(t('handoff.downloadFailed'));
      }
    } finally {
      setCopyBusy(null);
    }
  }

  function openInWebFiles() {
    fireHandoff({ element: 'remote_open' });
    setError(null);
    onOpenInWebFiles?.();
    setOpen(false);
  }

  // Copy Path / Download / Remote Open — the web-native replacements for the
  // local folder openers when the daemon reports canRevealFolder === false.
  function renderWebActions(layout: 'row' | 'stack') {
    const copied = copiedCliId === PROJECT_PATH_COPY_ID;
    return (
      <div
        className={layout === 'row' ? styles.webActionsRow : styles.webActionsStack}
        data-testid="handoff-web-actions"
      >
        <button
          type="button"
          className={`handoff-path-button${copied ? ' copied' : ''}`}
          data-testid="handoff-web-action-copy-path"
          onClick={() => void copyProjectPath()}
          disabled={copyBusy === PROJECT_PATH_COPY_ID || !projectDir}
          title={projectDir ?? t('handoff.projectPathUnavailable')}
          aria-label={copied ? t('handoff.copied') : t('designFiles.copyPath')}
        >
          <span className="handoff-path-button-main">
            <span className="handoff-path-button-icon" aria-hidden>
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </span>
            <span className="handoff-path-button-label">
              {copied ? t('handoff.copied') : t('designFiles.copyPath')}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="handoff-path-button"
          data-testid="handoff-web-action-download"
          onClick={() => void downloadProject()}
          disabled={copyBusy === PROJECT_DOWNLOAD_ID}
          title={t('handoff.download')}
          aria-label={t('handoff.download')}
        >
          <span className="handoff-path-button-main">
            <span className="handoff-path-button-icon" aria-hidden>
              <Icon name="download" size={13} />
            </span>
            <span className="handoff-path-button-label">{t('handoff.download')}</span>
          </span>
        </button>
        {onOpenInWebFiles ? (
          <button
            type="button"
            className="handoff-path-button"
            data-testid="handoff-web-action-remote-open"
            onClick={openInWebFiles}
            title={t('handoff.remoteOpenTitle')}
            aria-label={t('handoff.remoteOpen')}
          >
            <span className="handoff-path-button-main">
              <span className="handoff-path-button-icon" aria-hidden>
                <Icon name="external-link" size={13} />
              </span>
              <span className="handoff-path-button-label">{t('handoff.remoteOpen')}</span>
            </span>
          </button>
        ) : null}
      </div>
    );
  }

  function chooseFramework(id: FrameworkId) {
    fireHandoff({ element: 'framework', framework: id, handoff_tab: 'cli' });
    setFrameworkId(id);
    writePreferredFramework(id);
    setError(null);
    setCopiedCliId(null);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }

  if (!loaded) {
    return null;
  }

  // No available editors and no way to reveal a local folder — the old
  // Finder/Explorer/File-Manager fallback would only fail (409 / 500 /
  // silent no-op on the daemon host). Offer the web-native actions instead:
  // Copy Path / Download / Remote Open.
  if (available.length === 0 && !canRevealFolder) {
    return (
      <div
        className={`handoff-wrap handoff-wrap--solo${open ? ' open' : ''}`}
        ref={wrapRef}
        data-testid="handoff-wrap"
      >
        <button
          type="button"
          className="handoff-trigger handoff-trigger--solo od-tooltip"
          data-testid="handoff-web-actions-trigger"
          title={t('handoff.openFolderUnavailable')}
          data-tooltip={t('handoff.openFolderUnavailable')}
          data-tooltip-placement="bottom"
          aria-expanded={open}
          onClick={() => {
            fireHandoff({ element: 'trigger' });
            setOpen((v) => !v);
          }}
        >
          <Icon name="folder" size={20} />
          <span className="handoff-trigger-label">{t('handoff.webActionsTitle')}</span>
        </button>
        {open ? (
          <div
            className="handoff-menu"
            role="dialog"
            aria-label={t('handoff.webActionsTitle')}
            data-testid="handoff-web-actions-menu"
          >
            {renderWebActions('stack')}
            {error ? (
              <>
                <div className="handoff-menu-divider" />
                <div className="handoff-menu-error" role="alert">{error}</div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // No available editors — render a Finder/Explorer/File-Manager single-button
  // fallback so the surface is never blank, including the true zero-editor
  // response where the daemon reports `editors: []`.
  if (available.length === 0) {
    const fallbackLabel = platform === 'win32' ? 'Explorer' : platform === 'linux' ? 'File Manager' : 'Finder';
    const fallbackId: HostEditorId =
      platform === 'win32' ? 'explorer' : platform === 'linux' ? 'file-manager' : 'finder';
    // Wrap the solo button so a daemon spawn failure can surface an
    // inline error next to it — without this, ProjectView's
    // `<HandoffButton projectId={…} />` (no reveal callback) turns a
    // rejected `openProjectInEditor` into a silent no-op.
    return (
      <div className="handoff-wrap handoff-wrap--solo" data-testid="handoff-wrap">
        <button
          type="button"
          className="handoff-trigger handoff-trigger--solo od-tooltip"
          title={t('handoff.fallbackTitle', { target: fallbackLabel })}
          data-tooltip={t('handoff.fallbackTitle', { target: fallbackLabel })}
          data-tooltip-placement="bottom"
          disabled={busy === fallbackId}
          onClick={() => {
            // The fallback opens the project folder in the OS file manager.
            // finder / explorer / file-manager are real entries in the daemon's
            // open-in catalogue (open / explorer / xdg-open), so this performs a
            // genuine reveal rather than a no-op; a daemon spawn failure
            // surfaces inline below.
            fireHandoff({
              element: 'open_editor',
              target_id: handoffTargetIdToTracking(fallbackId),
              target_available: false,
              handoff_tab: 'editor',
            });
            setError(null);
            setBusy(fallbackId);
            void openProjectInEditor(projectId, fallbackId)
              .catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
              })
              .finally(() => setBusy(null));
          }}
        >
          <EditorIcon editorId={fallbackId} size={20} />
          <span className="handoff-trigger-label">{fallbackLabel}</span>
        </button>
        {error ? (
          <div className="handoff-menu-error" role="alert" data-testid="handoff-fallback-error">
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`handoff-wrap${open ? ' open' : ''}`}
      ref={wrapRef}
      data-testid="handoff-wrap"
    >
      {/* Split control: the labeled left side launches the preferred
          editor, the right caret opens the picker. Sibling buttons
          (instead of a nested caret) so the caret has its own real
          tap target and so we don't render an invalid button-in-button. */}
      <div className="handoff-split">
        <button
          type="button"
          className="handoff-trigger od-tooltip"
          data-testid="handoff-trigger"
          title={primaryTitle}
          data-tooltip={primaryTitle}
          data-tooltip-placement="bottom"
          aria-label={primaryTitle}
          onClick={() => {
            if (primary && busy !== primary.id) {
              // Record the button intent first (the most common path through
              // this surface), carrying the preferred editor as target so it
              // is distinguishable from picking the same editor in the
              // dropdown; launch() then emits `open_editor` for the actual
              // target launch.
              fireHandoff({
                element: 'trigger',
                target_id: handoffTargetIdToTracking(primary.id),
                target_available: primary.available,
                handoff_tab: 'editor',
              });
              void launch(primary);
            } else {
              fireHandoff({ element: 'trigger' });
              setOpen((v) => !v);
            }
          }}
          disabled={busy !== null}
        >
          {primary ? (
            <>
              <EditorIcon editorId={primary.id} size={20} />
              <span className="handoff-trigger-label sr-only">
                {primaryTitle}
              </span>
            </>
          ) : (
            <>
              <EditorIcon editorId="finder" size={20} />
              <span className="handoff-trigger-label sr-only">{primaryTitle}</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="handoff-caret od-tooltip"
          aria-label={t('handoff.chooseTargetAria')}
          title={t('handoff.chooseTargetAria')}
          data-tooltip={t('handoff.chooseTargetAria')}
          data-tooltip-placement="bottom"
          data-testid="handoff-caret"
          onClick={() => {
            fireHandoff({ element: 'caret' });
            setOpen((v) => !v);
          }}
          disabled={busy !== null}
        >
          <Icon name="chevron-down" size={14} />
        </button>
      </div>
      {open ? (
        <div className="handoff-menu" role="dialog" aria-label={t('handoff.optionsAria')} data-testid="handoff-menu">
          <div className="handoff-menu-tabs" role="tablist" aria-label={t('handoff.optionsAria')}>
            <button
              type="button"
              className={`handoff-menu-tab${activeTab === 'editor' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'editor'}
              onClick={() => {
                fireHandoff({ element: 'tab', handoff_tab: 'editor' });
                setActiveTab('editor');
              }}
            >
              {t('handoff.editorSection')}
            </button>
            <button
              type="button"
              className={`handoff-menu-tab${activeTab === 'cli' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'cli'}
              onClick={() => {
                fireHandoff({ element: 'tab', handoff_tab: 'cli' });
                setActiveTab('cli');
              }}
            >
              {t('handoff.cliSection')}
            </button>
          </div>
          <div className="handoff-path-row" data-testid="handoff-project-path">
            {canRevealFolder ? (
              <button
                type="button"
                className={`handoff-path-button${copiedCliId === PROJECT_PATH_COPY_ID ? ' copied' : ''}`}
                onClick={() => void copyProjectPath()}
                disabled={copyBusy === PROJECT_PATH_COPY_ID || !projectDir}
                title={projectDir ?? t('handoff.projectPathUnavailable')}
                aria-label={copiedCliId === PROJECT_PATH_COPY_ID ? t('handoff.copied') : t('designFiles.copyPath')}
              >
                <span className="handoff-path-button-main">
                  <span className="handoff-path-button-icon" aria-hidden>
                    <Icon name={copiedCliId === PROJECT_PATH_COPY_ID ? 'check' : 'copy'} size={13} />
                  </span>
                  <span className="handoff-path-button-label">
                    {copiedCliId === PROJECT_PATH_COPY_ID ? t('handoff.copied') : t('designFiles.copyPath')}
                  </span>
                </span>
              </button>
            ) : (
              // The local folder openers are hidden in this environment, so
              // the path row carries all three web-native actions instead.
              renderWebActions('row')
            )}
          </div>
          {activeTab === 'editor' ? (
            <section className="handoff-menu-block" role="tabpanel">
              <div className="handoff-target-group">
                <div className="handoff-target-group-title">{t('common.installed')}</div>
                <div className="handoff-target-rail handoff-editor-rail">
                  {available.map((editor) => (
                    <button
                      key={editor.id}
                      type="button"
                      className="handoff-menu-item handoff-target-card"
                      data-testid={`handoff-menu-item-${editor.id}`}
                      onClick={() => void launch(editor)}
                      disabled={busy === editor.id}
                      title={t('handoff.openInTarget', { target: editor.label })}
                    >
                      <EditorIcon editorId={editor.id} size={24} />
                      <span className="handoff-target-label">{editor.label}</span>
                      <Icon className="handoff-target-arrow" name="chevron-right" size={12} />
                    </button>
                  ))}
                </div>
              </div>
              {unavailable.length > 0 ? (
                <div className="handoff-target-group">
                  <div className="handoff-target-group-title">{t('handoff.notInstalled')}</div>
                  <div className="handoff-target-rail handoff-editor-rail handoff-target-rail--unavailable">
                    {unavailable.map((editor) => (
                      <button
                        key={editor.id}
                        type="button"
                        className="handoff-menu-item handoff-target-card dim"
                        data-testid={`handoff-menu-item-${editor.id}`}
                        onClick={() => void launch(editor)}
                        disabled={busy === editor.id}
                        title={t('handoff.notDetectedTitle', { target: editor.label })}
                      >
                        <EditorIcon editorId={editor.id} size={24} />
                        <span className="handoff-target-label">{editor.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="handoff-menu-block" role="tabpanel">
              <a
                className="handoff-amr-link"
                href={AMR_WEBSITE_URL}
                target="_blank"
                rel="noreferrer"
                onClick={handleAmrWebsiteClick}
              >
                <AgentIcon id="amr" size={18} />
                <span>{t('handoff.amrWebsite')}</span>
                <Icon name="external-link" size={12} />
              </a>
              <div className="handoff-framework-row" role="group" aria-label={t('handoff.framework')}>
                <span className="handoff-framework-label">{t('handoff.framework')}</span>
                {FRAMEWORKS.map((framework) => (
                  <button
                    key={framework.id}
                    type="button"
                    className={`handoff-framework-chip${framework.id === selectedFramework.id ? ' active' : ''}`}
                    aria-pressed={framework.id === selectedFramework.id}
                    onClick={() => chooseFramework(framework.id)}
                  >
                    {frameworkLabel(framework.id, t)}
                  </button>
                ))}
              </div>
              {availableCliTargets.length > 0 ? (
                <div className="handoff-target-group">
                  <div className="handoff-target-group-title">{t('common.installed')}</div>
                  <div className="handoff-target-rail handoff-cli-rail">
                    {availableCliTargets.map((cli) => {
                      const copied = copiedCliId === cli.id;
                      return (
                        <button
                          key={cli.id}
                          type="button"
                          className={[
                            'handoff-menu-item',
                            'handoff-target-card',
                            'handoff-cli-card',
                            copied ? 'copied' : '',
                          ].filter(Boolean).join(' ')}
                          data-testid={`handoff-cli-item-${cli.id}`}
                          onClick={() => void copyCliPrompt(cli)}
                          disabled={copyBusy === cli.id}
                          title={t('handoff.copyPromptForTarget', { target: cliDisplayName(cli) })}
                        >
                          <AgentIcon id={cli.id} size={24} />
                          <span className="handoff-target-copy">
                            <span className="handoff-target-label">{cliDisplayName(cli)}</span>
                            <span className="handoff-target-meta">
                              {copied ? t('handoff.copied') : t('handoff.copyPrompt')}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="handoff-target-group">
                <div className="handoff-target-group-title">{t('handoff.notInstalled')}</div>
                <div className="handoff-target-rail handoff-cli-rail handoff-target-rail--unavailable">
                  {unavailableCliTargets.map((cli) => {
                    const copied = copiedCliId === cli.id;
                    return (
                      <button
                        key={cli.id}
                        type="button"
                        className={[
                          'handoff-menu-item',
                          'handoff-target-card',
                          'handoff-cli-card',
                          'dim',
                          copied ? 'copied' : '',
                        ].filter(Boolean).join(' ')}
                        data-testid={`handoff-cli-item-${cli.id}`}
                        onClick={() => void copyCliPrompt(cli)}
                        disabled={copyBusy === cli.id}
                        title={t('handoff.copyPromptForTarget', { target: cliDisplayName(cli) })}
                      >
                        <AgentIcon id={cli.id} size={24} />
                        <span className="handoff-target-label">{cliDisplayName(cli)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
          {error ? (
            <>
              <div className="handoff-menu-divider" />
              <div className="handoff-menu-error">{error}</div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
