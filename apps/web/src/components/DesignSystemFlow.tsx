import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ConnectorConnectResponse, ConnectorDetail, ConnectorStatusResponse } from '@open-design/contracts';
import { streamViaDaemon } from '../providers/daemon';
import {
  connectConnector,
  createDesignSystemDraft,
  disconnectConnector,
  ensureDesignSystemWorkspace,
  fetchDesignSystemGenerationJob,
  fetchDesignSystem,
  fetchConnectorStatuses,
  fetchProjectFileText,
  fetchProjectFiles,
  fetchProjectDesignSystemPackageAudit,
  fetchDesignSystemRevisions,
  openFolderDialog,
  updateDesignSystemRevisionStatus,
  updateDesignSystemDraft,
  uploadProjectFile,
  writeProjectTextFile,
} from '../providers/registry';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
  patchConversation,
  patchProject,
  saveMessage,
  saveTabs,
} from '../state/projects';
import { appendErrorStatusEvent } from '../runtime/chat-events';
import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../runtime/design-system-package-audit';
import { deriveFileOps } from '../runtime/file-ops';
import { latestTodosFromEvents } from '../runtime/todos';
import { randomUUID } from '../utils/uuid';
import type {
  AgentEvent,
  AgentInfo,
  AppConfig,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  Conversation,
  DesignSystemDetail,
  DesignSystemGenerationJob,
  DesignSystemProvenance,
  DesignSystemRevision,
  OpenTabsState,
  Project,
  ProjectFile,
  ProjectMetadata,
} from '../types';
import { decideAutoOpenAfterWrite } from './auto-open-file';
import { ChatPane } from './ChatPane';
import { FileWorkspace } from './FileWorkspace';
import { Icon, type IconName } from './Icon';
import { useAnalytics } from '../analytics/provider';
import { trackPageView } from '../analytics/events';
import {
  clearOnboardingSessionId,
  peekOnboardingSessionId,
} from '../analytics/onboarding-session';
import type {
  TrackingDesignSystemStatus,
  TrackingDesignSystemsEntryFrom,
} from '@open-design/contracts/analytics';
import { useI18n } from '../i18n';

interface CreationProps {
  onBack: () => void;
  onCreated: (projectId: string, project?: Project) => void;
  onProjectPrepared?: (project: Project) => void;
  onSystemsRefresh?: () => Promise<void> | void;
  config?: AppConfig;
  onOpenConnectorsTab?: () => void;
  chrome?: 'standalone' | 'embedded';
}

interface DetailProps {
  id: string;
  selectedId: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  onBack: () => void;
  onOpenProject?: (projectId: string) => void;
  onSetDefault: (id: string) => void;
  onSystemsRefresh?: () => Promise<void> | void;
  onProjectsRefresh?: () => Promise<void> | void;
}

type SetupStep = 'setup' | 'confirm';
type ReviewTab = 'system' | 'files';

interface SetupState {
  company: string;
  githubUrl: string;
  githubUrls: string[];
  codeFiles: string[];
  codeFolders: string[];
  codeFileObjects: File[];
  figFiles: string[];
  figFileObjects: File[];
  assetFiles: string[];
  assetFileObjects: File[];
  notes: string;
}

const EMPTY_SETUP: SetupState = {
  company: '',
  githubUrl: '',
  githubUrls: [],
  codeFiles: [],
  codeFolders: [],
  codeFileObjects: [],
  figFiles: [],
  figFileObjects: [],
  assetFiles: [],
  assetFileObjects: [],
  notes: '',
};

const GENERATION_JOB_STORAGE_PREFIX = 'od:design-system-generation-job:';
const GITHUB_CONNECTOR_ID = 'github';
const CONNECTOR_CALLBACK_MESSAGE_TYPE = 'open-design:connector-connected';
const GITHUB_CONNECTOR_STATUS_TIMEOUT_MS = 5000;
const LOCAL_CODE_UPLOAD_ROOT = 'context/local-code';
const FIGMA_CONTEXT_ROOT = 'context/figma';
const ASSET_UPLOAD_ROOT = 'assets';
const SOURCE_CONTEXT_MANIFEST_PATH = 'context/source-context.md';
const MAX_LOCAL_CODE_UPLOAD_FILES = 120;
const MAX_LOCAL_CODE_FILE_BYTES = 1024 * 1024;
const MAX_FIGMA_CONTEXT_FILES = 10;
const MAX_FIGMA_PARSE_BYTES = 512 * 1024;
const MAX_ASSET_UPLOAD_FILES = 80;
const MAX_ASSET_FILE_BYTES = 12 * 1024 * 1024;

const UI_KIT_ENTRY_CONTRACT = [
  'Claude-style UI-kit entry contract:',
  '- When `ui_kits/app/components/*.jsx` or `*.tsx` files exist, `ui_kits/app/index.html` must behave like a runnable browser entry, not a static mock.',
  '- Use the same structure as Claude Design exports: load React, ReactDOM, and Babel standalone scripts, load `../../colors_and_type.css`, create a `#root`, load each component script from `components/`, then render the composed `App` component.',
  '- `App.jsx` must assign `window.App = App` (or `globalThis.App = App`), and every directly loaded component file must expose the same browser global for its component name.',
  '- Use this skeleton for direct JSX component kits, replacing the component list only when evidence supports different names:',
  '```html',
  '<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>',
  '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>',
  '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>',
  '<link rel="stylesheet" href="../../colors_and_type.css">',
  '<div id="root"></div>',
  '<script type="text/babel" src="components/Sidebar.jsx"></script>',
  '<script type="text/babel" src="components/AssistantsList.jsx"></script>',
  '<script type="text/babel" src="components/ChatArea.jsx"></script>',
  '<script type="text/babel" src="components/MessageBubble.jsx"></script>',
  '<script type="text/babel" src="components/InputBar.jsx"></script>',
  '<script type="text/babel" src="components/App.jsx"></script>',
  '<script type="text/babel">',
  'const { App } = window;',
  "const root = ReactDOM.createRoot(document.getElementById('root'));",
  'root.render(<App />);',
  '</script>',
  '```',
].join('\n');

const BUILD_ASSET_PRESERVATION_CONTRACT = [
  'Claude-style build asset contract:',
  '- When evidence includes `context/.../files/build/...`, create a root `build/` directory and copy representative runtime assets there with their original filenames and path intent, such as `build/icon.png`, `build/logo.png`, `build/tray_icon.png`, and `build/icon.ico`.',
  '- Copy those runtime assets byte-for-byte from the captured `context/.../files/...` snapshots. Do not redraw, re-encode, optimize, or substitute generated placeholders for files that the evidence already captured.',
  '- Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`. `assets/` may include convenience aliases, but root `build/` must preserve the source runtime files for future agents and package consumers.',
  '- `preview/brand-assets.html` should reference at least some real preserved files from `build/` or `assets/` with `<img>`, `<picture>`, `<object>`, or CSS `url(...)`, and README.md / SKILL.md should mention `build/` in the package manifest when it exists.',
].join('\n');

function generationJobStorageKey(designSystemId: string): string {
  return `${GENERATION_JOB_STORAGE_PREFIX}${designSystemId}`;
}

function readRememberedGenerationJob(designSystemId: string): string | null {
  try {
    return window.sessionStorage.getItem(generationJobStorageKey(designSystemId));
  } catch {
    return null;
  }
}

function clearRememberedGenerationJob(designSystemId: string): void {
  try {
    window.sessionStorage.removeItem(generationJobStorageKey(designSystemId));
  } catch {
    // Best-effort cleanup only.
  }
}

export function DesignSystemCreationFlow({
  onBack,
  onCreated,
  onProjectPrepared,
  onSystemsRefresh,
  config,
  onOpenConnectorsTab,
  chrome = 'standalone',
}: CreationProps) {
  const [step, setStep] = useState<SetupStep>('setup');
  const [state, setState] = useState<SetupState>(EMPTY_SETUP);
  const [error, setError] = useState<string | null>(null);
  const [generationStarting, setGenerationStarting] = useState(false);
  const composioConfigured = isComposioConfigured(config?.composio);
  const [githubConnector, setGithubConnector] = useState<ConnectorDetail | null>(null);
  const [githubConnectorLoading, setGithubConnectorLoading] = useState(false);
  const [githubConnectorError, setGithubConnectorError] = useState<string | null>(null);
  const [githubConnectorAction, setGithubConnectorAction] = useState<'connect' | 'disconnect' | null>(null);
  const [githubAuthorizationPending, setGithubAuthorizationPending] = useState(false);
  const [githubAuthorizationUrl, setGithubAuthorizationUrl] = useState<string | null>(null);
  const githubConnectorRefreshId = useRef(0);
  const githubConnectorRequestInFlight = useRef(false);
  const embedded = chrome === 'embedded';

  // DS create page_view (v2 doc). Only fires for the standalone
  // /design-systems/create route — the embedded variant lives inside
  // OnboardingView, which owns the `area=design_system` step page_view.
  const analytics = useAnalytics();
  const creationPageViewFiredRef = useRef(false);
  useEffect(() => {
    if (embedded) return;
    if (creationPageViewFiredRef.current) return;
    creationPageViewFiredRef.current = true;
    const onboardingSessionId = peekOnboardingSessionId();
    trackPageView(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_create',
      view_type: 'page',
      entry_from: onboardingSessionId ? 'onboarding' : 'design_systems_page',
    });
  }, [analytics.track, embedded]);

  const refreshGithubConnector = useCallback(async () => {
    if (!composioConfigured) {
      githubConnectorRefreshId.current += 1;
      githubConnectorRequestInFlight.current = false;
      setGithubConnector(null);
      setGithubConnectorLoading(false);
      setGithubConnectorError(null);
      setGithubAuthorizationPending(false);
      setGithubAuthorizationUrl(null);
      return;
    }
    if (githubConnectorRequestInFlight.current) return;
    const refreshId = ++githubConnectorRefreshId.current;
    githubConnectorRequestInFlight.current = true;
    setGithubConnectorLoading(true);
    setGithubConnectorError(null);
    try {
      const { connector, timedOut } = await fetchGithubConnectorStatusWithTimeout();
      if (githubConnectorRefreshId.current !== refreshId) return;
      setGithubConnector(connector);
      if (connector?.status === 'connected') {
        setGithubAuthorizationPending(false);
        setGithubAuthorizationUrl(null);
      }
      if (connector?.status === 'error' && connector.lastError) {
        setGithubConnectorError(connector.lastError);
      }
      if (timedOut) {
        setGithubConnectorError(
          'Could not finish checking GitHub connector. You can still add repository URLs or connect GitHub manually.',
        );
      }
    } catch (err) {
      if (githubConnectorRefreshId.current !== refreshId) return;
      setGithubConnector(null);
      setGithubConnectorError(err instanceof Error ? err.message : 'Could not check the GitHub connector.');
    } finally {
      if (githubConnectorRefreshId.current === refreshId) {
        githubConnectorRequestInFlight.current = false;
      }
      if (githubConnectorRefreshId.current === refreshId) {
        setGithubConnectorLoading(false);
      }
    }
  }, [composioConfigured]);

  useEffect(() => {
    void refreshGithubConnector();
  }, [refreshGithubConnector]);

  useEffect(() => {
    if (!composioConfigured) return undefined;
    function handleConnectorMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: unknown }).type !== CONNECTOR_CALLBACK_MESSAGE_TYPE) return;
      if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
      void refreshGithubConnector();
    }
    function handleFocus() {
      void refreshGithubConnector();
    }
    window.addEventListener('message', handleConnectorMessage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('message', handleConnectorMessage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [composioConfigured, refreshGithubConnector]);

  async function handleConnectGithub() {
    if (!composioConfigured || githubConnectorAction) return;
    setGithubConnectorAction('connect');
    setGithubConnectorError(null);
    try {
      const result = await connectConnector(GITHUB_CONNECTOR_ID);
      if (result.error) setGithubConnectorError(result.error);
      if (result.connector) setGithubConnector(result.connector);
      if (result.auth?.redirectUrl) setGithubAuthorizationUrl(result.auth.redirectUrl);
      if (isPendingConnectorAuth(result.auth)) setGithubAuthorizationPending(true);
      if (result.auth?.kind === 'connected' || result.connector?.status === 'connected') {
        setGithubConnectorError(null);
        setGithubAuthorizationPending(false);
        setGithubAuthorizationUrl(null);
      }
    } catch (err) {
      setGithubConnectorError(err instanceof Error ? err.message : 'Could not start GitHub authorization.');
    } finally {
      setGithubConnectorAction(null);
    }
  }

  async function handleDisconnectGithub() {
    if (!composioConfigured || githubConnectorAction) return;
    setGithubConnectorAction('disconnect');
    setGithubConnectorError(null);
    try {
      const connector = await disconnectConnector(GITHUB_CONNECTOR_ID);
      setGithubConnector(connector);
      setGithubAuthorizationPending(false);
      setGithubAuthorizationUrl(null);
    } catch (err) {
      setGithubConnectorError(err instanceof Error ? err.message : 'Could not disconnect GitHub.');
    } finally {
      setGithubConnectorAction(null);
    }
  }

  function handleAddGithubUrl() {
    const nextUrl = normalizeGithubUrl(state.githubUrl);
    if (!nextUrl) return;
    setState((curr) => ({
      ...curr,
      githubUrl: '',
      githubUrls: Array.from(new Set([...curr.githubUrls, nextUrl])),
    }));
  }

  function handleRemoveGithubUrl(url: string) {
    setState((curr) => ({
      ...curr,
      githubUrls: curr.githubUrls.filter((item) => item !== url),
    }));
  }

  async function handlePickCodeFolder() {
    const selected = await openFolderDialog();
    if (!selected) return;
    setState((curr) => ({
      ...curr,
      codeFolders: Array.from(new Set([...curr.codeFolders, selected])),
    }));
  }

  function handleRemoveCodeFolder(folder: string) {
    setState((curr) => ({
      ...curr,
      codeFolders: curr.codeFolders.filter((item) => item !== folder),
      ...(curr.codeFolders.includes(folder) ? {} : { codeFiles: [], codeFileObjects: [] }),
    }));
  }

  async function generate() {
    if (generationStarting) return;
    setGenerationStarting(true);
    setError(null);
    try {
      const title = inferDesignSystemTitle(state);
      const created = await createDesignSystemDraft({
        title,
        summary: state.company,
        category: 'Custom',
        surface: 'web',
        status: 'draft',
        artifactMode: 'agent-managed',
        sourceNotes: buildSourceNotes(state),
        provenance: buildProvenance(state),
      });
      if (!created) {
        setError('Could not generate this design system.');
        setStep('setup');
        return;
      }
      const workspace = await ensureDesignSystemWorkspace(created.id);
      if (!workspace) {
        setError('Could not open the design system workspace.');
        setStep('setup');
        return;
      }
      const project = workspace.project;
      const setupState = state;
      const connector = githubConnector;
      onCreated(project.id, project);
      scheduleAfterProjectHandoff(() => {
        void prepareCreatedDesignSystemProject({
          project,
          state: setupState,
          composioConfigured,
          githubConnector: connector,
          onProjectPrepared,
          onSystemsRefresh,
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the design system project.');
      setStep('setup');
    } finally {
      setGenerationStarting(false);
    }
  }

  if (step === 'confirm') {
    return (
      <div className="ds-setup-shell ds-setup-shell--center">
        <div className="ds-setup-center-card">
          <h1>It will take about 5 minutes to generate your design system.</h1>
          <p>You can step away. Keep the tab open in the background.</p>
          <div className="ds-setup-actions">
            <button type="button" className="ghost" onClick={() => setStep('setup')}>
              <Icon name="arrow-left" />
              Back
            </button>
            <button
              type="button"
              className="primary"
              disabled={generationStarting}
              onClick={() => void generate()}
            >
              <Icon name="sparkles" />
              {generationStarting ? 'Opening project...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ds-setup-shell${embedded ? ' ds-setup-shell--embedded' : ''}`}>
      {embedded ? null : (
        <header className="ds-setup-topbar">
          <button type="button" className="ghost" onClick={onBack}>
            <Icon name="arrow-left" />
            Back
          </button>
          <span className="ds-setup-mark">
            <Icon name="blocks" />
          </span>
          <button
            type="button"
            className="primary"
            disabled={!state.company.trim()}
            onClick={() => {
              if (!state.company.trim()) {
                setError('Tell Open Design about the company or design system first.');
                return;
              }
              setStep('confirm');
            }}
          >
            Continue to generation
            <Icon name="chevron-right" />
          </button>
        </header>
      )}

      <main className="ds-setup-form">
        <h1>Generate from your material</h1>
        <p>Start with a short description, then add any source files you already have.</p>

        <label className="ds-setup-field">
          <span>Describe your brand or product</span>
          <textarea
            rows={4}
            value={state.company}
            onChange={(event) => setState((curr) => ({ ...curr, company: event.target.value }))}
            placeholder="e.g. Mission Impastabowl: fast-casual pasta restaurant with in-store touchscreen kiosk, mobile app and website"
          />
        </label>

        <section className="ds-resource-section">
          <h2>Add source material <span>(optional)</span></h2>
          <p>Use anything that shows your current style.</p>
          <div className="ds-resource-card">
            <div className="ds-resource-row">
              <strong>GitHub repo</strong>
              <div className="ds-resource-inline">
                <input
                  value={state.githubUrl}
                  onChange={(event) => setState((curr) => ({ ...curr, githubUrl: event.target.value }))}
                  placeholder="https://github.com/owner/repo"
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={!state.githubUrl.trim()}
                  onClick={handleAddGithubUrl}
                >
                  Add
                </button>
              </div>
              {state.githubUrls.length > 0 ? (
                <div className="ds-github-url-list" aria-label="Added GitHub repositories">
                  {state.githubUrls.map((url) => (
                    <span key={url}>
                      <Icon name="github" />
                      {githubRepoLabel(url)}
                      <button
                        type="button"
                        aria-label={`Remove ${githubRepoLabel(url)}`}
                        onClick={() => handleRemoveGithubUrl(url)}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <GitHubRepositoryAccessPanel
                composioConfigured={composioConfigured}
                connector={githubConnector}
                loading={githubConnectorLoading}
                action={githubConnectorAction}
                authorizationPending={githubAuthorizationPending}
                authorizationUrl={githubAuthorizationUrl}
                error={githubConnectorError}
                onOpenConnectorsTab={onOpenConnectorsTab}
                onConnect={() => void handleConnectGithub()}
                onOpenAuthorization={() => openConnectorAuthorizationUrl(githubAuthorizationUrl)}
                onDisconnect={() => void handleDisconnectGithub()}
              />
            </div>
            <DropZone
              label="Link local code"
              helper="Use a folder or selected files from this computer."
              prompt="Drag a folder here or browse"
              names={localCodeSourceLabels(state)}
              directory
              onBrowseFolder={() => void handlePickCodeFolder()}
              onRemoveName={handleRemoveCodeFolder}
              onFiles={(_names, files) => {
                const stagedFiles = selectLocalCodeFiles(files);
                const stagedNames = stagedFiles.map((file) => localCodeRelativePath(file));
                setState((curr) => ({
                  ...curr,
                  codeFiles: Array.from(new Set([...curr.codeFiles, ...stagedNames])),
                  codeFileObjects: dedupeLocalCodeFiles([...curr.codeFileObjects, ...stagedFiles]),
                }));
              }}
            />
            <DropZone
              label="Upload .fig"
              helper="Parsed locally; only a summary is added."
              prompt="Drop .fig here or browse"
              accept=".fig"
              names={state.figFiles}
              onFiles={(_names, files) => {
                const stagedFiles = selectFigmaFiles(files);
                const stagedNames = stagedFiles.map((file) => resourceRelativePath(file));
                setState((curr) => ({
                  ...curr,
                  figFiles: Array.from(new Set([...curr.figFiles, ...stagedNames])),
                  figFileObjects: dedupeResourceFiles([...curr.figFileObjects, ...stagedFiles]),
                }));
              }}
            />
            <DropZone
              label="Add assets"
              prompt="Drag files here or browse"
              names={state.assetFiles}
              onFiles={(_names, files) => {
                const stagedFiles = selectAssetFiles(files);
                const stagedNames = stagedFiles.map((file) => resourceRelativePath(file));
                setState((curr) => ({
                  ...curr,
                  assetFiles: Array.from(new Set([...curr.assetFiles, ...stagedNames])),
                  assetFileObjects: dedupeResourceFiles([...curr.assetFileObjects, ...stagedFiles]),
                }));
              }}
            />
          </div>
        </section>

        {embedded ? null : (
          <label className="ds-setup-field">
            <span>Notes</span>
            <textarea
              rows={4}
              value={state.notes}
              onChange={(event) => setState((curr) => ({ ...curr, notes: event.target.value }))}
              placeholder="e.g. We use a warm, earthy color palette with rounded corners. Our brand voice is playful but professional..."
            />
          </label>
        )}
        {error ? <div className="ds-editor-error">{error}</div> : null}
        {embedded ? (
          <div className="ds-setup-actions ds-setup-actions--embedded">
            <button type="button" className="ghost" onClick={onBack}>
              <Icon name="arrow-left" />
              Back
            </button>
            <button
              type="button"
              className="primary"
              disabled={!state.company.trim()}
              onClick={() => {
                if (!state.company.trim()) {
                  setError('Tell Open Design about the company or design system first.');
                  return;
                }
                setStep('confirm');
              }}
            >
              Generate
              <Icon name="chevron-right" />
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export function DesignSystemDetailView({
  id,
  selectedId,
  config,
  agents,
  onBack,
  onOpenProject,
  onSetDefault,
  onSystemsRefresh,
  onProjectsRefresh,
}: DetailProps) {
  const { locale } = useI18n();
  const [system, setSystem] = useState<DesignSystemDetail | null>(null);
  const [body, setBody] = useState('');
  const [tab, setTab] = useState<ReviewTab>('system');
  const [openSection, setOpenSection] = useState(0);
  const [saving, setSaving] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [generationJob, setGenerationJob] = useState<DesignSystemGenerationJob | null>(null);
  const [revisionJob, setRevisionJob] = useState<DesignSystemGenerationJob | null>(null);
  const [revisions, setRevisions] = useState<DesignSystemRevision[]>([]);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, 'good' | 'work'>>({});
  const [feedbackSection, setFeedbackSection] = useState<string | null>(null);
  const [chatSeed, setChatSeed] = useState<{ id: string; text: string } | null>(null);
  const [workspaceProjectId, setWorkspaceProjectId] = useState<string | null>(null);
  const [workspaceProjectFiles, setWorkspaceProjectFiles] = useState<ProjectFile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [projectChatMessages, setProjectChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [workspaceTabsState, setWorkspaceTabsState] = useState<OpenTabsState>({
    tabs: [],
    active: null,
  });
  const [workspaceOpenRequest, setWorkspaceOpenRequest] = useState<{ name: string; nonce: number } | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatCancelRef = useRef<AbortController | null>(null);
  const pendingWorkspaceFileWritesRef = useRef<Map<string, string>>(new Map());
  const workspaceTabsLoadedRef = useRef(false);
  const openedProjectRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSystem(null);
    setRevisions([]);
    setWorkspaceProjectId(null);
    setWorkspaceProjectFiles([]);
    setConversations([]);
    setActiveConversationId(null);
    setProjectChatMessages([]);
    setChatError(null);
    setChatSeed(null);
    setWorkspaceTabsState({ tabs: [], active: null });
    setWorkspaceOpenRequest(null);
    openedProjectRef.current = null;
    workspaceTabsLoadedRef.current = false;
    pendingWorkspaceFileWritesRef.current.clear();
    void fetchDesignSystem(id).then((detail) => {
      if (cancelled) return;
      setSystem(detail);
      setBody(detail?.body ?? '');
    });
    void fetchDesignSystemRevisions(id).then((next) => {
      if (cancelled) return;
      setRevisions(next);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!system || system.source !== 'user') return undefined;
    const designSystemId = system.id;
    let cancelled = false;
    async function syncWorkspaceProject() {
      const workspace = await ensureDesignSystemWorkspace(designSystemId);
      if (cancelled || !workspace) return;
      setWorkspaceProjectId(workspace.project.id);
      setWorkspaceProjectFiles(workspace.files);
      if (onOpenProject && openedProjectRef.current !== workspace.project.id) {
        openedProjectRef.current = workspace.project.id;
        await onProjectsRefresh?.();
        if (!cancelled) onOpenProject(workspace.project.id);
      }
    }
    void syncWorkspaceProject();
    return () => {
      cancelled = true;
    };
  }, [onOpenProject, onProjectsRefresh, system]);

  useEffect(() => {
    if (!workspaceProjectId) return undefined;
    const projectId = workspaceProjectId;
    let cancelled = false;
    async function loadWorkspaceConversation() {
      const existing = await listConversations(projectId);
      if (cancelled) return;
      if (existing.length > 0) {
        setConversations(existing);
        setActiveConversationId(existing[0]!.id);
        return;
      }
      const fresh = await createConversation(projectId, 'Design system');
      if (cancelled) return;
      if (fresh) {
        setConversations([fresh]);
        setActiveConversationId(fresh.id);
      }
    }
    void loadWorkspaceConversation();
    return () => {
      cancelled = true;
    };
  }, [workspaceProjectId]);

  useEffect(() => {
    if (!workspaceProjectId) return undefined;
    const projectId = workspaceProjectId;
    let cancelled = false;
    workspaceTabsLoadedRef.current = false;
    void loadTabs(projectId).then((state) => {
      if (cancelled) return;
      setWorkspaceTabsState(state);
      workspaceTabsLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceProjectId]);

  useEffect(() => {
    if (!workspaceProjectId || !activeConversationId) {
      setProjectChatMessages([]);
      return undefined;
    }
    let cancelled = false;
    void listMessages(workspaceProjectId, activeConversationId).then((messages) => {
      if (cancelled) return;
      setProjectChatMessages(messages);
    });
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, workspaceProjectId]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      chatCancelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const jobId = readRememberedGenerationJob(id);
    if (!jobId) {
      setGenerationJob(null);
      return undefined;
    }
    const generationJobId = jobId;
    let cancelled = false;
    let timeoutId: number | undefined;

    async function pollGenerationJob() {
      const next = await fetchDesignSystemGenerationJob(generationJobId);
      if (cancelled) return;
      if (!next) {
        clearRememberedGenerationJob(id);
        setGenerationJob(null);
        return;
      }
      setGenerationJob(next);
      if (next.status === 'succeeded') {
        clearRememberedGenerationJob(id);
        const detail = await fetchDesignSystem(id);
        if (cancelled) return;
        if (detail) {
          setSystem(detail);
          setBody(detail.body);
        }
        await onSystemsRefresh?.();
        if (!cancelled) setStatusLine('Generation completed');
        return;
      }
      if (next.status === 'failed') {
        setStatusLine(next.error ? `Generation stopped: ${next.error}` : 'Generation stopped');
        return;
      }
      timeoutId = window.setTimeout(() => void pollGenerationJob(), 700);
    }

    void pollGenerationJob();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [id, onSystemsRefresh]);

  useEffect(() => {
    if (
      !revisionJob?.id
      || revisionJob.status === 'succeeded'
      || revisionJob.status === 'failed'
    ) {
      return undefined;
    }
    const jobId = revisionJob.id;
    let cancelled = false;
    let timeoutId: number | undefined;

    async function pollRevisionJob() {
      const next = await fetchDesignSystemGenerationJob(jobId);
      if (cancelled) return;
      if (!next) {
        setStatusLine('Could not read revision progress');
        return;
      }
      setRevisionJob(next);
      if (next.status === 'succeeded') {
        const nextRevisions = await fetchDesignSystemRevisions(id);
        if (cancelled) return;
        setRevisions(nextRevisions);
        await onSystemsRefresh?.();
        if (!cancelled) setStatusLine('Revision ready for review');
        return;
      }
      if (next.status === 'failed') {
        setStatusLine(next.error ? `Revision stopped: ${next.error}` : 'Revision stopped');
        return;
      }
      timeoutId = window.setTimeout(() => void pollRevisionJob(), 650);
    }

    timeoutId = window.setTimeout(() => void pollRevisionJob(), 250);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [id, onSystemsRefresh, revisionJob?.id, revisionJob?.status]);

  const sections = useMemo(() => parseDesignSystemSections(body), [body]);
  const published = system?.status === 'published';
  const editable = system?.isEditable !== false;
  const activeJob = revisionJob ?? generationJob;
  const pendingRevision = revisions.find((revision) => revision.status === 'pending') ?? null;
  const recentRevisions = revisions.slice(0, 5);
  const generationActive =
    activeJob?.status === 'queued' || activeJob?.status === 'running';

  // Multi-surface DS page_view (v2 doc). One emission per
  // (system, generationActive) transition: while generation is
  // running we surface `area=design_system_generation`; once it
  // settles we surface `area=design_system_preview`. The fourth
  // onboarding step (`area=generation_progress`) piggy-backs on the
  // generation emission when an onboarding session id is present.
  const analytics = useAnalytics();
  const designSystemStatus: TrackingDesignSystemStatus = generationActive
    ? 'generating'
    : (system?.status as TrackingDesignSystemStatus | undefined) ?? 'unknown';
  useEffect(() => {
    if (!system) return;
    const onboardingSessionId = peekOnboardingSessionId();
    const entryFrom: TrackingDesignSystemsEntryFrom = onboardingSessionId
      ? 'onboarding'
      : 'unknown';
    if (generationActive) {
      trackPageView(analytics.track, {
        page_name: 'design_system_project',
        area: 'design_system_generation',
        view_type: 'page',
        entry_from: entryFrom,
        design_system_id: system.id,
        // Origin is the DS's provenance-style source. We don't yet
        // have a precise mapping from `system.source` / provenance
        // metadata to the v2 enum, so we report `unknown` rather
        // than mis-tag — dashboards still see the funnel via
        // `entry_from`. A follow-up can derive this honestly.
        design_system_source: 'unknown',
        design_system_status: 'generating',
      });
      if (onboardingSessionId) {
        trackPageView(analytics.track, {
          page_name: 'onboarding',
          area: 'generation_progress',
          step_index: 'progress',
          step_name: 'generation',
          onboarding_session_id: onboardingSessionId,
        });
        // Generation is the last onboarding step; clear so a later
        // DS visit unrelated to onboarding doesn't re-attribute.
        clearOnboardingSessionId();
      }
    } else {
      trackPageView(analytics.track, {
        page_name: 'design_system_project',
        area: 'design_system_preview',
        view_type: 'page',
        entry_from: entryFrom,
        design_system_id: system.id,
        design_system_source: 'unknown',
        design_system_status: designSystemStatus,
      });
    }
  }, [analytics.track, system?.id, generationActive, designSystemStatus, system]);
  const introChatMessages = useMemo(
    () => buildDesignSystemChatMessages({
      system,
      activeJob,
      revisions: recentRevisions,
      generationActive,
    }),
    [activeJob, generationActive, recentRevisions, system],
  );
  const chatMessages = projectChatMessages.length > 0 ? projectChatMessages : introChatMessages;
  const workspaceActivityMessage = useMemo(
    () => findWorkspaceActivityMessage(chatMessages),
    [chatMessages],
  );

  async function savePatch(input: Partial<DesignSystemDetail>) {
    if (!system || !editable) return null;
    setSaving(true);
    setStatusLine(null);
    try {
      const updated = await updateDesignSystemDraft(system.id, input);
      if (updated) {
        setSystem(updated);
        setBody(updated.body);
        await onSystemsRefresh?.();
      }
      return updated;
    } finally {
      setSaving(false);
    }
  }

  async function saveBody() {
    const nextBody = body;
    const updated = await savePatch({ body: nextBody });
    if (updated && workspaceProjectId) {
      await writeProjectTextFile(workspaceProjectId, 'DESIGN.md', nextBody);
      await refreshWorkspaceProjectFiles(workspaceProjectId);
    }
    setStatusLine(updated ? 'Saved DESIGN.md' : 'Could not save changes');
  }

  async function togglePublished(next: boolean) {
    const updated = await savePatch({ body, status: next ? 'published' : 'draft' });
    setStatusLine(updated ? (next ? 'Published' : 'Moved back to draft') : 'Could not update status');
  }

  async function ensureWorkspaceProject() {
    if (!system) return workspaceProjectId;
    if (workspaceProjectId) return workspaceProjectId;
    const workspace = await ensureDesignSystemWorkspace(system.id);
    if (!workspace) return null;
    setWorkspaceProjectId(workspace.project.id);
    setWorkspaceProjectFiles(workspace.files);
    return workspace.project.id;
  }

  const refreshWorkspaceProjectFiles = useCallback(async (projectId: string) => {
    const next = await fetchProjectFiles(projectId);
    setWorkspaceProjectFiles(next);
    return next;
  }, []);

  const syncDesignSystemBodyFromWorkspace = useCallback(async (projectId: string) => {
    if (!system || !editable) return false;
    const nextBody = await fetchProjectFileText(projectId, 'DESIGN.md', {
      cache: 'no-store',
      cacheBustKey: Date.now(),
    });
    if (!nextBody || nextBody === body) return false;
    const updated = await updateDesignSystemDraft(system.id, { body: nextBody });
    if (!updated) return false;
    setSystem(updated);
    setBody(updated.body);
    await onSystemsRefresh?.();
    return true;
  }, [body, editable, onSystemsRefresh, system]);

  const refreshDesignSystemWorkspace = useCallback(async (projectId: string) => {
    const nextFiles = await refreshWorkspaceProjectFiles(projectId);
    await syncDesignSystemBodyFromWorkspace(projectId);
    return nextFiles;
  }, [refreshWorkspaceProjectFiles, syncDesignSystemBodyFromWorkspace]);

  const persistProjectMessage = useCallback(
    (projectId: string, conversationId: string | null, message: ChatMessage) => {
      if (!conversationId) return;
      void saveMessage(projectId, conversationId, message);
    },
    [],
  );

  const persistWorkspaceTabsState = useCallback(
    (next: OpenTabsState) => {
      setWorkspaceTabsState(next);
      if (workspaceProjectId && workspaceTabsLoadedRef.current) {
        void saveTabs(workspaceProjectId, next);
      }
    },
    [workspaceProjectId],
  );

  const requestWorkspaceFileOpen = useCallback((name: string) => {
    if (!name) return;
    setWorkspaceOpenRequest({ name, nonce: Date.now() });
  }, []);

  const sendProjectChatMessage = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[],
    ) => {
      const rawText = prompt.trim();
      if (!rawText || chatStreaming || !system) return;
      const text = feedbackSection ? `${rawText}\n\nFocus section: ${feedbackSection}` : rawText;
      const projectId = workspaceProjectId ?? await ensureWorkspaceProject();
      if (!projectId) {
        setChatError('Could not open the design system workspace.');
        return;
      }
      let conversationId = activeConversationId;
      if (!conversationId) {
        const fresh = await createConversation(projectId, 'Design system');
        if (!fresh) {
          setChatError('Could not create a design system conversation.');
          return;
        }
        setConversations([fresh]);
        setActiveConversationId(fresh.id);
        conversationId = fresh.id;
      }
      if (config.mode !== 'daemon' || !config.agentId) {
        setChatError('Pick a local agent first, then ask Open Design to update this design system.');
        return;
      }

      setChatError(null);
      setStatusLine(null);
      setChatSeed(null);
      setFeedbackSection(null);
      const startedAt = Date.now();
      const userMsg: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        content: text,
        createdAt: startedAt,
        attachments: attachments.length > 0 ? attachments : undefined,
        commentAttachments: commentAttachments.length > 0 ? commentAttachments : undefined,
      };
      const selectedAgent = agents.find((agent) => agent.id === config.agentId);
      const selectedModel = config.agentModels?.[config.agentId];
      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: '',
        agentId: config.agentId,
        agentName: [selectedAgent?.name ?? config.agentId, selectedModel?.model].filter(Boolean).join(' · '),
        events: [],
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      };
      const previousMessages = projectChatMessages.length > 0 ? projectChatMessages : introChatMessages;
      const nextHistory = [...previousMessages, userMsg];
      const agentHistory = [
        ...previousMessages,
        {
          ...userMsg,
          content: designSystemWorkspaceAgentPrompt(text),
        },
      ];
      let assistantSnapshot = assistantMsg;
      const updateAssistant = (updater: (message: ChatMessage) => ChatMessage, persist = false) => {
        assistantSnapshot = updater(assistantSnapshot);
        setProjectChatMessages((current) =>
          current.map((message) => message.id === assistantSnapshot.id ? assistantSnapshot : message),
        );
        if (persist) persistProjectMessage(projectId, conversationId, assistantSnapshot);
      };

      setProjectChatMessages([...nextHistory, assistantMsg]);
      persistProjectMessage(projectId, conversationId, userMsg);
      if (projectChatMessages.length === 0) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, title: text.slice(0, 60) || 'Design system' }
              : conversation,
          ),
        );
        void patchConversation(projectId, conversationId, {
          title: text.slice(0, 60) || 'Design system',
        });
      }

      const controller = new AbortController();
      const cancelController = new AbortController();
      chatAbortRef.current = controller;
      chatCancelRef.current = cancelController;
      pendingWorkspaceFileWritesRef.current.clear();
      setChatStreaming(true);

      void streamViaDaemon({
        agentId: config.agentId,
        history: agentHistory,
        signal: controller.signal,
        cancelSignal: cancelController.signal,
        projectId,
        conversationId,
        assistantMessageId: assistantMsg.id,
        clientRequestId: randomUUID(),
        skillId: null,
        designSystemId: system.id,
        attachments: attachments.map((attachment) => attachment.path),
        commentAttachments,
        model: selectedModel?.model ?? null,
        reasoning: selectedModel?.reasoning ?? null,
        locale,
        handlers: {
          onDelta: (delta) => {
            updateAssistant((message) => ({
              ...message,
              content: message.content + delta,
              events: [...(message.events ?? []), { kind: 'text', text: delta }],
            }));
          },
          onAgentEvent: (event: AgentEvent) => {
            if (event.kind === 'text') return;
            updateAssistant((message) => ({
              ...message,
              events: [...(message.events ?? []), event],
            }));
            if (event.kind === 'tool_use') {
              const filePath = writableProjectFilePathFromToolUse(event);
              if (filePath) pendingWorkspaceFileWritesRef.current.set(event.id, filePath);
              return;
            }
            if (event.kind === 'tool_result') {
              const filePath = pendingWorkspaceFileWritesRef.current.get(event.toolUseId);
              if (!filePath) return;
              pendingWorkspaceFileWritesRef.current.delete(event.toolUseId);
              if (event.isError) return;
              void refreshWorkspaceProjectFiles(projectId).then((nextFiles) => {
                const decision = decideAutoOpenAfterWrite(filePath, nextFiles);
                if (decision.shouldOpen && decision.fileName) {
                  requestWorkspaceFileOpen(decision.fileName);
                }
                if (isDesignSystemSourcePath(filePath)) {
                  void syncDesignSystemBodyFromWorkspace(projectId);
                }
              });
            }
          },
          onDone: () => {
            updateAssistant(
              (message) => ({
                ...message,
                endedAt: Date.now(),
                runStatus: message.runStatus === 'failed' || message.runStatus === 'canceled'
                  ? message.runStatus
                  : 'succeeded',
              }),
              true,
            );
            setChatStreaming(false);
            chatAbortRef.current = null;
            chatCancelRef.current = null;
            pendingWorkspaceFileWritesRef.current.clear();
            void (async () => {
              await refreshWorkspaceProjectFiles(projectId);
              const synced = await syncDesignSystemBodyFromWorkspace(projectId);
              const audit = await fetchProjectDesignSystemPackageAudit(projectId);
              const auditSummary = audit ? summarizeDesignSystemPackageAudit(audit) : null;
              if (auditSummary) {
                updateAssistant(
                  (message) => ({
                    ...message,
                    events: [...(message.events ?? []), { kind: 'status', label: 'audit', detail: auditSummary }],
                  }),
                  true,
                );
              }
              const repairPrompt = audit ? buildDesignSystemPackageAuditRepairPrompt(audit) : null;
              if (repairPrompt) {
                setChatSeed({ id: `audit-${Date.now()}`, text: repairPrompt });
              }
              if (auditSummary) {
                setStatusLine(
                  repairPrompt
                    ? `${auditSummary} The next repair prompt is ready in chat.`
                    : `Workspace updated. ${auditSummary}`,
                );
              } else {
                setStatusLine(
                  synced
                    ? 'Workspace updated and DESIGN.md synced for review.'
                    : 'Workspace updated. Review the files or ask for another change.',
                );
              }
              await onProjectsRefresh?.();
            })();
          },
          onError: (error) => {
            const message = error.message;
            setChatError(message);
            updateAssistant(
              (previous) => ({
                ...appendErrorStatusEvent(previous, message),
                endedAt: Date.now(),
                runStatus: 'failed',
              }),
              true,
            );
            setChatStreaming(false);
            chatAbortRef.current = null;
            chatCancelRef.current = null;
            pendingWorkspaceFileWritesRef.current.clear();
          },
        },
        onRunCreated: (runId) => {
          updateAssistant((message) => ({ ...message, runId, runStatus: 'queued' }), true);
        },
        onRunStatus: (runStatus) => {
          updateAssistant(
            (message) => ({
              ...message,
              runStatus,
              endedAt:
                runStatus === 'succeeded' || runStatus === 'failed' || runStatus === 'canceled'
                  ? message.endedAt ?? Date.now()
                  : message.endedAt,
            }),
            runStatus === 'succeeded' || runStatus === 'failed' || runStatus === 'canceled',
          );
        },
        onRunEventId: (lastRunEventId) => {
          updateAssistant((message) => ({ ...message, lastRunEventId }));
        },
      });
    },
    [
      activeConversationId,
      agents,
      chatStreaming,
      config.agentId,
      config.agentModels,
      config.mode,
      ensureWorkspaceProject,
      feedbackSection,
      introChatMessages,
      locale,
      onProjectsRefresh,
      persistProjectMessage,
      projectChatMessages,
      refreshWorkspaceProjectFiles,
      requestWorkspaceFileOpen,
      syncDesignSystemBodyFromWorkspace,
      system,
      workspaceProjectId,
    ],
  );

  const stopProjectChat = useCallback(() => {
    chatCancelRef.current?.abort();
    chatAbortRef.current?.abort();
    chatCancelRef.current = null;
    chatAbortRef.current = null;
    pendingWorkspaceFileWritesRef.current.clear();
    setChatStreaming(false);
  }, []);

  const createProjectChatConversation = useCallback(() => {
    const projectId = workspaceProjectId;
    if (!projectId) {
      setChatSeed({
        id: `general-${Date.now()}`,
        text: 'Update this design system: ',
      });
      return;
    }
    void createConversation(projectId, 'Design system').then((fresh) => {
      if (!fresh) return;
      setConversations((current) => [fresh, ...current]);
      setActiveConversationId(fresh.id);
      setProjectChatMessages([]);
      setChatSeed({
        id: `general-${Date.now()}`,
        text: 'Update this design system: ',
      });
    });
  }, [workspaceProjectId]);

  async function resolveRevision(
    revision: DesignSystemRevision,
    status: 'accepted' | 'rejected',
  ) {
    if (!system) return;
    setSaving(true);
    setStatusLine(null);
    try {
      const updatedRevision = await updateDesignSystemRevisionStatus(
        system.id,
        revision.id,
        status,
      );
      if (!updatedRevision) {
        setStatusLine(status === 'accepted' ? 'Could not accept revision' : 'Could not reject revision');
        return;
      }
      const [detail, nextRevisions] = await Promise.all([
        fetchDesignSystem(system.id),
        fetchDesignSystemRevisions(system.id),
      ]);
      if (detail) {
        setSystem(detail);
        setBody(detail.body);
      }
      setRevisions(nextRevisions);
      await onSystemsRefresh?.();
      setStatusLine(status === 'accepted' ? 'Revision accepted' : 'Revision rejected');
    } finally {
      setSaving(false);
    }
  }

  if (!system) {
    return (
      <div className="ds-setup-shell ds-setup-shell--center">
        <div className="ds-setup-center-card">
          <h1>Loading design system...</h1>
          <p>Opening the review workspace.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-workspace">
      <aside className="ds-project-chat">
        <div className="ds-project-chat__bar">
          <button type="button" className="icon-only" onClick={onBack} aria-label="Back">
            <Icon name="arrow-left" />
          </button>
          <strong>{system.title}</strong>
          <span>{published ? 'Published' : 'Draft'}</span>
        </div>
        <div className="ds-project-chat__pane">
          <ChatPane
            key={`${activeConversationId ?? 'design-system-chat'}:${chatSeed?.id ?? 'ready'}`}
            messages={chatMessages}
            streaming={generationActive || saving || chatStreaming}
            error={chatError}
            projectId={workspaceProjectId}
            projectFiles={workspaceProjectFiles}
            onEnsureProject={ensureWorkspaceProject}
            onSend={(prompt, attachments, commentAttachments) => {
              void sendProjectChatMessage(prompt, attachments, commentAttachments);
            }}
            onStop={stopProjectChat}
            initialDraft={chatSeed?.text}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={setActiveConversationId}
            onDeleteConversation={() => {}}
            onNewConversation={createProjectChatConversation}
          />
        </div>
      </aside>

      <main className="ds-review-main">
        <header className="ds-review-tabs">
          <button type="button" className="ghost" onClick={onBack}>
            <Icon name="arrow-left" />
            Back
          </button>
          <div className="segmented">
            <button
              type="button"
              className={tab === 'system' ? 'active' : ''}
              onClick={() => setTab('system')}
            >
              Design System
            </button>
            <button
              type="button"
              className={tab === 'files' ? 'active' : ''}
              onClick={() => setTab('files')}
            >
              Design Files
            </button>
          </div>
          <button type="button" className="ghost">
            Share
          </button>
        </header>

        {tab === 'system' ? (
          <div className="ds-review-column">
            <h1>Review draft design system</h1>
            <div className="ds-review-rule" aria-hidden />
            {activeJob ? <GenerationStatusCard job={activeJob} /> : null}
            <div className="ds-publish-card">
              <p>
                {generationActive
                  ? activeJob?.kind === 'revision'
                    ? 'Open Design is applying your feedback. You can keep reviewing while the updated draft is prepared.'
                    : 'Open Design is still working, but you can start giving feedback on the work so far.'
                  : 'Open Design is ready for review. Give feedback on the work so far, then publish when it is useful for future projects.'}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={published}
                  disabled={!editable || saving}
                  onChange={(event) => void togglePublished(event.target.checked)}
                />
                Published
              </label>
              {selectedId !== system.id ? (
                <button type="button" className="ghost compact" onClick={() => onSetDefault(system.id)}>
                  Make default
                </button>
              ) : null}
            </div>
            <DesignSystemPackageCard system={system} />
            <div className="ds-warning-card">
              <Icon name="help-circle" />
              <span>
                <strong>Missing brand fonts</strong>
                Open Design is rendering typography with substitute web fonts.
              </span>
              <button type="button" className="ghost compact">
                <Icon name="upload" />
                Upload fonts
              </button>
            </div>
            {statusLine ? <div className="ds-status-line">{statusLine}</div> : null}
            <WorkspaceActivityCard message={workspaceActivityMessage} active={chatStreaming} />
            {pendingRevision ? (
              <RevisionDiffCard
                revision={pendingRevision}
                saving={saving}
                onAccept={() => void resolveRevision(pendingRevision, 'accepted')}
                onReject={() => void resolveRevision(pendingRevision, 'rejected')}
              />
            ) : null}

            <div className="ds-review-sections">
              {sections.map((section, index) => {
                const isOpen = index === openSection;
                return (
                  <article className="ds-review-section" key={`${section.title}-${index}`}>
                    <button
                      type="button"
                      className="ds-review-section__head"
                      onClick={() => setOpenSection(isOpen ? -1 : index)}
                    >
                      <span>
                        <strong>{section.title}</strong>
                        <small>{section.subtitle}</small>
                      </span>
                      <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
                    </button>
                    {isOpen ? (
                      <div className="ds-review-section__body">
                        <div className="ds-section-actions">
                          <button
                            type="button"
                            className={`ghost success ${reviewDecisions[section.title] === 'good' ? 'active' : ''}`}
                            onClick={() => {
                              setReviewDecisions((curr) => ({ ...curr, [section.title]: 'good' }));
                              setStatusLine(`${section.title} marked as looks good`);
                            }}
                          >
                            <Icon name="check" />
                            Looks good
                          </button>
                          <button
                            type="button"
                            className={`ghost danger ${reviewDecisions[section.title] === 'work' ? 'active' : ''}`}
                            onClick={() => {
                              setReviewDecisions((curr) => ({ ...curr, [section.title]: 'work' }));
                              setFeedbackSection(section.title);
                              setChatSeed({
                                id: `${section.title}-${Date.now()}`,
                                text: `Needs work on ${section.title}: `,
                              });
                            }}
                          >
                            <Icon name="comment" />
                            Needs work...
                          </button>
                        </div>
                        <pre>{section.body}</pre>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <label className="ds-body-editor">
              DESIGN.md
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={16}
                disabled={!editable}
              />
            </label>
            <button type="button" className="primary" disabled={!editable || saving} onClick={() => void saveBody()}>
              Save DESIGN.md
            </button>
            {recentRevisions.length > 0 ? <RevisionHistoryList revisions={recentRevisions} /> : null}
          </div>
        ) : (
          <div className="ds-file-workspace-host">
            {workspaceProjectId ? (
              <FileWorkspace
                projectId={workspaceProjectId}
                projectKind="prototype"
                files={workspaceProjectFiles}
                liveArtifacts={[]}
                onRefreshFiles={() => {
                  void refreshDesignSystemWorkspace(workspaceProjectId);
                }}
                isDeck={false}
                streaming={chatStreaming || generationActive || saving}
                openRequest={workspaceOpenRequest}
                tabsState={workspaceTabsState}
                onTabsStateChange={persistWorkspaceTabsState}
              />
            ) : (
              <div className="viewer-empty">Opening the design system workspace...</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function buildDesignSystemChatMessages({
  system,
  activeJob,
  revisions,
  generationActive,
}: {
  system: DesignSystemDetail | null;
  activeJob: DesignSystemGenerationJob | null;
  revisions: DesignSystemRevision[];
  generationActive: boolean;
}): ChatMessage[] {
  const createdAt = timestampFromIso(system?.createdAt) ?? Date.now();
  const messages: ChatMessage[] = [
    {
      id: 'design-system-create-request',
      role: 'user',
      content: 'Create design system',
      createdAt,
    },
    {
      id: activeJob ? `design-system-agent-${activeJob.id}` : 'design-system-agent-ready',
      role: 'assistant',
      content: designSystemAssistantMessage(system, activeJob, generationActive),
      events: [{ kind: 'text', text: designSystemAssistantMessage(system, activeJob, generationActive) }],
      createdAt: createdAt + 1,
      runId: activeJob?.id,
      runStatus: activeJob
        ? activeJob.status === 'failed'
          ? 'failed'
          : activeJob.status === 'succeeded'
            ? 'succeeded'
            : 'running'
        : undefined,
    },
  ];

  for (const revision of [...revisions].reverse()) {
    const revisionTs = timestampFromIso(revision.createdAt) ?? Date.now();
    messages.push({
      id: `design-system-revision-user-${revision.id}`,
      role: 'user',
      content: revision.sectionTitle
        ? `${revision.feedback}\n\nSection: ${revision.sectionTitle}`
        : revision.feedback,
      createdAt: revisionTs,
    });
    messages.push({
      id: `design-system-revision-assistant-${revision.id}`,
      role: 'assistant',
      content: designSystemRevisionAssistantMessage(revision),
      events: [{ kind: 'text', text: designSystemRevisionAssistantMessage(revision) }],
      createdAt: revisionTs + 1,
      runId: revision.jobId,
      runStatus: revision.status === 'pending' ? 'succeeded' : undefined,
    });
  }

  return messages;
}

function designSystemRevisionAssistantMessage(revision: DesignSystemRevision): string {
  if (revision.status === 'pending') {
    return 'I prepared a proposed update. Review the diff card on the right, then accept it or ask for another change.';
  }
  if (revision.status === 'accepted') {
    return 'Accepted. The design system draft now includes this update.';
  }
  return 'Rejected. I left the current design system unchanged.';
}

function designSystemAssistantMessage(
  system: DesignSystemDetail | null,
  activeJob: DesignSystemGenerationJob | null,
  generationActive: boolean,
): string {
  const summary = system?.summary?.trim();
  if (generationActive) {
    if (activeJob?.kind === 'revision') {
      return 'I am applying your feedback to the design system. You can keep reviewing the current draft while the revision runs.';
    }
    return 'I am creating the design system workspace, preview cards, and supporting files from the context you provided.';
  }
  const base = 'Your design system draft is ready. Review the Design System tab, inspect generated files, publish it, or ask me for changes here.';
  return summary ? `${base}\n\nCaptured direction: ${summary}` : base;
}

function designSystemWorkspaceAgentPrompt(feedback: string): string {
  return [
    feedback,
    '',
    'Design system workspace instructions:',
    '- Treat this project folder as the editable design-system workspace.',
    '- Update DESIGN.md when the design guidance, tokens, components, brand rules, or review sections change.',
    '- Update supporting preview files, CSS tokens, assets, or UI kit examples when they help make the design system reviewable.',
    '- Keep changes scoped to this design system. Preserve existing file names unless a new supporting file is clearly needed.',
    '- After editing, briefly summarize what changed and which files are ready to review.',
  ].join('\n');
}

function findWorkspaceActivityMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant') continue;
    if (message.events?.some((event) => event.kind !== 'text')) return message;
    if (message.runStatus === 'queued' || message.runStatus === 'running') return message;
    if (message.runStatus === 'succeeded' || message.runStatus === 'failed' || message.runStatus === 'canceled')
      return message;
  }
  return null;
}

function DesignSystemPackageCard({ system }: { system: DesignSystemDetail }) {
  const info = system.packageInfo;
  const manifest = info?.manifest;
  const evidence = info?.sourceEvidence;
  const sourceLabel = manifest?.source?.type ? sourceTypeLabel(manifest.source.type) : sourceTypeLabel(system.source);
  const previewPages = manifest?.preview?.pages ?? [];
  const sourceFiles = manifest?.sourceFiles;
  const sourceFileCount = [sourceFiles?.scanned, sourceFiles?.evidence, sourceFiles?.tokens, sourceFiles?.snippets]
    .filter(Boolean)
    .length;
  const protocolItems = [
    manifest?.usage ? manifest.usage : null,
    manifest?.files?.design ?? 'DESIGN.md',
    manifest?.files?.tokens ?? 'tokens.css',
    manifest?.files?.components,
    manifest?.componentsManifest,
  ].filter((item): item is string => typeof item === 'string' && item.length > 0);
  const evidenceStats = [
    evidence?.scannedFileCount !== undefined ? { label: 'Scanned files', value: String(evidence.scannedFileCount) } : null,
    evidence?.tokenCount !== undefined ? { label: 'Source tokens', value: String(evidence.tokenCount) } : null,
    evidence?.snippetCount !== undefined ? { label: 'Snippets', value: String(evidence.snippetCount) } : null,
    manifest?.fonts?.length ? { label: 'Fonts', value: String(manifest.fonts.length) } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
  const confidence = evidence?.confidence ? Object.entries(evidence.confidence) : [];

  return (
    <section className="ds-package-card">
      <div className="ds-package-card__head">
        <span>
          <strong>{manifest ? 'Structured import package' : 'Legacy design system'}</strong>
          <small>
            {manifest
              ? `${sourceLabel} · ${manifest.importMode ?? 'normalized'} mode · manifest indexed`
              : `${sourceLabel} · DESIGN.md-only fallback`}
          </small>
        </span>
        <span className={manifest ? 'ds-package-pill is-ready' : 'ds-package-pill'}>
          {manifest ? 'Hybrid ready' : 'Fallback'}
        </span>
      </div>

      <div className="ds-package-grid">
        <div>
          <h2>Agent push layer</h2>
          <div className="ds-package-chips">
            {protocolItems.map((item) => (
              <code key={item}>{item}</code>
            ))}
          </div>
        </div>
        <div>
          <h2>Pull layer</h2>
          <div className="ds-package-metrics">
            <span><strong>{previewPages.length}</strong><small>Preview pages</small></span>
            <span><strong>{sourceFileCount}</strong><small>Evidence indexes</small></span>
            <span><strong>{manifest?.assetsDir ? 'Yes' : 'No'}</strong><small>Assets</small></span>
          </div>
        </div>
      </div>

      {evidenceStats.length > 0 || confidence.length > 0 ? (
        <div className="ds-evidence-panel">
          <div className="ds-evidence-stats">
            {evidenceStats.map((item) => (
              <span key={item.label}>
                <strong>{item.value}</strong>
                <small>{item.label}</small>
              </span>
            ))}
          </div>
          {confidence.length > 0 ? (
            <div className="ds-confidence-row">
              {confidence.map(([key, value]) => (
                <span key={key}>{key}: {String(value)}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {manifest ? (
        <div className="ds-package-files">
          <PackageFileGroup
            title="Preview"
            files={previewPages.map((page) => ({
              path: page.path ?? '',
              meta: [page.title, page.role].filter(Boolean).join(' · '),
            }))}
          />
          <PackageFileGroup
            title="Source evidence"
            files={[
              sourceFiles?.scanned ? { path: sourceFiles.scanned, meta: 'Scanned file inventory' } : null,
              sourceFiles?.evidence ? { path: sourceFiles.evidence, meta: 'Evidence notes' } : null,
              sourceFiles?.tokens ? { path: sourceFiles.tokens, meta: 'Token extraction evidence' } : null,
              sourceFiles?.snippets ? { path: sourceFiles.snippets, meta: 'Snippet index' } : null,
            ].filter((item): item is { path: string; meta: string } => item !== null)}
          />
        </div>
      ) : null}
      {evidence?.evidenceExcerpt ? (
        <pre className="ds-evidence-excerpt">{evidence.evidenceExcerpt}</pre>
      ) : null}
    </section>
  );
}

function PackageFileGroup({
  title,
  files,
}: {
  title: string;
  files: Array<{ path: string; meta?: string }>;
}) {
  const visibleFiles = files.filter((file) => file.path.length > 0);
  if (visibleFiles.length === 0) return null;
  return (
    <div>
      <h2>{title}</h2>
      <div className="ds-package-file-list">
        {visibleFiles.map((file) => (
          <span key={file.path}>
            <code>{file.path}</code>
            {file.meta ? <small>{file.meta}</small> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function sourceTypeLabel(value: string | undefined): string {
  if (value === 'github') return 'GitHub import';
  if (value === 'local') return 'Local import';
  if (value === 'bundled' || value === 'built-in') return 'Bundled';
  if (value === 'user') return 'User workspace';
  if (value === 'installed') return 'Installed';
  return 'Design system';
}

function WorkspaceActivityCard({
  message,
  active,
}: {
  message: ChatMessage | null;
  active: boolean;
}) {
  const events = message?.events ?? [];
  const todos = latestTodosFromEvents(events);
  const fileOps = deriveFileOps(events);
  const status = workspaceActivityStatus(message, active);
  const statusDetail = latestStatusDetail(events);
  const hasActivity =
    active
    || todos.length > 0
    || fileOps.length > 0
    || statusDetail !== null
    || status === 'failed';

  if (!hasActivity) return null;

  const progress = workspaceActivityProgress(status, todos, fileOps);
  return (
    <section className={`ds-workspace-activity-card is-${status}`}>
      <div className="ds-workspace-activity-head">
        <Icon name={status === 'running' ? 'sparkles' : status === 'failed' ? 'help-circle' : 'check'} />
        <span>
          <strong>
            {status === 'running'
              ? 'Open Design is updating this system'
              : status === 'failed'
                ? 'Workspace update needs attention'
                : 'Workspace update ready'}
          </strong>
          <small>{statusDetail ?? workspaceActivityFallbackDetail(status)}</small>
        </span>
      </div>
      <div
        className="ds-generation-review-progress"
        role="progressbar"
        aria-label={`Workspace update progress ${progress}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      {todos.length > 0 ? (
        <div className="ds-workspace-todos">
          {todos.slice(0, 6).map((todo, index) => (
            <span key={`${todo.content}-${index}`} className={`is-${todoStatusClass(todo.status)}`}>
              {todo.status === 'completed' ? <Icon name="check" /> : null}
              {todo.content}
            </span>
          ))}
        </div>
      ) : (
        <div className="ds-generation-review-steps">
          {fallbackWorkspaceSteps(status, fileOps).map((step) => (
            <span key={step.title} className={`is-${step.status}`}>
              {step.status === 'succeeded' ? <Icon name="check" /> : null}
              {step.title}
            </span>
          ))}
        </div>
      )}
      {fileOps.length > 0 ? (
        <div className="ds-workspace-files-touched">
          <span>Files touched</span>
          <div>
            {fileOps.slice(0, 5).map((entry) => (
              <code key={entry.fullPath} className={`is-${entry.status}`}>
                {entry.path}
              </code>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function workspaceActivityStatus(
  message: ChatMessage | null,
  active: boolean,
): 'running' | 'succeeded' | 'failed' {
  if (active || message?.runStatus === 'queued' || message?.runStatus === 'running') return 'running';
  if (message?.runStatus === 'failed' || message?.runStatus === 'canceled') return 'failed';
  return 'succeeded';
}

function latestStatusDetail(events: AgentEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || event.kind !== 'status') continue;
    const label = event.label.replace(/[_-]/g, ' ');
    return event.detail ? `${label}: ${event.detail}` : label;
  }
  return null;
}

function workspaceActivityFallbackDetail(status: 'running' | 'succeeded' | 'failed'): string {
  if (status === 'running') return 'Watching project files and preparing the review draft.';
  if (status === 'failed') return 'The chat message has the run details. You can adjust the request and try again.';
  return 'Review the updated Design System and Design Files tabs.';
}

function workspaceActivityProgress(
  status: 'running' | 'succeeded' | 'failed',
  todos: ReturnType<typeof latestTodosFromEvents>,
  fileOps: ReturnType<typeof deriveFileOps>,
): number {
  if (status === 'succeeded' || status === 'failed') return 100;
  if (todos.length > 0) {
    const completed = todos.filter((todo) => todo.status === 'completed').length;
    const inProgress = todos.some((todo) => todo.status === 'in_progress') ? 0.5 : 0;
    return Math.max(18, Math.min(92, Math.round(((completed + inProgress) / todos.length) * 100)));
  }
  if (fileOps.some((entry) => entry.ops.includes('write') || entry.ops.includes('edit'))) return 72;
  if (fileOps.length > 0) return 38;
  return 18;
}

function todoStatusClass(status: ReturnType<typeof latestTodosFromEvents>[number]['status']): 'pending' | 'running' | 'succeeded' | 'failed' {
  if (status === 'completed') return 'succeeded';
  if (status === 'in_progress') return 'running';
  if (status === 'stopped') return 'failed';
  return 'pending';
}

function fallbackWorkspaceSteps(
  status: 'running' | 'succeeded' | 'failed',
  fileOps: ReturnType<typeof deriveFileOps>,
): Array<{ title: string; status: 'pending' | 'running' | 'succeeded' | 'failed' }> {
  const hasRead = fileOps.some((entry) => entry.ops.includes('read'));
  const hasMutation = fileOps.some((entry) => entry.ops.includes('write') || entry.ops.includes('edit'));
  const hasError = status === 'failed' || fileOps.some((entry) => entry.status === 'error');
  return [
    {
      title: 'Read current system',
      status: hasRead || hasMutation || status === 'succeeded' ? 'succeeded' : status === 'running' ? 'running' : 'pending',
    },
    {
      title: 'Update design files',
      status: hasError
        ? 'failed'
        : hasMutation
          ? fileOps.some((entry) => entry.status === 'running') ? 'running' : 'succeeded'
          : status === 'running'
            ? 'pending'
            : 'succeeded',
    },
    {
      title: 'Refresh review',
      status: status === 'succeeded' ? 'succeeded' : status === 'failed' ? 'failed' : 'pending',
    },
  ];
}

const WORKSPACE_FILE_MUTATION_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'create_file', 'str_replace_edit', 'multi_edit']);

function writableProjectFilePathFromToolUse(
  event: Extract<AgentEvent, { kind: 'tool_use' }>,
): string | null {
  if (!WORKSPACE_FILE_MUTATION_TOOLS.has(event.name)) return null;
  return filePathFromToolInput(event.input);
}

function filePathFromToolInput(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const filePath = record.file_path ?? record.path;
  return typeof filePath === 'string' && filePath.trim() ? filePath : null;
}

function isDesignSystemSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return normalized === 'design.md' || normalized.endsWith('/design.md');
}

function timestampFromIso(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

interface DropZoneProps {
  label: string;
  prompt: string;
  helper?: string;
  accept?: string;
  names: string[];
  directory?: boolean;
  onBrowseFolder?: () => void;
  onRemoveName?: (name: string) => void;
  onFiles: (names: string[], files: File[]) => void;
}
interface WebkitFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}
interface WebkitFileSystemFileEntry extends WebkitFileSystemEntry {
  isFile: true;
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
}
interface WebkitFileSystemDirectoryEntry extends WebkitFileSystemEntry {
  isDirectory: true;
  createReader: () => {
    readEntries: (
      success: (entries: WebkitFileSystemEntry[]) => void,
      error?: (error: DOMException) => void,
    ) => void;
  };
}

function SourceContextCard({ provenance }: { provenance?: DesignSystemProvenance }) {
  const rows = provenanceRows(provenance);
  if (rows.length === 0) return null;
  return (
    <div className="ds-source-context-card">
      <strong>Source context</strong>
      {rows.map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <small>{row.value}</small>
        </div>
      ))}
    </div>
  );
}

function GenerationStatusCard({ job }: { job: DesignSystemGenerationJob }) {
  const active = job.status === 'queued' || job.status === 'running';
  const noun = job.kind === 'revision' ? 'Revision' : 'Generation';
  return (
    <div className={`ds-generation-review-card is-${job.status}`}>
      <div>
        <Icon name={active ? 'sparkles' : job.status === 'failed' ? 'help-circle' : 'check'} />
        <span>
          <strong>
            {active
              ? job.kind === 'revision'
                ? 'Open Design is revising'
                : 'Open Design is still working'
              : job.status === 'failed'
                ? `${noun} needs attention`
                : `${noun} completed`}
          </strong>
          <small>
            {job.message
              ?? (active
                ? job.kind === 'revision'
                  ? 'Applying your feedback.'
                  : 'Preparing the remaining files.'
                : 'Review workspace is ready.')}
          </small>
        </span>
      </div>
      <div
        className="ds-generation-review-progress"
        role="progressbar"
        aria-label={`Generation progress ${job.progress}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress}
      >
        <span style={{ width: `${job.progress}%` }} />
      </div>
      <div className="ds-generation-review-steps">
        {job.steps.map((step) => (
          <span key={step.id} className={`is-${step.status}`}>
            {step.status === 'succeeded' ? <Icon name="check" /> : null}
            {step.title}
          </span>
        ))}
      </div>
    </div>
  );
}

function RevisionDiffCard({
  revision,
  saving,
  onAccept,
  onReject,
}: {
  revision: DesignSystemRevision;
  saving: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const diff = revisionAddedText(revision);
  return (
    <section className="ds-revision-card">
      <div className="ds-revision-card__head">
        <span>
          <strong>Pending revision</strong>
          <small>
            {revision.sectionTitle ? `${revision.sectionTitle} · ` : ''}
            {formatDateTime(revision.createdAt)}
          </small>
        </span>
        <div>
          <button type="button" className="ghost danger" disabled={saving} onClick={onReject}>
            <Icon name="close" />
            Reject
          </button>
          <button type="button" className="ghost success" disabled={saving} onClick={onAccept}>
            <Icon name="check" />
            Accept
          </button>
        </div>
      </div>
      <p>{revision.feedback}</p>
      <div className="ds-revision-diff">
        <span>Proposed changes</span>
        <pre>{diff || revision.proposedBody}</pre>
      </div>
    </section>
  );
}

function RevisionHistoryList({ revisions }: { revisions: DesignSystemRevision[] }) {
  return (
    <section className="ds-revision-history">
      <h2>Revision history</h2>
      {revisions.map((revision) => (
        <div key={revision.id}>
          <span className={`is-${revision.status}`}>{revision.status}</span>
          <strong>{revision.sectionTitle ?? 'General revision'}</strong>
          <small>{formatDateTime(revision.updatedAt)}</small>
        </div>
      ))}
    </section>
  );
}

function DropZone({
  label,
  prompt,
  helper,
  accept,
  names,
  directory,
  onBrowseFolder,
  onRemoveName,
  onFiles,
}: DropZoneProps) {
  function readFiles(files: FileList | File[] | null) {
    const nextFiles = Array.from(files ?? []);
    const nextNames = nextFiles.map((file) => localCodeRelativePath(file));
    if (nextNames.length > 0) onFiles(nextNames, nextFiles);
  }
  async function readDrop(dataTransfer: DataTransfer) {
    const nextFiles = await filesFromDataTransfer(dataTransfer);
    readFiles(nextFiles);
  }
  const directoryProps = directory ? ({ webkitdirectory: '', directory: '' } as Record<string, string>) : {};

  return (
    <div className="ds-resource-row">
      <strong>{label}</strong>
      <div className="ds-drop-zone-wrap">
        <label
          className="ds-drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void readDrop(event.dataTransfer);
          }}
        >
          <input
            className="ds-hidden-input"
            type="file"
            multiple
            accept={accept}
            onChange={(event) => readFiles(event.target.files)}
            {...directoryProps}
          />
          <span>{names.length > 0 && !onRemoveName ? names.join(', ') : prompt}</span>
        </label>
        {onBrowseFolder ? (
          <button type="button" className="ghost" onClick={onBrowseFolder}>
            Browse folder
          </button>
        ) : null}
      </div>
      {names.length > 0 && onRemoveName ? (
        <div className="ds-local-code-list" aria-label={`${label} selections`}>
          {names.map((name) => (
            <span key={name}>
              {name}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemoveName(name)}>
                x
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {helper ? <p>{helper}</p> : null}
    </div>
  );
}

async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => {
      const getter = (item as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry;
      return getter?.call(item) ?? null;
    })
    .filter(isWebkitFileSystemEntry);
  if (entries.length === 0) return Array.from(dataTransfer.files ?? []);
  const droppedFiles = await Promise.all(entries.map((entry) => filesFromEntry(entry, entry.name)));
  const flattened = droppedFiles.flat();
  return flattened.length > 0 ? flattened : Array.from(dataTransfer.files ?? []);
}

function isWebkitFileSystemEntry(entry: unknown): entry is WebkitFileSystemEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Partial<WebkitFileSystemEntry>;
  return (
    typeof candidate.name === 'string'
    && typeof candidate.isFile === 'boolean'
    && typeof candidate.isDirectory === 'boolean'
  );
}

async function filesFromEntry(entry: WebkitFileSystemEntry, relativePath: string): Promise<File[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as WebkitFileSystemFileEntry);
    return [withRelativePath(file, relativePath)];
  }
  if (!entry.isDirectory) return [];
  const children = await readAllDirectoryEntries(entry as WebkitFileSystemDirectoryEntry);
  const nested = await Promise.all(
    children.map((child) => filesFromEntry(child, `${relativePath}/${child.name}`)),
  );
  return nested.flat();
}

function fileFromEntry(entry: WebkitFileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readAllDirectoryEntries(entry: WebkitFileSystemDirectoryEntry): Promise<WebkitFileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: WebkitFileSystemEntry[] = [];
  return new Promise((resolve, reject) => {
    function readNextBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readNextBatch();
      }, reject);
    }
    readNextBatch();
  });
}

function withRelativePath(file: File, relativePath: string): File {
  const currentPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (currentPath) return file;
  Object.defineProperty(file, 'webkitRelativePath', {
    value: normalizeLocalCodePath(relativePath),
    configurable: true,
  });
  return file;
}

type AccessBadgeTone = 'muted' | 'success' | 'warning' | 'danger' | 'loading';

interface GitHubAccessMethod {
  id: string;
  icon: IconName;
  title: string;
  badge: string;
  tone: AccessBadgeTone;
  description: string;
  action?: ReactNode;
  note?: string | null;
}

function GitHubRepositoryAccessPanel({
  composioConfigured,
  connector,
  loading,
  action,
  authorizationPending,
  authorizationUrl,
  error,
  onOpenConnectorsTab,
  onConnect,
  onOpenAuthorization,
  onDisconnect,
}: {
  composioConfigured: boolean;
  connector: ConnectorDetail | null;
  loading: boolean;
  action: 'connect' | 'disconnect' | null;
  authorizationPending: boolean;
  authorizationUrl: string | null;
  error: string | null;
  onOpenConnectorsTab?: () => void;
  onConnect: () => void;
  onOpenAuthorization: () => void;
  onDisconnect: () => void;
}) {
  const [methodsExpanded, setMethodsExpanded] = useState(false);
  const connected = isGithubConnectorConnected(connector);
  const account = getDisplayableGithubAccountLabel(connector);
  const busy = action !== null;
  let composioBadge = 'Optional';
  let composioTone: AccessBadgeTone = 'muted';
  let composioDescription = 'Composio GitHub connector access for agent tools; repo URLs still work with local git or GitHub CLI.';
  let composioIcon: IconName = 'settings';

  if (!composioConfigured) {
    composioBadge = 'Not configured';
    composioDescription = 'Add a Composio API key only if this project needs connector-backed GitHub tools.';
  } else if (connected) {
    composioBadge = 'Connected';
    composioTone = 'success';
    composioIcon = 'github';
    composioDescription = account
      ? `Composio GitHub connector connected as ${account}; it is available as fallback when this device cannot read the repository.`
      : 'Composio GitHub connector is available as fallback when this device cannot read the repository.';
  } else if (authorizationPending) {
    composioBadge = 'Pending';
    composioTone = 'warning';
    composioIcon = 'external-link';
    composioDescription = 'Finish the Composio authorization window; local GitHub intake remains available.';
  } else if (loading) {
    composioBadge = 'Checking';
    composioTone = 'loading';
    composioIcon = 'spinner';
    composioDescription = 'Checking connector status in the background; URL intake is not blocked.';
  } else if (error) {
    composioBadge = 'Needs attention';
    composioTone = 'warning';
  } else if (connector?.status === 'error') {
    composioBadge = 'Needs attention';
    composioTone = 'danger';
    composioDescription = 'Reconnect the Composio GitHub connector, or continue with local git/GitHub CLI.';
  }

  const composioAction = !composioConfigured ? (
    <button type="button" className="ghost" onClick={onOpenConnectorsTab}>
      Configure Composio
    </button>
  ) : connected || authorizationPending ? (
    <>
      {authorizationPending && authorizationUrl ? (
        <button type="button" className="ghost" disabled={busy} onClick={onOpenAuthorization}>
          Open authorization
        </button>
      ) : null}
      <button type="button" className="ghost" disabled={busy} onClick={onDisconnect}>
        {action === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
      </button>
    </>
  ) : (
    <button type="button" className="ghost" disabled={busy} onClick={onConnect}>
      {action === 'connect' ? 'Connecting...' : 'Connect via Composio'}
    </button>
  );

  const methods: GitHubAccessMethod[] = [
    {
      id: 'local',
      icon: 'github',
      title: 'This device',
      badge: 'Automatic',
      tone: 'success',
      description: 'Uses public git clone, local git credentials, or GitHub CLI auth available on this machine.',
    },
    {
      id: 'native-oauth',
      icon: 'link',
      title: 'Open Design account',
      badge: 'Coming soon',
      tone: 'muted',
      description: 'Native GitHub sign-in managed by Open Design; this build does not use an OD-managed GitHub token yet.',
    },
    {
      id: 'composio',
      icon: composioIcon,
      title: 'Connector platform',
      badge: composioBadge,
      tone: composioTone,
      description: composioDescription,
      action: composioAction,
      note: error,
    },
  ];

  return (
    <div
      className={[
        'ds-github-access-panel',
        connected ? 'has-connected-connector' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="ds-github-access-header">
        <span>
          <strong>Repository access: Auto</strong>
          <p>Paste a GitHub URL. Open Design will use the first working access method.</p>
        </span>
        <button
          type="button"
          className="ghost ds-github-access-toggle"
          aria-expanded={methodsExpanded}
          aria-controls="ds-github-access-methods"
          onClick={() => setMethodsExpanded((current) => !current)}
        >
          <Icon name={methodsExpanded ? 'chevron-down' : 'chevron-right'} />
          {methodsExpanded ? 'Hide access methods' : 'Show access methods'}
        </button>
      </div>
      <div
        id="ds-github-access-methods"
        className={`accordion-collapsible ${methodsExpanded ? 'open' : ''}`}
        hidden={!methodsExpanded}
        aria-hidden={!methodsExpanded}
      >
        <div className="accordion-collapsible-inner">
          <div className="ds-github-access-methods" aria-label="GitHub repository access methods">
            {methods.map((method) => (
              <div key={method.id} className="ds-github-access-method">
                <Icon name={method.icon} />
                <span className="ds-github-access-method-copy">
                  <span className="ds-github-access-method-title">
                    <strong>{method.title}</strong>
                    <small className={`ds-github-access-badge is-${method.tone}`}>{method.badge}</small>
                  </span>
                  <p>{method.description}</p>
                  {method.note ? <em>{method.note}</em> : null}
                  {method.action ? <span className="ds-github-access-actions">{method.action}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDisplayableGithubAccountLabel(connector: ConnectorDetail | null): string | null {
  const label = connector?.accountLabel?.trim();
  if (!label) return null;
  // Composio may surface its connected-account id (`ca_...`) as the label.
  // That is useful internally, but it reads like a broken GitHub username in
  // this setup flow.
  if (/^ca_[A-Za-z0-9_-]+$/.test(label)) return null;
  return label;
}

function openConnectorAuthorizationUrl(url: string | null): void {
  if (!url) return;
  const opened = window.open(url, '_blank');
  if (!opened) window.location.assign(url);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function revisionAddedText(revision: DesignSystemRevision): string {
  const baseLines = revision.baseBody.split(/\r?\n/);
  const proposedLines = revision.proposedBody.split(/\r?\n/);
  let index = 0;
  while (
    index < baseLines.length
    && index < proposedLines.length
    && baseLines[index] === proposedLines[index]
  ) {
    index += 1;
  }
  return proposedLines.slice(index).join('\n').trim();
}

function inferDesignSystemTitle(state: SetupState): string {
  const clean = state.company.trim().replace(/\s+/g, ' ');
  const contextTitle = titleCandidateFromCompanyContext(clean);
  if (contextTitle) return designSystemTitle(contextTitle);

  const githubTitle = githubRepoTitleFromText(clean)
    ?? githubUrlsFromState(state).map(githubRepoTitleFromUrl).find((title): title is string => Boolean(title));
  if (githubTitle) return designSystemTitle(githubTitle);

  const urlTitle = genericUrlTitleFromText(clean);
  if (urlTitle) return designSystemTitle(urlTitle);

  return designSystemTitle(clean.split(/\s+/).slice(0, 4).join(' ') || 'Product');
}

function titleCandidateFromCompanyContext(clean: string): string | undefined {
  if (!clean || /^https?:\/\//iu.test(clean) || githubRepoTitleFromText(clean)) return undefined;
  const beforeColon = clean.split(':')[0]?.trim();
  if (beforeColon && !/^https?$/iu.test(beforeColon) && beforeColon.length <= 48) return beforeColon;
  return clean.split(/\s+/).slice(0, 4).join(' ') || undefined;
}

function designSystemTitle(title: string): string {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Product Design System';
  return /design system$/iu.test(clean) ? clean : `${clean} Design System`;
}

function githubRepoTitleFromText(text: string): string | undefined {
  const match = /(?:https?:\/\/)?github\.com[:/]([^/\s]+)\/([^/\s#?]+)(?:\.git)?(?=$|[/?#\s])/iu.exec(text);
  return match ? humanizeRepositoryName(match[2] ?? '') : undefined;
}

function githubRepoTitleFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return humanizeRepositoryName(parts[1] ?? '');
  } catch {
    const shorthand = /(?:^|\s)([^/\s]+)\/([^/\s#?]+)(?:\.git)?(?:\s|$)/iu.exec(url);
    if (shorthand) return humanizeRepositoryName(shorthand[2] ?? '');
  }
  return undefined;
}

function genericUrlTitleFromText(text: string): string | undefined {
  const match = /https?:\/\/[^\s]+/iu.exec(text);
  if (!match) return undefined;
  try {
    const parsed = new URL(match[0]);
    const host = parsed.hostname.replace(/^www\./iu, '').split('.')[0] ?? '';
    return humanizeRepositoryName(host);
  } catch {
    return undefined;
  }
}

function scheduleAfterProjectHandoff(task: () => void): void {
  if (typeof window === 'undefined') {
    task();
    return;
  }
  const run = () => window.setTimeout(task, 0);
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(run);
    return;
  }
  run();
}

async function prepareCreatedDesignSystemProject({
  project,
  state,
  composioConfigured,
  githubConnector,
  onProjectPrepared,
  onSystemsRefresh,
}: {
  project: Project;
  state: SetupState;
  composioConfigured: boolean;
  githubConnector: ConnectorDetail | null;
  onProjectPrepared?: (project: Project) => void;
  onSystemsRefresh?: () => Promise<void> | void;
}): Promise<void> {
  try {
    const stagedLocalCode = await stageLocalCodeFiles(project.id, state.codeFileObjects);
    const stagedFigma = await stageFigmaFiles(project.id, state.figFileObjects);
    const stagedAssets = await stageAssetFiles(project.id, state.assetFileObjects);
    await writeProjectTextFile(
      project.id,
      SOURCE_CONTEXT_MANIFEST_PATH,
      buildSourceContextManifest(state, {
        composioConfigured,
        githubConnector,
        stagedLocalCode,
        stagedFigma,
        stagedAssets,
      }),
    );
    const metadata = mergeLinkedCodeFolders(project.metadata, state.codeFolders);
    const prompt = buildCreationAgentPrompt(
      state,
      stagedLocalCode,
      SOURCE_CONTEXT_MANIFEST_PATH,
      stagedAssets,
      stagedFigma,
    );
    const preparedProject = await patchProject(project.id, { pendingPrompt: prompt, metadata });
    try {
      window.sessionStorage.setItem(`od:auto-send-first:${project.id}`, '1');
    } catch {
      // If sessionStorage is unavailable, the project still opens with the
      // pending prompt ready for the user to send manually.
    }
    onProjectPrepared?.(preparedProject ?? {
      ...project,
      pendingPrompt: prompt,
      metadata,
    });
    void onSystemsRefresh?.();
  } catch (err) {
    console.error('Could not prepare the design system project after opening it.', err);
  }
}

function humanizeRepositoryName(repo: string): string | undefined {
  const words = repo.replace(/\.git$/iu, '').replace(/[-_]+/gu, ' ').trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return undefined;
  return words.map(titleCaseRepositoryWord).join(' ');
}

function titleCaseRepositoryWord(word: string): string {
  if (/^(ai|api|cli|css|html|js|llm|mcp|sdk|ui|url|ux)$/iu.test(word)) return word.toUpperCase();
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function normalizeGithubUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

function githubRepoLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch {
    // User-entered shorthand can still be useful context for the agent.
  }
  return url;
}

function githubUrlsFromState(state: SetupState): string[] {
  return Array.from(new Set([
    ...state.githubUrls,
    ...(state.githubUrl.trim() ? [normalizeGithubUrl(state.githubUrl)] : []),
  ].filter(Boolean)));
}

function isComposioConfigured(composio: AppConfig['composio'] | undefined): boolean {
  return Boolean(composio?.apiKeyConfigured || composio?.apiKey?.trim());
}

function isGithubConnectorConnected(connector: ConnectorDetail | null): boolean {
  return connector?.status === 'connected';
}

async function fetchGithubConnectorStatusWithTimeout(): Promise<{ connector: ConnectorDetail | null; timedOut: boolean }> {
  let timeoutId: number | undefined;
  let timedOut = false;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller?.abort();
        resolve(null);
      }, GITHUB_CONNECTOR_STATUS_TIMEOUT_MS);
    });
    const statuses = await Promise.race([
      fetchConnectorStatuses(controller ? { signal: controller.signal } : undefined),
      timeout,
    ]);
    return { connector: githubConnectorFromStatus(statuses?.[GITHUB_CONNECTOR_ID]), timedOut };
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function githubConnectorFromStatus(
  status: ConnectorStatusResponse['statuses'][string] | undefined,
): ConnectorDetail | null {
  if (!status) return null;
  return {
    id: GITHUB_CONNECTOR_ID,
    name: 'GitHub',
    provider: 'composio',
    category: 'developer tools',
    status: status.status,
    tools: [],
    ...(status.accountLabel === undefined ? {} : { accountLabel: status.accountLabel }),
    ...(status.lastError === undefined ? {} : { lastError: status.lastError }),
  };
}

function isPendingConnectorAuth(auth: ConnectorConnectResponse['auth'] | undefined): boolean {
  return auth?.kind === 'redirect_required' || auth?.kind === 'pending';
}

function isTrustedConnectorCallbackOrigin(origin: string, currentOrigin?: string): boolean {
  const expectedOrigin = currentOrigin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  if (origin === expectedOrigin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]'
      || url.hostname === '::1';
  } catch {
    return false;
  }
}

interface StagedLocalCodeContext {
  uploadedPaths: string[];
  skippedCount: number;
}

interface StagedFigmaContext {
  summaryPaths: string[];
  skippedCount: number;
}

interface FigmaLocalSummary {
  name: string;
  size: number;
  lastModified: number;
  parseBytes: number;
  colors: string[];
  textStyles: string[];
  namedLayers: string[];
  componentHints: string[];
  readableSample: string;
}

interface StagedAssetContext {
  uploadedPaths: string[];
  skippedCount: number;
}

const LOCAL_CODE_SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

function localCodeRelativePath(file: File): string {
  const browserPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return normalizeLocalCodePath(browserPath || file.name);
}

function normalizeLocalCodePath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
}

function shouldStageLocalCodeFile(file: File): boolean {
  const relativePath = localCodeRelativePath(file);
  if (!relativePath) return false;
  if (file.size > MAX_LOCAL_CODE_FILE_BYTES) return false;
  const parts = relativePath.split('/');
  return !parts.some((part) => LOCAL_CODE_SKIP_DIRS.has(part));
}

function selectLocalCodeFiles(files: File[]): File[] {
  return dedupeLocalCodeFiles(files.filter(shouldStageLocalCodeFile)).slice(0, MAX_LOCAL_CODE_UPLOAD_FILES);
}

function dedupeLocalCodeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const next: File[] = [];
  for (const file of files) {
    const key = `${localCodeRelativePath(file)}:${file.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

function resourceRelativePath(file: File): string {
  const browserPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return normalizeLocalCodePath(browserPath || file.name);
}

function shouldStageAssetFile(file: File): boolean {
  const relativePath = resourceRelativePath(file);
  if (!relativePath) return false;
  if (file.size > MAX_ASSET_FILE_BYTES) return false;
  const parts = relativePath.split('/');
  return !parts.some((part) => LOCAL_CODE_SKIP_DIRS.has(part));
}

function selectAssetFiles(files: File[]): File[] {
  return dedupeResourceFiles(files.filter(shouldStageAssetFile)).slice(0, MAX_ASSET_UPLOAD_FILES);
}

function selectFigmaFiles(files: File[]): File[] {
  return dedupeResourceFiles(
    files.filter((file) => resourceRelativePath(file).toLowerCase().endsWith('.fig')),
  ).slice(0, MAX_FIGMA_CONTEXT_FILES);
}

function dedupeResourceFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const next: File[] = [];
  for (const file of files) {
    const key = `${resourceRelativePath(file)}:${file.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

function safeContextFileName(name: string, fallback: string): string {
  const leaf = name.split('/').filter(Boolean).pop() ?? fallback;
  const base = leaf.replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${slug || fallback}.md`;
}

function localCodeSourceLabels(state: SetupState): string[] {
  return [
    ...state.codeFolders,
    ...(state.codeFiles.length ? [`${state.codeFiles.length} local code files selected`] : []),
  ];
}

function localCodeReferences(state: SetupState): string[] {
  return Array.from(new Set([...state.codeFolders, ...state.codeFiles]));
}

function mergeLinkedCodeFolders(metadata: ProjectMetadata | undefined, codeFolders: string[]): ProjectMetadata | undefined {
  if (codeFolders.length === 0) return metadata;
  return {
    kind: metadata?.kind ?? 'other',
    ...metadata,
    linkedDirs: Array.from(new Set([...(metadata?.linkedDirs ?? []), ...codeFolders])),
  };
}

async function stageLocalCodeFiles(projectId: string, files: File[]): Promise<StagedLocalCodeContext> {
  if (files.length === 0) return { uploadedPaths: [], skippedCount: 0 };
  const selected = selectLocalCodeFiles(files);
  const uploadedPaths: string[] = [];
  for (const file of selected) {
    const desiredName = `${LOCAL_CODE_UPLOAD_ROOT}/${localCodeRelativePath(file)}`;
    const uploaded = await uploadProjectFile(projectId, file, desiredName);
    if (uploaded) {
      uploadedPaths.push(uploaded.name);
    }
  }
  return {
    uploadedPaths,
    skippedCount: Math.max(0, files.length - selected.length),
  };
}

async function stageFigmaFiles(projectId: string, files: File[]): Promise<StagedFigmaContext> {
  if (files.length === 0) return { summaryPaths: [], skippedCount: 0 };
  const selected = selectFigmaFiles(files);
  const summaryPaths: string[] = [];
  for (const file of selected) {
    const summary = await summarizeFigmaFile(file);
    const desiredName = `${FIGMA_CONTEXT_ROOT}/${safeContextFileName(resourceRelativePath(file), 'figma-file')}`;
    const written = await writeProjectTextFile(projectId, desiredName, renderFigmaSummary(summary));
    if (written) {
      summaryPaths.push(written.name);
    }
  }
  return {
    summaryPaths,
    skippedCount: Math.max(0, files.length - selected.length),
  };
}

async function summarizeFigmaFile(file: File): Promise<FigmaLocalSummary> {
  const parseBytes = Math.min(file.size, MAX_FIGMA_PARSE_BYTES);
  let readable = '';
  try {
    readable = await file.slice(0, parseBytes).text();
  } catch {
    readable = '';
  }
  const normalized = readable
    .replace(/[^\t\n\r\x20-\x7e]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const namedLayers = uniqueMatches(normalized, /"name"\s*:\s*"([^"]{2,80})"/g, 40);
  const textStyles = uniqueMatches(
    normalized,
    /"(?:fontFamily|fontPostScriptName|fontName|family|styleName)"\s*:\s*"([^"]{2,80})"/g,
    30,
  );
  const colors = Array.from(new Set(normalized.match(/#[0-9a-fA-F]{6,8}\b/g) ?? [])).slice(0, 40);
  const componentHints = namedLayers
    .filter((name) => /(button|card|modal|dialog|input|nav|tab|menu|toast|badge|avatar|table|list|toolbar|sidebar)/i.test(name))
    .slice(0, 30);
  return {
    name: resourceRelativePath(file),
    size: file.size,
    lastModified: file.lastModified,
    parseBytes,
    colors,
    textStyles,
    namedLayers,
    componentHints,
    readableSample: normalized.slice(0, 1600),
  };
}

function uniqueMatches(text: string, pattern: RegExp, limit: number): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function renderFigmaSummary(summary: FigmaLocalSummary): string {
  return [
    `# Figma Source Summary: ${summary.name}`,
    '',
    'The original .fig source was parsed locally in the browser. This markdown summary is the only Figma-derived context copied into the design-system project.',
    '',
    '## File',
    '',
    `- Name: ${summary.name}`,
    `- Size: ${formatBytes(summary.size)}`,
    `- Last modified: ${summary.lastModified ? new Date(summary.lastModified).toISOString() : 'unknown'}`,
    `- Local parse window: ${formatBytes(summary.parseBytes)}`,
    '',
    '## Extracted Signals',
    '',
    summary.colors.length ? `Colors:\n${summary.colors.map((color) => `- ${color}`).join('\n')}` : 'Colors: no readable color tokens found.',
    '',
    summary.textStyles.length ? `Text styles and font names:\n${summary.textStyles.map((style) => `- ${style}`).join('\n')}` : 'Text styles and font names: no readable text-style tokens found.',
    '',
    summary.componentHints.length ? `Component-like layer names:\n${summary.componentHints.map((name) => `- ${name}`).join('\n')}` : 'Component-like layer names: no obvious component names found.',
    '',
    summary.namedLayers.length ? `Readable layer names:\n${summary.namedLayers.map((name) => `- ${name}`).join('\n')}` : 'Readable layer names: no readable layer names found.',
    '',
    '## Readable Sample',
    '',
    summary.readableSample
      ? `\`\`\`text\n${summary.readableSample}\n\`\`\``
      : 'No readable text sample was available from the local parse window. Ask for screenshots, exports, or a Figma link if visual evidence is required.',
    '',
  ].join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

async function stageAssetFiles(projectId: string, files: File[]): Promise<StagedAssetContext> {
  if (files.length === 0) return { uploadedPaths: [], skippedCount: 0 };
  const selected = selectAssetFiles(files);
  const uploadedPaths: string[] = [];
  for (const file of selected) {
    const desiredName = `${ASSET_UPLOAD_ROOT}/${resourceRelativePath(file)}`;
    const uploaded = await uploadProjectFile(projectId, file, desiredName);
    if (uploaded) {
      uploadedPaths.push(uploaded.name);
    }
  }
  return {
    uploadedPaths,
    skippedCount: Math.max(0, files.length - selected.length),
  };
}

function buildSourceNotes(state: SetupState): string {
  const githubUrls = githubUrlsFromState(state);
  const localCode = localCodeReferences(state);
  return [
    githubUrls.length ? `GitHub/code: ${githubUrls.join(', ')}` : '',
    localCode.length ? `Local code: ${localCode.join(', ')}` : '',
    state.figFiles.length ? `Figma files: ${state.figFiles.join(', ')}` : '',
    state.assetFiles.length ? `Fonts, logos and assets: ${state.assetFiles.join(', ')}` : '',
    state.notes.trim() ? `Additional notes: ${state.notes.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function buildCreationAgentPrompt(
  state: SetupState,
  stagedLocalCode?: StagedLocalCodeContext,
  sourceContextManifestPath?: string,
  stagedAssets?: StagedAssetContext,
  stagedFigma?: StagedFigmaContext,
): string {
  const sourceNotes = buildSourceNotes(state);
  const githubUrls = githubUrlsFromState(state);
  const localCode = localCodeReferences(state);
  const githubRunbook = buildGithubConnectorRunbook(githubUrls);
  const localFolderRunbook = buildLocalFolderRunbook(state.codeFolders);
  const title = inferDesignSystemTitle(state);
  return [
    'Create this project as a complete Open Design design system workspace.',
    '',
    'Autonomy requirement:',
    '- Do not ask setup or clarification questions during design-system generation.',
    '- Do not emit `<question-form>`, "Quick brief — 30 seconds", `AskUserQuestion`, direction cards, choice cards, or any UI that waits for user input.',
    '- The setup page already collected the brief. If target surfaces, review priority, or workspace depth are missing, choose sensible defaults and begin generating the design-system artifacts immediately.',
    '',
    'Project boundary:',
    '- All GitHub extraction, local evidence intake, source reading, design-system construction, package audit, and final artifact writes must happen inside this project workspace and this project chat run.',
    '- Treat `/design-systems/create` as setup only. Do not depend on that page for progress, review, or generated output; the project is the source of truth.',
    '',
    'Use the files in this project as the design system source for future projects. Update `DESIGN.md` as the canonical rules document, and update supporting files when they make the system easier to review or reuse.',
    '',
    'Expected output:',
    '- A clear `DESIGN.md` with product context, visual foundations, color, type, spacing, layout, components, motion, voice, and anti-patterns.',
    '- A Claude Design-quality package: `README.md`, `SKILL.md`, `colors_and_type.css`, provenance notes, `assets/`, `build/` when runtime icons exist, optional `fonts/`, category-specific `preview/` cards, and a reusable `ui_kits/app/` example.',
    '- Write `README.md` as a reusable package guide, not only a generated file list. Include a source-backed Product Overview/Product Context section that explains what the product is, the primary UI surfaces, and the core capabilities evidenced by README/package/source files; include source repository or source folder references, package contents, preview manifest, and reuse workflow.',
    '- README.md must include a concrete `## Preview Manifest` section that lists each generated `preview/*.html` card by exact path, what reviewers should inspect there, and which source-backed components, tokens, assets, or fonts it demonstrates. Keep this manifest synchronized with the actual `preview/` files.',
    '- Preserve real source assets when evidence provides them: logos, app icons, tray icons, avatars, wordmarks, and font files belong in `assets/`, `build/`, or `fonts/`, not in prose-only notes. When source files include build/runtime icon assets such as installer icons, tray icons, app icons, or wordmarks under build/resources paths, preserve representative files under `build/` as Claude Design does. When multiple source logos/icons/fonts are captured, preserve a representative set instead of collapsing everything into one generic logo or font. If font files are preserved, bind them in `colors_and_type.css` with `@font-face`, `@import`, or `url(...)` references so previews and UI kits actually render the brand typeface.',
    BUILD_ASSET_PRESERVATION_CONTRACT,
    '- Preserve high-signal source component examples when evidence provides substantial app/component code. Copy at least a few real, substantive source-backed examples outside `context/` (for example `source_examples/SelectModelButton.tsx`, `source_examples/ChatNavBar/index.tsx`, or root/nested TSX files) so future agents can inspect the original implementation patterns without digging through intake snapshots. Do not replace captured source examples with tiny filename-only stubs.',
    '- Split review previews into focused cards instead of one generic page. Prefer cards such as `preview/colors-primary.html`, `preview/colors-theme-light.html`, `preview/colors-theme-dark.html`, `preview/typography-specimens.html`, `preview/spacing-tokens.html`, `preview/spacing-radius.html`, `preview/spacing-shadows.html`, `preview/components-buttons.html`, `preview/components-inputs.html`, and `preview/brand-assets.html` when evidence supports them. `preview/brand-assets.html` must visibly load the preserved files from `assets/` or `build/` with real `img`, `picture`, `object`, or CSS `url(...)` references; do not redraw brand marks as inline placeholders when source assets were captured.',
    '- Write `SKILL.md` as an agent-usable Claude Design-style skill entry, not only a loose Markdown note. Include YAML frontmatter with `name`, `description`, and `user-invocable`, then include reusable sections for `What is inside`, `Source context`, `When to use this skill`, `How to use`, and `Design system highlights`. Those sections should tell future agents to read README.md, DESIGN.md, colors_and_type.css, preview/, assets/, build/, fonts/, source_examples/, and ui_kits/app/ before generating artifacts.',
    '- Build `ui_kits/app/` as an applied interface kit with `index.html`, a reusable README, and modular component files when the evidence includes representative product surfaces. `ui_kits/app/README.md` should document the kit structure, component files, usage workflow, design notes, and source basis, not only say the kit exists. `ui_kits/app/index.html` must load `../../colors_and_type.css`, must load/import/compose the modular component files under `ui_kits/app/components/`, and must mount/render the composed interface into the page; if it directly loads `.jsx`/`.tsx` files, include React, ReactDOM, and Babel standalone scripts and expose each loaded component as `window.ComponentName` / `globalThis.ComponentName`, or write compiled browser-ready JavaScript instead. Do not leave the entry page as a standalone generic static mock or disconnected script list when component files exist. For chat/workspace evidence, include substantive role-based components under `ui_kits/app/components/`: `App.jsx`, `Sidebar.jsx`, a list/rail component such as `AssistantsList.jsx`, a main workspace component such as `ChatArea.jsx`, an input/composer such as `InputBar.jsx`, and a message/comment component such as `MessageBubble.jsx`; the app shell component must compose the role components into one product-like surface; do not write one-line placeholder components.',
    UI_KIT_ENTRY_CONTRACT,
    '- Preview cards and UI-kit visuals should name or model high-signal source components from the evidence, such as the captured sidebar, chat, composer, message, artifact, modal, avatar, or selector files. Avoid anonymous generic examples when concrete source component names are available.',
    '- If older scaffold names exist (`preview/colors-node-types.html`, `preview/colors-ui-palette.html`, `preview/typography-scale.html`, `preview/spacing-system.html`, `preview/logo-variants.html`, or `ui_kits/generated_interface/`), replace them with the focused Claude-style structure above instead of extending the old generic files.',
    '- Keep `README.md`, `SKILL.md`, `DESIGN.md`, and `ui_kits/app/README.md` in sync with the final file structure; do not leave manifest text pointing to older preview names or `ui_kits/generated_interface/`.',
    '- Reviewable previews must appear in the right-side `Design System` tab and show real modules with preview cards, not a standalone marketing page or a single placeholder panel.',
    '',
    'Core execution order:',
    '1. Read `context/source-context.md` first, then run every intake command it lists for linked GitHub repositories and linked local code folders before editing design-system files.',
    '2. Do not write `DESIGN.md`, token files, previews, UI-kit examples, or asset notes from URL text alone. When GitHub, local code, Figma, or assets were provided, preserve concrete evidence under `context/` and use it as the basis for the design-system files.',
    '3. Before writing the design-system files, inventory the local evidence for product identity, real color/theme tokens, font families, brand assets, app shell layout, navigation, chat/input surfaces, and reusable components. Use this inventory to avoid generic tokens.',
    '4. Copy high-signal source component examples from the snapshots when they explain the design system better than prose alone. Keep these examples outside `context/` as reusable package artifacts, not only as hidden evidence.',
    '5. After evidence is collected, update the project files directly and keep the `Design System` tab reviewable.',
    '',
    'Completion gate:',
    '- For each linked GitHub repository, there must be a `context/github/*.md` evidence note plus command-written snapshots under `context/github/*/files/` before writing final design-system rules or previews. The snapshots should include theme/token/source files and any available binary assets or fonts selected by the intake command.',
    '- For each linked local code folder, run the listed `local-design-context` command and use its `context/local-code/*.md` evidence note plus command-written snapshots under `context/local-code/*/files/` before writing final design-system rules or previews. Browser-copied snapshots already under `context/local-code/` are also valid local evidence.',
    '- Do not call GitHub connector tree/content/raw tools directly from the agent. Use only the bounded `github-design-context` command listed in `context/source-context.md`; it tries this-device git first, authenticated GitHub CLI second, then connector-platform fallback when local access cannot read the repository.',
    '- If the bounded command records `Read method: git-clone`, treat those this-device snapshots as the primary evidence. If it records `Read method: connector`, treat the connector-platform snapshots as valid fallback evidence and continue.',
    '- For private repositories, local git credentials or GitHub CLI authentication (`gh auth login --web`) are preferred intake paths because the command still writes local evidence snapshots.',
    '- If the bounded command cannot write snapshots at all, stop with the permission, GitHub CLI login, connection, rate-limit, or clone issue. Do not substitute ad-hoc public GitHub browsing, memory, or URL-only inference.',
    '- Finish only after the project contains reviewable design-system artifacts: `DESIGN.md`, `README.md`, `SKILL.md`, reusable token/style files, focused preview HTML cards, UI-kit examples, preserved assets/fonts when supported, and provenance/context notes.',
    '- Before your final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`. Fix every audit error and design-quality warning, including generic visual artifacts, thin source-backed modules, stale manifest paths, and missing representative assets/fonts. If an issue cannot be fixed because source evidence is missing, explain that blocker instead of claiming the design system is ready.',
    '',
    `Design system workspace title:\n${title}`,
    '',
    'Use this title for README.md, SKILL.md, DESIGN.md, preview labels, and ui_kits/app copy unless the inspected source evidence proves a better product name. Do not derive the title from URL protocol text such as `https`.',
    '',
    `Company / design system context:\n${state.company.trim()}`,
    sourceContextManifestPath
      ? `\nSource context manifest:\n- Read \`${sourceContextManifestPath}\` before drafting. It records GitHub access readiness, local folder links, copied code snapshots, uploaded resources, and the review contract for this design system project.`
      : '',
    sourceNotes ? `\nProvided resources:\n${sourceNotes}` : '',
    githubUrls.length
      ? githubRunbook
      : '',
    state.codeFolders.length
      ? `Read the linked local code folders that Open Design attached to this project: ${state.codeFolders.join(', ')}. Treat them as source context only unless the user asks you to edit them.\n\n${localFolderRunbook}`
      : '',
    stagedLocalCode?.uploadedPaths.length
      ? `Inspect the copied local code snapshot files in this project under \`${LOCAL_CODE_UPLOAD_ROOT}/\`: ${stagedLocalCode.uploadedPaths.slice(0, 20).join(', ')}${stagedLocalCode.uploadedPaths.length > 20 ? `, and ${stagedLocalCode.uploadedPaths.length - 20} more` : ''}.`
      : '',
    stagedLocalCode?.skippedCount
      ? `${stagedLocalCode.skippedCount} local code files were skipped because they were too large, duplicate, generated, or outside the focused upload limit.`
      : '',
    stagedFigma?.summaryPaths.length
      ? `Use the locally parsed Figma summaries in \`${FIGMA_CONTEXT_ROOT}/\`: ${stagedFigma.summaryPaths.join(', ')}. Treat these as evidence extracted from .fig files; the original .fig files were not uploaded.`
      : '',
    stagedFigma?.skippedCount
      ? `${stagedFigma.skippedCount} .fig files were skipped because they were duplicate or outside the focused parse limit.`
      : '',
    stagedAssets?.uploadedPaths.length
      ? `Use uploaded brand assets in \`${ASSET_UPLOAD_ROOT}/\`: ${stagedAssets.uploadedPaths.slice(0, 20).join(', ')}${stagedAssets.uploadedPaths.length > 20 ? `, and ${stagedAssets.uploadedPaths.length - 20} more` : ''}.`
      : '',
    stagedAssets?.skippedCount
      ? `${stagedAssets.skippedCount} asset files were skipped because they were too large, duplicate, generated, or outside the focused upload limit.`
      : '',
    localCode.length
      ? 'Use local code context to infer actual tokens, typography, spacing, components, assets, naming, and product surface patterns.'
      : '',
    '',
    'Keep this scoped to the design-system project. When finished, summarize which files should be reviewed first.',
  ].filter(Boolean).join('\n');
}

function buildSourceContextManifest(
  state: SetupState,
  options: {
    composioConfigured: boolean;
    githubConnector: ConnectorDetail | null;
    stagedLocalCode?: StagedLocalCodeContext;
    stagedFigma?: StagedFigmaContext;
    stagedAssets?: StagedAssetContext;
  },
): string {
  const githubUrls = githubUrlsFromState(state);
  const linkedFolders = state.codeFolders;
  const copiedSnapshots = options.stagedLocalCode?.uploadedPaths ?? [];
  const skippedCount = options.stagedLocalCode?.skippedCount ?? 0;
  const figmaSummaries = options.stagedFigma?.summaryPaths ?? [];
  const skippedFigma = options.stagedFigma?.skippedCount ?? 0;
  const uploadedAssets = options.stagedAssets?.uploadedPaths ?? [];
  const skippedAssets = options.stagedAssets?.skippedCount ?? 0;
  const title = inferDesignSystemTitle(state);
  const sections = [
    '# Design System Source Context',
    '',
    'This file is generated during setup and should be treated as source evidence for the design-system project. Use it before writing or revising DESIGN.md, previews, tokens, UI kit examples, or assets.',
    '',
    '## Company / Product',
    '',
    `Canonical design-system title: ${title}`,
    '',
    state.company.trim() || 'No company or product context provided yet.',
  ];

  sections.push('', '## GitHub Repositories', '');
  if (githubUrls.length > 0) {
    sections.push(...githubUrls.map((url) => `- ${url}`));
  } else {
    sections.push('- None linked.');
  }
  sections.push('', `Connector status: ${githubConnectorStatusForManifest(options)}`);
  if (githubUrls.length > 0) {
    sections.push('', '### GitHub Connector Intake Runbook', '', buildGithubConnectorRunbook(githubUrls));
  }

  sections.push('', '## Local Code', '');
  if (linkedFolders.length > 0) {
    sections.push('Linked folders readable by the local agent:');
    sections.push(...linkedFolders.map((folder) => `- ${folder}`));
    sections.push('', '### Local Folder Intake Runbook', '', buildLocalFolderRunbook(linkedFolders));
  } else {
    sections.push('Linked folders readable by the local agent: none.');
  }
  if (copiedSnapshots.length > 0) {
    sections.push('', `Copied browser-selected code snapshot files under \`${LOCAL_CODE_UPLOAD_ROOT}/\`:`);
    sections.push(...copiedSnapshots.slice(0, 40).map((filePath) => `- ${filePath}`));
    if (copiedSnapshots.length > 40) {
      sections.push(`- ...and ${copiedSnapshots.length - 40} more files.`);
    }
  } else {
    sections.push('', `Copied browser-selected code snapshot files under \`${LOCAL_CODE_UPLOAD_ROOT}/\`: none.`);
  }
  if (skippedCount > 0) {
    sections.push(`${skippedCount} local code files were skipped because they were too large, duplicate, generated, or outside the focused upload limit.`);
  }

  sections.push('', '## Design And Brand Resources', '');
  sections.push(state.figFiles.length ? `Figma files selected:\n${state.figFiles.map((name) => `- ${name}`).join('\n')}` : 'Figma files selected: none.');
  if (figmaSummaries.length > 0) {
    sections.push('', `Locally parsed Figma summaries under \`${FIGMA_CONTEXT_ROOT}/\`:`);
    sections.push(...figmaSummaries.map((filePath) => `- ${filePath}`));
  } else {
    sections.push('', `Locally parsed Figma summaries under \`${FIGMA_CONTEXT_ROOT}/\`: none.`);
  }
  if (skippedFigma > 0) {
    sections.push(`${skippedFigma} .fig files were skipped because they were duplicate or outside the focused parse limit.`);
  }
  sections.push(state.assetFiles.length ? `Fonts, logos, and assets selected:\n${state.assetFiles.map((name) => `- ${name}`).join('\n')}` : 'Fonts, logos, and assets selected: none.');
  if (uploadedAssets.length > 0) {
    sections.push('', `Uploaded brand asset files under \`${ASSET_UPLOAD_ROOT}/\`:`);
    sections.push(...uploadedAssets.slice(0, 40).map((filePath) => `- ${filePath}`));
    if (uploadedAssets.length > 40) {
      sections.push(`- ...and ${uploadedAssets.length - 40} more files.`);
    }
  } else {
    sections.push('', `Uploaded brand asset files under \`${ASSET_UPLOAD_ROOT}/\`: none.`);
  }
  if (skippedAssets > 0) {
    sections.push(`${skippedAssets} asset files were skipped because they were too large, duplicate, generated, or outside the focused upload limit.`);
  }

  sections.push('', '## Notes', '', state.notes.trim() || 'No additional notes provided.');

  sections.push(
    '',
    '## Review Contract',
    '',
    '- `/design-systems/create` only collected setup inputs. All GitHub extraction, local evidence intake, source reading, design-system construction, package audit, and artifact writes should happen inside this project workspace.',
    '- DESIGN.md is the canonical source of truth.',
    '- Use the canonical design-system title above for headings, README/SKILL names, preview labels, and UI-kit copy unless inspected evidence proves a more accurate product name. Never title the system from URL protocol text such as `https`.',
    '- colors_and_type.css should hold concrete reusable tokens when the source evidence supports them; if fonts/ contains preserved font files, colors_and_type.css must bind those files with @font-face, @import, or url(...) references so typography does not fall back to substitute fonts.',
    '- README.md and SKILL.md should make the extracted system reusable as a real Open Design design-system package.',
    '- README.md should include a source-backed Product Overview/Product Context section, source repository or source folder references, package contents, a concrete `## Preview Manifest` listing every generated `preview/*.html` card, and reuse workflow, similar to Claude Design exports.',
    '- SKILL.md should include YAML frontmatter with `name`, `description`, and `user-invocable`, plus Claude-style reusable skill sections: What is inside, Source context, When to use this skill, How to use, and Design system highlights. The usage guidance should point agents at README.md, DESIGN.md, colors_and_type.css, preview/, assets/, build/, fonts/, source_examples/, and ui_kits/app/.',
    '- README.md, SKILL.md, DESIGN.md, and ui_kits/app/README.md must describe the final focused preview cards and `ui_kits/app/` paths, not old scaffold names such as `preview/typography-scale.html` or `ui_kits/generated_interface/`.',
    '- preview/ should contain small reviewable HTML cards for typography, color themes, spacing, radius, shadows, brand assets, and component evidence.',
    '- source_examples/ or equivalent root/nested source files should preserve selected high-signal original components when snapshots include substantial app/component source, similar to Claude Design exports that keep files like SelectModelButton.tsx or ChatNavBar/index.tsx alongside the package. These examples should contain substantive original implementation code, not tiny stubs that only share the component name.',
    '- ui_kits/app/ should contain an applied interface example, plus substantive role-based files under `ui_kits/app/components/` when the source snapshots include representative app shells, navigation, chat/input surfaces, or reusable components. `ui_kits/app/README.md` should explain structure, component files, usage, design notes, and source basis. `ui_kits/app/index.html` must load `../../colors_and_type.css`, must load/import/compose the modular component files, and must mount/render the composed interface instead of staying as a standalone generic static mock or disconnected script list. If the entry directly loads `.jsx`/`.tsx` files, include React, ReactDOM, and Babel standalone scripts and expose each loaded component as `window.ComponentName` / `globalThis.ComponentName`, or write compiled browser-ready JavaScript instead. For chat/workspace evidence, cover app shell, sidebar/navigation, assistant/list rail, chat area, input bar/composer, and message bubble/comment roles; the app shell component must compose those roles into one product-like surface. Placeholder component shells are not sufficient.',
    UI_KIT_ENTRY_CONTRACT,
    '- Preview cards and UI-kit visuals should explicitly label or model source-backed modules from the captured evidence instead of generic placeholder modules.',
    '- assets/, build/, fonts/, and context/ should preserve logos, app icons, tray icons, installer/runtime icons, wordmarks, font files, provenance, and source notes for future projects.',
    BUILD_ASSET_PRESERVATION_CONTRACT,
    '- preview/brand-assets.html should visibly reference preserved files from assets/ or build/ instead of recreating logos/icons as inline placeholder drawings.',
    '- GitHub evidence must come from the bounded `github-design-context` command, not direct connector tree/content/raw tool calls. The command tries this-device git first, authenticated GitHub CLI second, and connector-platform fallback only when local access cannot read the repository.',
    '- Linked local folder evidence should come from the bounded `local-design-context` command, which writes a local evidence note and snapshots under `context/local-code/` before final design-system rules are drafted.',
    '- Before marking the design system ready, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` and fix every reported error or warning.',
    '- Draft design systems cannot be used by other projects until published.',
  );

  return `${sections.join('\n')}\n`;
}

function buildLocalFolderRunbook(folders: string[]): string {
  if (folders.length === 0) return '';
  const intakeCommands = folders
    .map((folder, index) => `   - \`"$OD_NODE_BIN" "$OD_BIN" tools connectors local-design-context --path ${shellQuote(folder)} --output context/local-code/${localEvidenceFileName(folder, index)}\``)
    .join('\n');
  return [
    'Local folder intake is required before drafting from linked local code folders:',
    '1. For each linked folder, run the bounded local intake command before writing design-system files:',
    intakeCommands,
    '2. The command selects design-system-relevant source files plus available logos/icons/fonts, writes a reviewable evidence note, and copies snapshots under `context/local-code/`.',
    '3. Inspect the generated evidence note plus snapshots for README, package manifests, Tailwind/theme/token files, global CSS, font declarations, component source, layout shells, icons/logos/assets, and representative app entry files.',
    '4. If the command cannot read a linked folder or write snapshots, stop and explain the local file access problem instead of inventing tokens from the folder name.',
  ].join('\n');
}

function buildGithubConnectorRunbook(githubUrls: string[]): string {
  if (githubUrls.length === 0) return '';
  const intakeCommands = githubUrls
    .map((url) => `   - \`"$OD_NODE_BIN" "$OD_BIN" tools connectors github-design-context --repo ${shellQuote(url)} --output context/github/${githubEvidenceFileName(url)}\``)
    .join('\n');
  return [
    'GitHub repository intake is required before drafting the design system:',
    '1. For each linked repository, run the bounded intake command before writing design-system files. The command tries this-device access first (`git clone`, then authenticated GitHub CLI via `gh auth login --web`) and uses the Composio GitHub connector only as a connector-platform fallback.',
    intakeCommands,
    '2. Do not call GitHub connector tree/content/raw tools directly from the agent. Large repositories can trigger `CONNECTOR_OUTPUT_TOO_LARGE`; the bounded intake command is the only allowed GitHub repository intake path for this workflow.',
    '3. The intake command selects design-system-relevant source files plus available logos/icons/fonts and writes a reviewable evidence note plus file snapshots under `context/github/`; keep those files as the source evidence for this design-system project.',
    '4. If you already hit `CONNECTOR_OUTPUT_TOO_LARGE` or `CONNECTOR_RATE_LIMITED` from a direct connector call, do not stop and do not retry the same direct tool. Run the bounded intake command above, then inspect the written snapshots.',
    '5. Treat `Read method: git-clone` as the preferred this-device path. Treat `Read method: connector` as valid connector-platform fallback evidence when local git/GitHub CLI could not read the repository.',
    '6. The command is strict: if the bounded intake command cannot write snapshot files, stop and explain the permission, GitHub CLI login, connection, rate-limit, or clone problem. Do not use ad-hoc public GitHub browsing, memory, or URL-only inference for design-system files.',
    '7. Inspect the generated evidence note plus snapshots for README, package manifests, Tailwind/theme/token files, global CSS, font declarations, component source for buttons/forms/navigation/cards/tables, layout shells, icons/logos/assets, and representative app entry files.',
    '8. Use that evidence to create or update `DESIGN.md`, `colors_and_type.css`, `README.md`, `SKILL.md`, `preview/`, `ui_kits/app/`, `assets/`, and `fonts/` so the Design System tab can review the output as a reusable package.',
  ].join('\n');
}

function localEvidenceFileName(folder: string, index: number): string {
  const parts = folder.split(/[\\/]+/u).filter(Boolean);
  const basename = sanitizeEvidenceSegment(parts.at(-1) ?? 'local-source');
  return `${basename}${index > 0 ? `-${index + 1}` : ''}.md`;
}

function githubEvidenceFileName(url: string): string {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#].*)?$/iu.exec(url)
    ?? /^([^/\s]+)\/([^/\s#?]+?)(?:\.git)?$/u.exec(url);
  const owner = sanitizeEvidenceSegment(match?.[1] ?? 'github');
  const repo = sanitizeEvidenceSegment(match?.[2] ?? 'repository');
  return `${owner}-${repo}.md`;
}

function sanitizeEvidenceSegment(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'repo';
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function githubConnectorStatusForManifest(options: {
  composioConfigured: boolean;
  githubConnector: ConnectorDetail | null;
}): string {
  if (!options.composioConfigured) {
    return 'GitHub connector is not configured; repository intake will use local git credentials or authenticated GitHub CLI when possible.';
  }
  if (isGithubConnectorConnected(options.githubConnector)) {
    const account = getDisplayableGithubAccountLabel(options.githubConnector);
    return account
      ? `connected as ${account}.`
      : 'connected.';
  }
  return 'Composio key is configured, but GitHub is not connected; repository intake can still use local git credentials or authenticated GitHub CLI when possible.';
}

function buildProvenance(state: SetupState): DesignSystemProvenance {
  const githubUrls = githubUrlsFromState(state);
  const localCode = localCodeReferences(state);
  return {
    companyBlurb: state.company.trim(),
    ...(githubUrls.length ? { githubUrls } : {}),
    ...(localCode.length ? { localCodeFiles: localCode } : {}),
    ...(state.figFiles.length ? { figFiles: state.figFiles } : {}),
    ...(state.assetFiles.length ? { assetFiles: state.assetFiles } : {}),
    ...(state.notes.trim() ? { notes: state.notes.trim() } : {}),
    sourceNotes: buildSourceNotes(state),
  };
}

function provenanceRows(provenance: DesignSystemProvenance | undefined): Array<{ label: string; value: string }> {
  if (!provenance) return [];
  return [
    provenance.companyBlurb ? { label: 'Company', value: truncateContext(provenance.companyBlurb) } : null,
    provenance.githubUrls?.length ? { label: 'GitHub', value: provenance.githubUrls.join(', ') } : null,
    provenance.localCodeFiles?.length ? { label: 'Code', value: provenance.localCodeFiles.join(', ') } : null,
    provenance.figFiles?.length ? { label: 'Figma', value: provenance.figFiles.join(', ') } : null,
    provenance.assetFiles?.length ? { label: 'Assets', value: provenance.assetFiles.join(', ') } : null,
    provenance.notes ? { label: 'Notes', value: truncateContext(provenance.notes) } : null,
    provenance.sourceNotes ? { label: 'Fetched context', value: truncateContext(provenance.sourceNotes) } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
}

function truncateContext(value: string): string {
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function parseDesignSystemSections(body: string): Array<{ title: string; subtitle: string; body: string }> {
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (matches.length === 0) {
    return [{ title: 'Design System', subtitle: 'Draft body', body: body.trim() || 'No content yet.' }];
  }
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    const title = match[1]?.replace(/^\d+\.\s*/, '').trim() || 'Section';
    const content = body.slice(start, end).trim();
    return {
      title,
      subtitle: sectionSubtitle(title),
      body: content || 'No details yet.',
    };
  });
}

function sectionSubtitle(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes('type')) return 'Text hierarchy and styles';
  if (normalized.includes('color')) return 'Palette and semantic roles';
  if (normalized.includes('spacing')) return 'Spacing scale and radius tokens';
  if (normalized.includes('component')) return 'Reusable interface patterns';
  if (normalized.includes('brand')) return 'Logo, voice and usage rules';
  return 'Design guidance';
}
