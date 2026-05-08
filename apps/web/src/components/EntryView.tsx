import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectorDetail, ConnectorStatusResponse } from '@open-design/contracts';
import { useT } from '../i18n';
import type {
  AgentInfo,
  AppConfig,
  DesignSystemSummary,
  Project,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { DesignsTab } from './DesignsTab';
import { DesignSystemsManager } from './DesignSystemsManager';
import { AppChromeHeader } from './AppChromeHeader';
import { Icon } from './Icon';
import { LanguageMenu } from './LanguageMenu';
import { CenteredLoader } from './Loading';
import { NewProjectPanel, type CreateInput } from './NewProjectPanel';
import {
  fetchConnectors,
  fetchConnectorStatuses,
} from '../providers/registry';
import { apiProtocolLabel } from '../utils/apiProtocol';

type TopTab = 'designs' | 'design-systems';

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  // Per-resource loading flags. Each tab gates its own content on whichever
  // flag matches the data it renders, so a slow `/api/agents` probe does
  // not block tabs that don't need agents. Templates are not gated here —
  // the sidebar 'From template' tab renders an empty state until they
  // arrive (fast fetch), which keeps the prop surface narrower.
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  promptTemplatesLoading?: boolean;
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
  onImportClaudeDesign: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onRefreshDesignSystems: () => void;
  onOpenSettings: (section?: 'execution' | 'media' | 'composio' | 'language' | 'appearance' | 'notifications' | 'pet' | 'about') => void;
}

const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 380;
const SIDEBAR_STORAGE_KEY = 'od-entry-sidebar-width';
const CONNECTOR_CALLBACK_MESSAGE_TYPE = 'open-design:connector-connected';

export function isTrustedConnectorCallbackOrigin(origin: string, currentOrigin?: string): boolean {
  const expectedOrigin = currentOrigin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  if (origin === expectedOrigin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  } catch {
    return false;
  }
}

function loadSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return SIDEBAR_DEFAULT;
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function applyConnectorStatuses(
  current: ConnectorDetail[],
  statuses: ConnectorStatusResponse['statuses'],
): ConnectorDetail[] {
  if (!Object.keys(statuses).length) return current;
  return current.map((connector) => {
    const next = statuses[connector.id];
    if (!next) return connector;
    const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
    return {
      ...base,
      status: next.status,
      ...(next.accountLabel === undefined ? {} : { accountLabel: next.accountLabel }),
      ...(next.lastError === undefined ? {} : { lastError: next.lastError }),
    };
  });
}

export function sortConnectorsForDisplay(connectors: ConnectorDetail[]): ConnectorDetail[] {
  return [...connectors].sort((a, b) => {
    const aConnected = a.status === 'connected';
    const bConnected = b.status === 'connected';
    if (aConnected !== bConnected) return aConnected ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
}

function normalizedSearchValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function scoreConnectorText(value: string | undefined, query: string, baseScore: number): number | null {
  const normalized = normalizedSearchValue(value);
  if (!normalized) return null;
  if (normalized === query) return baseScore;
  if (normalized.startsWith(query)) return baseScore + 1;
  if (normalized.includes(query)) return baseScore + 2;
  return null;
}

export function getConnectorSearchScore(connector: ConnectorDetail, query: string): number | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const scores: number[] = [];
  const collect = (value: string | undefined, baseScore: number) => {
    const score = scoreConnectorText(value, normalizedQuery, baseScore);
    if (score !== null) scores.push(score);
  };

  // Connector identity fields carry the most intent: exact and prefix
  // name/provider matches should beat incidental mentions elsewhere.
  collect(connector.name, 0);
  collect(connector.provider, 0);

  // Secondary connector metadata is still searchable, but lower priority.
  collect(connector.category, 3);
  collect(connector.accountLabel, 3);

  // Tool names/titles are more relevant than prose descriptions, but below
  // connector-level identity matches.
  for (const tool of connector.tools) {
    collect(tool.title, 5);
    collect(tool.name, 5);
  }

  // Prose descriptions are broad and often mention other products, so they
  // are intentionally down-ranked rather than excluded.
  collect(connector.description, 8);
  for (const tool of connector.tools) {
    collect(tool.description, 8);
  }

  return scores.length ? Math.min(...scores) : null;
}

export function sortConnectorsForSearch(
  connectors: ConnectorDetail[],
  query: string,
): ConnectorDetail[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return sortConnectorsForDisplay(connectors);

  return [...connectors]
    .map((connector) => ({ connector, score: getConnectorSearchScore(connector, normalizedQuery) }))
    .filter((entry): entry is { connector: ConnectorDetail; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const aConnected = a.connector.status === 'connected';
      const bConnected = b.connector.status === 'connected';
      if (aConnected !== bConnected) return aConnected ? -1 : 1;
      return (
        a.connector.name.localeCompare(b.connector.name, undefined, { sensitivity: 'base' }) ||
        a.connector.id.localeCompare(b.connector.id)
      );
    })
    .map((entry) => entry.connector);
}

export function EntryView({
  skills,
  designSystems,
  projects,
  templates,
  promptTemplates,
  defaultDesignSystemId,
  config,
  agents,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  promptTemplatesLoading = false,
  onCreateProject,
  onImportClaudeDesign,
  onImportFolder,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onRefreshDesignSystems,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [topTab, setTopTab] = useState<TopTab>('designs');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [resizing, setResizing] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const envMetaLine = useMemo(() => {
    if (config.mode === 'api') {
      try {
        return `${config.model} · ${new URL(config.baseUrl).host}`;
      } catch {
        return config.model;
      }
    }
    return currentAgent
      ? `${currentAgent.name}${currentAgent.version ? ` · ${currentAgent.version}` : ''}`
      : t('settings.noAgentSelected');
  }, [config.mode, config.model, config.baseUrl, currentAgent, t]);

  function handleCreate(input: CreateInput) {
    onCreateProject(input);
  }

  const startWidthRef = useRef(0);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      const dx = e.clientX - startXRef.current;
      const next = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, startWidthRef.current + dx),
      );
      setSidebarWidth(next);
    }
    function onUp() {
      setResizing(false);
    }
    document.body.classList.add('entry-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.classList.remove('entry-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  const reloadConnectorStatuses = useCallback(async () => {
    const statuses = await fetchConnectorStatuses();
    setConnectors((curr) => applyConnectorStatuses(curr, statuses));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Fetch connectors on mount so the New project panel can show
    // already-configured connectors on the live-artifact tab without
    // waiting for the user to open the Settings → Connectors surface.
    setConnectorsLoading(true);
    (async () => {
      const next = await fetchConnectors();
      if (cancelled) return;
      setConnectors(next);
      setConnectorsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== CONNECTOR_CALLBACK_MESSAGE_TYPE) return;
      if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
      void reloadConnectorStatuses();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [reloadConnectorStatuses]);

  // When the OAuth flow is handed off to the user's system browser (desktop
  // shell opens connector auth URLs externally rather than in an Electron
  // popup), the callback page has no `window.opener` to postMessage back to.
  // Refresh connector statuses whenever the window regains focus so the UI
  // picks up a just-completed connection without manual intervention.
  useEffect(() => {
    function onFocus() {
      void reloadConnectorStatuses();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadConnectorStatuses]);

  const avatarMenu = (
    <button
      type="button"
      className="settings-icon-btn"
      onClick={() => onOpenSettings()}
      title={t('entry.openSettingsTitle')}
      aria-label={t('entry.openSettingsAria')}
    >
      <Icon name="settings" size={17} />
    </button>
  );

  return (
    <div className="entry-shell">
      <AppChromeHeader actions={avatarMenu} />
      <div
        className="entry"
        style={{
          gridTemplateColumns: `${sidebarWidth}px 1fr`,
        }}
      >
      <aside className="entry-side" style={{ width: sidebarWidth }}>
        <NewProjectPanel
          skills={skills}
          designSystems={designSystems}
          defaultDesignSystemId={defaultDesignSystemId}
          templates={templates}
          promptTemplates={promptTemplates}
          onCreate={handleCreate}
          onImportClaudeDesign={onImportClaudeDesign}
          onImportFolder={onImportFolder}
          mediaProviders={config.mediaProviders}
          connectors={connectors}
          connectorsLoading={connectorsLoading}
          onOpenConnectorsTab={() => onOpenSettings('composio')}
          loading={skillsLoading || designSystemsLoading}
        />
        <div className="entry-side-foot">
          <button
            type="button"
            className="foot-pill"
            onClick={() => onOpenSettings()}
            aria-label={t('settings.envConfigure')}
            title={t('settings.envConfigure')}
          >
            <Icon name="settings" size={12} />
            <span>
              {config.mode === 'daemon'
                ? t('settings.localCli')
                : apiProtocolLabel(config.apiProtocol)}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {envMetaLine}
            </span>
          </button>
          <LanguageMenu />
        </div>
        <button
          type="button"
          aria-label={t('entry.resizeAria')}
          className={`entry-side-resizer${resizing ? ' dragging' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            startWidthRef.current = sidebarWidth;
            startXRef.current = e.clientX;
            setResizing(true);
          }}
        />
      </aside>
      <main className="entry-main">
        <div className="entry-header">
          <div className="entry-tabs" role="tablist">
            <TopTabButton current={topTab} value="designs" label={t('entry.tabDesigns')} onClick={setTopTab} />
            <TopTabButton current={topTab} value="design-systems" label="Design Systems" onClick={setTopTab} />
          </div>
        </div>
        <div className="entry-tab-content">
          {topTab === 'designs' ? (
            projectsLoading || skillsLoading || designSystemsLoading ? (
              <CenteredLoader label={t('common.loading')} />
            ) : (
              <DesignsTab
                projects={projects}
                skills={skills}
                designSystems={designSystems}
                onOpen={onOpenProject}
                onOpenLiveArtifact={onOpenLiveArtifact}
                onDelete={onDeleteProject}
              />
            )
          ) : null}
          {topTab === 'design-systems' ? (
            <DesignSystemsManager systems={designSystems} onRefresh={onRefreshDesignSystems} />
          ) : null}
        </div>
      </main>
      </div>
    </div>
  );
}

function TopTabButton({
  current,
  value,
  label,
  onClick,
}: {
  current: TopTab;
  value: TopTab;
  label: string;
  onClick: (v: TopTab) => void;
}) {
  return (
    <button
      role="tab"
      data-testid={`entry-tab-${value}`}
      aria-selected={current === value}
      className={`entry-tab ${current === value ? 'active' : ''}`}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}

