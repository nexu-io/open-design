import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectorDetail, ConnectorStatusResponse } from '@open-design/contracts';
import { useT } from '../i18n';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from '../media/models';
import type {
  AgentInfo,
  AppConfig,
  DesignSystemSummary,
  Project,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { DesignsTab } from './DesignsTab';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { ExamplesTab } from './ExamplesTab';
import { AppChromeHeader } from './AppChromeHeader';
import { Icon } from './Icon';
import { LanguageMenu } from './LanguageMenu';
import { CenteredLoader } from './Loading';
import { NewProjectPanel, type CreateInput } from './NewProjectPanel';
import {
  fetchConnectors,
  fetchConnectorStatuses,
} from '../providers/registry';
import { PetRail } from './pet/PetRail';
import { PromptTemplatePreviewModal } from './PromptTemplatePreviewModal';
import { PromptTemplatesTab } from './PromptTemplatesTab';
import { apiProtocolLabel } from '../utils/apiProtocol';

type TopTab = 'designs' | 'examples' | 'design-systems' | 'image-templates' | 'video-templates';

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  loading?: boolean;
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
  onImportClaudeDesign: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onOpenSettings: (section?: 'execution' | 'media' | 'composio' | 'language' | 'appearance' | 'notifications' | 'pet' | 'about') => void;
  onAdoptPet: () => void;
  onAdoptPetInline: (petId: string) => void;
  onTogglePet: () => void;
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

// Lets the user fully remove the right-side pet rail from the entry
// layout. They re-summon it from the entry-view avatar dropdown — the
// PetRail's own collapse toggle only narrows the column, so this state
// is the "the rail isn't there at all" escape hatch.
const PET_RAIL_HIDDEN_KEY = 'open-design:pet-rail-hidden';

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

function loadPetRailHidden(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PET_RAIL_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
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
  loading = false,
  onCreateProject,
  onImportClaudeDesign,
  onImportFolder,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onOpenSettings,
  onAdoptPet,
  onAdoptPetInline,
  onTogglePet,
}: Props) {
  const t = useT();
  const [topTab, setTopTab] = useState<TopTab>('designs');
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [previewPromptTemplate, setPreviewPromptTemplate] =
    useState<PromptTemplateSummary | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [resizing, setResizing] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [petRailHidden, setPetRailHiddenState] = useState<boolean>(() => loadPetRailHidden());
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  function setPetRailHidden(next: boolean) {
    setPetRailHiddenState(next);
    try {
      window.localStorage.setItem(PET_RAIL_HIDDEN_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

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

  // 'Use this prompt' on an example card is a fast path — skip the form and
  // create the project immediately with sane defaults derived from the skill,
  // seeding the chat composer with the example prompt via pendingPrompt.
  function usePromptFromSkill(skill: SkillSummary) {
    onCreateProject({
      name: skill.name,
      skillId: skill.id,
      designSystemId: null,
      metadata: metadataForSkill(skill),
      pendingPrompt: skill.examplePrompt || skill.description,
    });
  }

  function previewDesignSystem(id: string) {
    setPreviewSystemId(id);
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );

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

  // Dismiss the avatar dropdown on outside-click / Escape so it behaves
  // like the project-view AvatarMenu (which uses the same shell CSS).
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!avatarMenuRef.current) return;
      if (!avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [avatarMenuOpen]);

  const avatarMenu = (
    <div className="avatar-menu" ref={avatarMenuRef}>
      <button
        type="button"
        className="settings-icon-btn"
        onClick={() => setAvatarMenuOpen((v) => !v)}
        title={t('entry.openSettingsTitle')}
        aria-label={t('entry.openSettingsAria')}
        aria-haspopup="menu"
        aria-expanded={avatarMenuOpen}
      >
        <Icon name="settings" size={17} />
      </button>
      {avatarMenuOpen ? (
        <div className="avatar-popover" role="menu">
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setPetRailHidden(!petRailHidden);
              setAvatarMenuOpen(false);
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name={petRailHidden ? 'sparkles' : 'eye'} size={14} />
            </span>
            <span>
              {petRailHidden
                ? t('pet.railShow')
                : t('pet.railHide')}
            </span>
          </button>
          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              onOpenSettings();
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="entry-shell">
      <AppChromeHeader actions={avatarMenu} />
      <div
        className={`entry${petRailHidden ? '' : ' has-pet-rail'}`}
        style={{
          gridTemplateColumns: petRailHidden
            ? `${sidebarWidth}px 1fr`
            : `${sidebarWidth}px 1fr auto`,
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
          loading={loading}
        />
        <div className="entry-side-foot">
          <button
            type="button"
            className={`foot-pill pet-pill${config.pet?.adopted ? '' : ' pet-pill-fresh'}`}
            onClick={onAdoptPet}
            title={
              config.pet?.adopted
                ? t('pet.changePet')
                : t('pet.adoptCallout')
            }
          >
            <span className="pet-pill-glyph" aria-hidden>
              {config.pet?.adopted
                ? config.pet.petId === 'custom'
                  ? config.pet.custom.glyph || '🦄'
                  : '🐾'
                : '🐾'}
            </span>
            <span>
              {config.pet?.adopted
                ? t('pet.changePet')
                : t('pet.adoptCallout')}
            </span>
            {!config.pet?.adopted ? <span className="pet-pill-dot" aria-hidden /> : null}
          </button>
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
          <a
            className="foot-pill"
            href="https://x.com/nexudotio"
            target="_blank"
            rel="noreferrer noopener"
            title="Follow @nexudotio on X for releases and milestones"
            aria-label="Follow @nexudotio on X"
          >
            <Icon name="external-link" size={12} />
            <span>Follow @nexudotio</span>
          </a>
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
            <TopTabButton current={topTab} value="examples" label={t('entry.tabExamples')} onClick={setTopTab} />
            <TopTabButton
              current={topTab}
              value="design-systems"
              label={t('entry.tabDesignSystems')}
              onClick={setTopTab}
            />
            <TopTabButton
              current={topTab}
              value="image-templates"
              label={t('entry.tabImageTemplates')}
              onClick={setTopTab}
            />
            <TopTabButton
              current={topTab}
              value="video-templates"
              label={t('entry.tabVideoTemplates')}
              onClick={setTopTab}
            />
          </div>
        </div>
        <div className="entry-tab-content">
          {loading ? (
            <CenteredLoader label={t('entry.loadingWorkspace')} />
          ) : (
            <>
              {topTab === 'designs' ? (
                <DesignsTab
                  projects={projects}
                  skills={skills}
                  designSystems={designSystems}
                  onOpen={onOpenProject}
                  onOpenLiveArtifact={onOpenLiveArtifact}
                  onDelete={onDeleteProject}
                />
              ) : null}
              {topTab === 'examples' ? (
                <ExamplesTab skills={skills} onUsePrompt={usePromptFromSkill} />
              ) : null}
              {topTab === 'design-systems' ? (
                <DesignSystemsTab
                  systems={designSystems}
                  selectedId={defaultDesignSystemId}
                  onSelect={onChangeDefaultDesignSystem}
                  onPreview={previewDesignSystem}
                />
              ) : null}
              {topTab === 'image-templates' ? (
                <PromptTemplatesTab
                  surface="image"
                  templates={promptTemplates}
                  onPreview={setPreviewPromptTemplate}
                />
              ) : null}
              {topTab === 'video-templates' ? (
                <PromptTemplatesTab
                  surface="video"
                  templates={promptTemplates}
                  onPreview={setPreviewPromptTemplate}
                />
              ) : null}
            </>
          )}
        </div>
      </main>
      {petRailHidden ? null : (
        <PetRail
          config={config}
          onAdoptInline={onAdoptPetInline}
          onOpenPetSettings={onAdoptPet}
          onTuck={onTogglePet}
          onHide={() => setPetRailHidden(true)}
        />
      )}
      </div>
      {previewSystem ? (
        <DesignSystemPreviewModal
          system={previewSystem}
          onClose={() => setPreviewSystemId(null)}
        />
      ) : null}
      {previewPromptTemplate ? (
        <PromptTemplatePreviewModal
          summary={previewPromptTemplate}
          onClose={() => setPreviewPromptTemplate(null)}
        />
      ) : null}
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

// Map a skill's declared mode to project metadata. Falls back to the same
// defaults the new-project form would apply (high-fidelity prototype, no
// speaker notes on decks, no template animations) so 'Use this prompt'
// produces a project indistinguishable from one created via the form. Per-
// skill hints in SKILL.md frontmatter (od.fidelity, od.speaker_notes,
// od.animations) override the defaults so each example reproduces the
// shipped example.html — e.g. wireframe-sketch declares fidelity:wireframe.
function metadataForSkill(skill: SkillSummary): ProjectMetadata {
  const kind = kindForSkill(skill);
  if (kind === 'prototype') {
    return { kind, fidelity: skill.fidelity ?? 'high-fidelity' };
  }
  if (kind === 'deck') {
    return {
      kind,
      speakerNotes:
        typeof skill.speakerNotes === 'boolean' ? skill.speakerNotes : false,
    };
  }
  if (kind === 'template') {
    return {
      kind,
      animations:
        typeof skill.animations === 'boolean' ? skill.animations : false,
    };
  }
  if (kind === 'image') {
    return { kind, imageModel: DEFAULT_IMAGE_MODEL, imageAspect: '1:1' };
  }
  if (kind === 'video') {
    return { kind, videoModel: DEFAULT_VIDEO_MODEL, videoAspect: '16:9', videoLength: 5 };
  }
  if (kind === 'audio') {
    return {
      kind,
      audioKind: 'speech',
      audioModel: DEFAULT_AUDIO_MODEL.speech,
      audioDuration: 10,
    };
  }
  return { kind: 'other' };
}

function kindForSkill(skill: SkillSummary): ProjectKind {
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  if (skill.mode === 'template') return 'template';
  if (skill.mode === 'image' || skill.surface === 'image') return 'image';
  if (skill.mode === 'video' || skill.surface === 'video') return 'video';
  if (skill.mode === 'audio' || skill.surface === 'audio') return 'audio';
  return 'other';
}
