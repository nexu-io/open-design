import { useCallback, useEffect, useState } from 'react';
import type {
  ConnectorDetail,
  ConnectorStatusResponse,
  ImportFolderResponse,
} from '@open-design/contracts';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from '../media/models';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
// `EntryShell` owns the redesigned home layout (left rail + centered
// hero + recent projects + plugins). Keeping the redesign in a sibling
// component lets future rebases against upstream `EntryView` (props,
// connector lifecycle, exported helpers) stay close to a no-op here.
import { EntryShell } from './EntryShell';
import type { IntegrationTab } from './IntegrationsView';
import type { CreateInput } from './NewProjectPanel';
import {
  fetchConnectors,
  fetchConnectorStatuses,
} from '../providers/registry';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
} from '../state/projects';

interface Props {
  // Union of functional skills + design templates — used for id-based
  // lookups (DesignsTab project chips, NewProjectPanel skill picker).
  // The Templates gallery itself reads `designTemplates` instead so it
  // doesn't accidentally show functional skills as renderable cards.
  skills: SkillSummary[];
  // Design templates only. Sourced from /api/design-templates. See
  // specs/current/skills-and-design-templates.md.
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  onDeleteTemplate: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  agents: AgentInfo[];
  // Execution / model-switching context forwarded to the EntryShell so the
  // sticky top-bar can expose the active CLI/BYOK + model and persist
  // changes through the same channels as the project view.
  config: AppConfig;
  integrationInitialTab?: IntegrationTab;
  composioConfigLoading?: boolean;
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  // Quick theme switch invoked from the avatar-popover dropdown so the
  // user can flip light/dark/system without opening the full Settings
  // dialog. Persistence happens in `App`; this component just forwards.
  onThemeChange: (theme: AppTheme) => void;
  // Per-resource loading flags. Each tab gates its own content on whichever
  // flag matches the data it renders, so a slow `/api/agents` probe does
  // not block tabs that don't need agents. Templates are not gated here —
  // the New project modal renders an empty state until they arrive (fast
  // fetch), which keeps the prop surface narrower.
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  promptTemplatesLoading?: boolean;
  onCreateProject: (
    input: CreateInput & {
      pendingPrompt?: string;
      pluginId?: string;
      appliedPluginSnapshotId?: string;
      pluginInputs?: Record<string, unknown>;
      autoSendFirstMessage?: boolean;
      pendingFiles?: File[];
    },
  ) => void;
  onCreatePluginShareProject: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
  onImportClaudeDesign: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<boolean> | boolean;
  onImportFolderResponse?: (response: ImportFolderResponse) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
  onOpenSettings: (section?: 'execution' | 'media' | 'composio' | 'orbit' | 'integrations' | 'mcpClient' | 'language' | 'appearance' | 'notifications' | 'pet' | 'library' | 'about') => void;
}

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
  designTemplates,
  designSystems,
  projects,
  templates,
  onDeleteTemplate,
  promptTemplates,
  defaultDesignSystemId,
  agents,
  config,
  integrationInitialTab,
  composioConfigLoading = false,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onThemeChange,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  promptTemplatesLoading: _promptTemplatesLoading = false,
  onCreateProject,
  onCreatePluginShareProject,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onRenameProject,
  onChangeDefaultDesignSystem,
  onPersistComposioKey,
  onOpenSettings,
}: Props) {
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);

  const reloadConnectorStatuses = useCallback(async () => {
    const statuses = await fetchConnectorStatuses();
    setConnectors((curr) => applyConnectorStatuses(curr, statuses));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Fetch connectors on mount so the New project modal can show
    // already-configured connectors without waiting for the user to
    // open the Settings → Connectors surface.
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

  return (
    <EntryShell
      skills={skills}
      designSystems={designSystems}
      projects={projects}
      templates={templates}
      promptTemplates={promptTemplates}
      defaultDesignSystemId={defaultDesignSystemId}
      connectors={connectors}
      connectorsLoading={connectorsLoading}
      {...(integrationInitialTab ? { integrationInitialTab } : {})}
      composioConfigLoading={composioConfigLoading}
      skillsLoading={skillsLoading}
      designSystemsLoading={designSystemsLoading}
      projectsLoading={projectsLoading}
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={onApiProtocolChange}
      onApiModelChange={onApiModelChange}
      onThemeChange={onThemeChange}
      onCreateProject={onCreateProject}
      onCreatePluginShareProject={onCreatePluginShareProject}
      onImportClaudeDesign={onImportClaudeDesign}
      {...(onImportFolder ? { onImportFolder } : {})}
      onOpenProject={onOpenProject}
      onOpenLiveArtifact={onOpenLiveArtifact}
      onDeleteProject={onDeleteProject}
      onChangeDefaultDesignSystem={onChangeDefaultDesignSystem}
      onPersistComposioKey={onPersistComposioKey}
      onOpenSettings={onOpenSettings}
    />
  );
}

// Map a skill's declared mode to project metadata. Falls back to the same
// defaults the new-project form would apply (high-fidelity prototype, no
// speaker notes on decks, no template animations) so 'Use this prompt'
// produces a project indistinguishable from one created via the form. Per-
// skill hints in SKILL.md frontmatter (od.fidelity, od.speaker_notes,
// od.animations) override the defaults so each example reproduces the
// shipped example.html — e.g. wireframe-sketch declares fidelity:wireframe.
//
// Kept exported (and the kindForSkill helper too) so the New project modal
// and any future skill-driven creation surface can share the mapping.
export function metadataForSkill(skill: SkillSummary): ProjectMetadata {
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

export function kindForSkill(skill: SkillSummary): ProjectKind {
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  if (skill.mode === 'template') return 'template';
  if (skill.mode === 'image' || skill.surface === 'image') return 'image';
  if (skill.mode === 'video' || skill.surface === 'video') return 'video';
  if (skill.mode === 'audio' || skill.surface === 'audio') return 'audio';
  return 'other';
}
