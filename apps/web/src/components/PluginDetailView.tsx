// Plan G4 / spec §11.6 — installed extension detail.
//
// This route intentionally presents a curated, full-page summary for people
// using an installed extension. The manifest remains the source of truth:
// unsupported "quick commands" stay visibly empty instead of being invented
// from skill names, while connector and skill rows map declared references.
// Developer-oriented provenance and manifest metadata remain available behind
// a collapsed disclosure.

import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import type {
  InstalledPluginRecord,
  PluginConnectorRef,
} from '@open-design/contracts';
import {
  applyPlugin,
  resolvedWorkspaceContextForWrite,
} from '../state/projects';
import type { WorkspaceContextState } from '../collab/useWorkspaceContext';
import {
  workspaceProjectHeaders,
  workspaceResourceUrl,
} from '../collab/workspace-identity';
import { goBack, navigate } from '../router';
import {
  createPluginUseHandoff,
  stashHomePromptHandoff,
} from './home-hero/plugin-authoring';
import { useI18n } from '../i18n';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';
import { useAnalytics } from '../analytics/provider';
import { trackPluginDetailClick } from '../analytics/events';
import { Icon } from './Icon';
import { PluginMetaSections } from './plugin-details/PluginMetaSections';
import { buildPluginInstallCommand } from './plugin-details/PluginShareMenu';
import { localizePluginChrome } from '../i18n/plugin-content';
import { derivePluginSourceLinks } from '../runtime/plugin-source';
import {
  loadPluginSkillDescriptions,
  normalizePluginSkillAssetPath,
} from '../runtime/plugin-skill-descriptions';

interface Props {
  pluginId: string;
  workspaceContextState?: WorkspaceContextState;
}

const LEGACY_WORKSPACE_CONTEXT_STATE: WorkspaceContextState = {
  context: null,
  loading: false,
};

interface KnowledgeSkill {
  key: string;
  label: string;
  assetPath: string | null;
}

interface ConnectionRow {
  id: string;
  tools: string[];
  requirement: 'required' | 'optional';
}

interface SkillDescriptionState {
  pluginId: string;
  descriptions: Record<string, string>;
}

function referenceLabel(reference: { ref?: string; path?: string }): string {
  return reference.ref?.trim() || reference.path?.trim() || '';
}

/**
 * Knowledge skills come from the runtime context bundle. Older portable
 * plugins may only declare `compat.agentSkills`, so use those only when the
 * canonical context list is empty. Empty/duplicate references are discarded
 * rather than shown as placeholder content.
 */
function knowledgeSkillsFor(plugin: InstalledPluginRecord): KnowledgeSkill[] {
  const contextSkills = plugin.manifest.od?.context?.skills ?? [];
  const canonical = normalizeSkillReferences(contextSkills);
  if (canonical.length > 0) return canonical;
  return normalizeSkillReferences(plugin.manifest.compat?.agentSkills ?? []);
}

function normalizeSkillReferences(
  references: ReadonlyArray<{ ref?: string; path?: string }>,
): KnowledgeSkill[] {
  const seen = new Set<string>();

  return references.flatMap((reference) => {
    const label = referenceLabel(reference);
    if (!label || seen.has(label)) return [];
    seen.add(label);
    return [{
      key: label,
      label,
      assetPath: normalizePluginSkillAssetPath(reference.path),
    }];
  });
}

function connectionRowsFor(plugin: InstalledPluginRecord): ConnectionRow[] {
  const byId = new Map<string, ConnectionRow>();

  const merge = (
    connectors: ReadonlyArray<PluginConnectorRef> | undefined,
    requirement: ConnectionRow['requirement'],
  ) => {
    for (const connector of connectors ?? []) {
      const id = connector.id.trim();
      if (!id) continue;
      const existing = byId.get(id);
      const tools = new Set(existing?.tools ?? []);
      for (const rawTool of connector.tools) {
        const tool = rawTool.trim();
        if (tool) tools.add(tool);
      }
      byId.set(id, {
        id,
        tools: [...tools],
        requirement:
          requirement === 'required' || existing?.requirement === 'required'
            ? 'required'
            : 'optional',
      });
    }
  };

  const connectors = plugin.manifest.od?.connectors;
  merge(connectors?.required, 'required');
  merge(connectors?.optional, 'optional');
  return [...byId.values()];
}

function isOfficialPlugin(plugin: InstalledPluginRecord): boolean {
  return (
    plugin.sourceKind === 'bundled'
    || plugin.trust === 'bundled'
    || plugin.marketplaceTrust === 'official'
  );
}

function pluginInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'OD';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
}

function DetailSection({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const headingId = `plugin-suite-detail-${id}`;
  return (
    <section
      className="plugin-suite-detail__section"
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>
        {title}
        <span>({count})</span>
      </h2>
      {children}
    </section>
  );
}

export function PluginDetailView(props: Props) {
  const workspaceContextState =
    props.workspaceContextState ?? LEGACY_WORKSPACE_CONTEXT_STATE;
  const pluginWorkspaceContextReady =
    !workspaceContextState.loading
    && !workspaceContextState.identityChangePending
    && workspaceContextState.failure !== 'unavailable';
  const pluginWorkspaceContext = pluginWorkspaceContextReady
    ? workspaceContextState.context
    : null;
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const [plugin, setPlugin] = useState<InstalledPluginRecord | null>(null);
  const [error, setError] = useState<{ kind: 'load' | 'apply'; message: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [skillDescriptionState, setSkillDescriptionState] = useState<SkillDescriptionState>({
    pluginId: '',
    descriptions: {},
  });

  const onBack = () => {
    trackPluginDetailClick(analytics.track, {
      page_name: 'plugins',
      area: 'plugin_detail',
      element: 'back',
      plugin_id: props.pluginId,
    });
    goBack({ kind: 'home', view: 'plugins' });
  };

  useEffect(() => {
    if (!pluginWorkspaceContextReady) return;
    let cancelled = false;
    void fetch(`/api/plugins/${encodeURIComponent(props.pluginId)}`, {
      ...(pluginWorkspaceContext
        ? { headers: workspaceProjectHeaders(pluginWorkspaceContext) }
        : {}),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((row) => {
        if (cancelled) return;
        setPlugin(row as InstalledPluginRecord);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError({ kind: 'load', message: (reason as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [props.pluginId, pluginWorkspaceContext, pluginWorkspaceContextReady]);

  useEffect(() => {
    if (!pluginWorkspaceContextReady || !plugin || plugin.id !== props.pluginId) return;
    const controller = new AbortController();
    void loadPluginSkillDescriptions(
      plugin.id,
      knowledgeSkillsFor(plugin),
      controller.signal,
      pluginWorkspaceContext,
    ).then((descriptions) => {
      if (!controller.signal.aborted) {
        setSkillDescriptionState({ pluginId: plugin.id, descriptions });
      }
    });
    return () => controller.abort();
  }, [plugin, props.pluginId, pluginWorkspaceContext, pluginWorkspaceContextReady]);

  if (error) {
    return (
      <section className="plugin-marketplace plugin-suite-detail" data-testid="plugin-detail">
        <header className="plugin-suite-detail__topbar">
          <Button variant="ghost" className="plugin-suite-detail__back" onClick={onBack}>
            <Icon name="arrow-left" size={15} />
            {t('pluginDetail.backToList')}
          </Button>
        </header>
        <div className="plugin-suite-detail__empty-row" role="alert">
          {error.kind === 'load'
            ? t('pluginDetail.loadFailed', { error: error.message })
            : t('pluginDetail.applyFailed')}
        </div>
      </section>
    );
  }

  if (!plugin) {
    return (
      <section className="plugin-marketplace plugin-suite-detail" data-testid="plugin-detail">
        <div className="plugin-suite-detail__empty-row">{t('common.loading')}</div>
      </section>
    );
  }

  const localizedTitle = localizePluginTitle(locale, plugin);
  const localizedDescription = localizePluginDescription(locale, plugin);
  const od = plugin.manifest.od ?? {};
  const connections = connectionRowsFor(plugin);
  const skills = knowledgeSkillsFor(plugin);
  const hasPreview = typeof od.preview?.entry === 'string' && od.preview.entry.length > 0;
  const examples = od.useCase?.exampleOutputs ?? [];
  const sourceLinks = derivePluginSourceLinks(plugin);
  const official = isOfficialPlugin(plugin);
  const author = official
    ? '@OpenDesign'
    : (sourceLinks.authorName || sourceLinks.sourceLabel);
  const badge = official
    ? t('pluginDetail.officialBadge')
    : sourceLinks.sourceKindLabel;

  const onUse = async () => {
    trackPluginDetailClick(analytics.track, {
      page_name: 'plugins',
      area: 'plugin_detail',
      element: 'use_plugin',
      plugin_id: plugin.id,
    });
    setApplying(true);
    setError(null);
    const result = await applyPlugin(plugin.id, {
      locale,
      workspaceContext: resolvedWorkspaceContextForWrite(workspaceContextState),
    });
    setApplying(false);
    if (!result) {
      setError({ kind: 'apply', message: '' });
      return;
    }
    // This surface is a route rendered outside `EntryShell`, so navigating home
    // unmounts whatever held the result. Publish the same `plugin-use` handoff
    // the marketplace card's "Try it" produces and let Home's existing
    // pendingPluginUseHandoff path select the plugin and pre-fill the brief;
    // keeping the result in local state here dropped both on navigation.
    stashHomePromptHandoff(createPluginUseHandoff(Date.now(), plugin.id, { action: 'use' }));
    navigate({ kind: 'home', view: 'home' });
  };

  return (
    <section
      className="plugin-marketplace plugin-suite-detail"
      data-testid="plugin-detail"
      aria-labelledby="plugin-suite-title"
    >
      <header className="plugin-suite-detail__topbar">
        <Button variant="ghost" className="plugin-suite-detail__back" onClick={onBack}>
          <Icon name="arrow-left" size={15} />
          {t('pluginDetail.backToList')}
        </Button>
      </header>

      <div className="plugin-suite-detail__hero">
        <span className="plugin-marketplace__icon" aria-hidden>
          {pluginInitials(localizedTitle)}
        </span>
        <div>
          <div className="plugin-suite-detail__title-row">
            <h1 id="plugin-suite-title">{localizedTitle}</h1>
            <span>{badge}</span>
          </div>
          <p className="plugin-suite-detail__author">{author}</p>
        </div>
      </div>

      {localizedDescription ? (
        <p className="plugin-suite-detail__description">{localizedDescription}</p>
      ) : null}

      <DetailSection id="quick-commands" title={t('pluginDetail.quickCommands')} count={0}>
        <div className="plugin-suite-detail__command-list">
          <div className="plugin-suite-detail__empty-row">
            {t('pluginDetail.noQuickCommands')}
          </div>
        </div>
      </DetailSection>

      <DetailSection
        id="data-connections"
        title={t('pluginDetail.dataConnections')}
        count={connections.length}
      >
        <div className="plugin-suite-detail__connection-list">
          {connections.length > 0 ? connections.map((row) => (
            <div key={row.id} className="plugin-suite-detail__connection">
              <span aria-hidden />
              <div className="plugin-suite-detail__connection-meta">
                <strong>{row.id}</strong>
                {row.tools.length > 0 ? (
                  <small>{row.tools.join(', ')}</small>
                ) : null}
              </div>
              <em>{localizePluginChrome(locale, row.requirement)}</em>
            </div>
          )) : (
            <div className="plugin-suite-detail__empty-row">
              {t('pluginDetail.noDataConnections')}
            </div>
          )}
        </div>
      </DetailSection>

      <DetailSection
        id="knowledge-skills"
        title={t('pluginDetail.knowledgeSkills')}
        count={skills.length}
      >
        <div className="plugin-suite-detail__skill-list">
          {skills.length > 0 ? skills.map((skill) => {
            const description = (
              skillDescriptionState.pluginId === props.pluginId
              && plugin.id === props.pluginId
            )
              ? skillDescriptionState.descriptions[skill.key]
              : '';
            return (
              <article key={skill.key} className="plugin-suite-detail__skill">
                <h3>{skill.label}</h3>
                {description ? <p>{description}</p> : null}
              </article>
            );
          }) : (
            <div className="plugin-suite-detail__empty-row">
              {t('pluginDetail.noKnowledgeSkills')}
            </div>
          )}
        </div>
      </DetailSection>

      {hasPreview ? (
        <DetailSection id="preview" title={t('common.preview')} count={1}>
          <div
            className="plugin-detail__preview"
            data-testid="plugin-detail-preview-section"
          >
            <iframe
              title={`${localizedTitle} preview`}
              src={workspaceResourceUrl(
                `/api/plugins/${encodeURIComponent(plugin.id)}/preview`,
                pluginWorkspaceContext,
              )}
              sandbox="allow-scripts"
              className="plugin-detail__preview-frame"
              data-testid="plugin-detail-preview-iframe"
              style={{
                width: '100%',
                minHeight: 360,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                background: '#fff',
              }}
            />
          </div>
        </DetailSection>
      ) : null}

      {examples.length > 0 ? (
        <DetailSection
          id="examples"
          title={t('pluginDetail.examples')}
          count={examples.length}
        >
          <div
            className="plugin-suite-detail__skill-list"
            data-testid="plugin-detail-examples-section"
          >
            {examples.map((example, index) => {
              const base = example.path.split(/[\\/]/).filter(Boolean).pop() ?? `${index}`;
              const stem = base.replace(/\.[^.]+$/, '');
              const name = example.title ?? stem;
              return (
                <article
                  key={`${example.path}-${index}`}
                  className="plugin-suite-detail__skill"
                >
                  <h3>
                    <a
                      href={workspaceResourceUrl(
                        `/api/plugins/${encodeURIComponent(plugin.id)}/example/${encodeURIComponent(stem)}`,
                        pluginWorkspaceContext,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`plugin-detail-example-${stem}`}
                    >
                      {name}
                    </a>
                  </h3>
                  {example.title && example.title !== stem ? <p><code>{stem}</code></p> : null}
                </article>
              );
            })}
          </div>
        </DetailSection>
      ) : null}

      <section className="plugin-suite-detail__section plugin-suite-detail__advanced">
        <details
          className="plugin-meta-sections__advanced"
          data-testid="plugin-meta-advanced"
        >
          <summary className="plugin-meta-sections__advanced-summary">
            {localizePluginChrome(locale, 'developerDetails')}
          </summary>
          <div>
            <div className="plugins-view__install-command">
              <code>{buildPluginInstallCommand(plugin)}</code>
            </div>
            <PluginMetaSections
              record={plugin}
              omit={{ byline: true, description: true, query: true }}
            />
          </div>
        </details>
      </section>

      <footer className="plugin-suite-detail__section">
        <Button
          variant="primary"
          className="plugin-detail__use"
          onClick={onUse}
          disabled={applying}
          data-testid="plugin-detail-use"
        >
          {applying ? t('pluginCard.applying') : t('preview.usePlugin')}
        </Button>
      </footer>
    </section>
  );
}
