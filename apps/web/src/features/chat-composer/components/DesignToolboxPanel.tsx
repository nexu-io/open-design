// The "+" → design-toolbox flyout: follow-up actions plus searchable
// skill/plugin/mcp/connector/file resources. Hover-detail positioning is
// owned by `useWiredDesignToolboxDetail` (a feature-local hook injected with
// the viewport port); the portal target is passed in as `modalHost` (the
// orchestrator resolves `document.body`, matching the
// `MemoryAdvancedModal` canary) so this component stays DOM-free. Otherwise
// props-in/JSX-out aside from its own search-query state and the one-time
// `onOpened` mount effect.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { ComposerPluginPreview } from '../../../components/ComposerPluginPreview';
import {
  designToolboxActionBadge,
  designToolboxActionDescription,
  designToolboxActionMatchesQuery,
  designToolboxActionTitle,
  findDesignToolboxSkill,
  type DesignToolboxAction,
} from '../../../runtime/design-toolbox';
import type {
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  McpTemplate,
} from '@open-design/contracts';
import type { ProjectFile, SkillSummary } from '../../../types';
import { localizeSkillDescription, localizeSkillName } from '../../../i18n/content';
import {
  buildDesignToolboxResources,
  designToolboxDefaultResources,
  designToolboxResourceIsActive,
  designToolboxResourceKindLabel,
  designToolboxResourceMatchesQuery,
} from '../rules';
import type { DesignToolboxResource } from '../types';
import { ToolboxItemRow } from './ToolboxItemRow';
import { useWiredDesignToolboxDetail } from '../hooks/useDesignToolboxDetail.hooks';

export function DesignToolboxPanel({
  actions,
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  activeSkillIds,
  activePluginId,
  activeMcpServerIds,
  activeConnectorIds,
  activeFilePaths,
  modalHost,
  onPickAction,
  onPickSkill,
  onPickResource,
  onOpened,
}: {
  actions: DesignToolboxAction[];
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
  activeSkillIds: string[];
  activePluginId: string | null;
  activeMcpServerIds: string[];
  activeConnectorIds: string[];
  activeFilePaths: string[];
  modalHost: HTMLElement | null;
  onPickAction: (action: DesignToolboxAction) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickResource: (resource: DesignToolboxResource) => void;
  onOpened?: () => void;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  // Fire once when the toolbox panel mounts (i.e. the user opened it).
  useEffect(() => {
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activeSkillSet = useMemo(() => new Set(activeSkillIds), [activeSkillIds]);
  const activeMcpServerSet = useMemo(() => new Set(activeMcpServerIds), [activeMcpServerIds]);
  const activeConnectorSet = useMemo(() => new Set(activeConnectorIds), [activeConnectorIds]);
  const activeFileSet = useMemo(() => new Set(activeFilePaths), [activeFilePaths]);
  const resources = useMemo(
    () =>
      buildDesignToolboxResources({
        skills,
        plugins,
        mcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
        locale,
        t,
      }),
    [connectors, locale, mcpServers, mcpTemplates, plugins, projectFiles, skills, t],
  );
  const visibleActions = useMemo(
    () =>
      actions.filter((action) => {
        const skill = findDesignToolboxSkill(action, skills);
        return designToolboxActionMatchesQuery(
          action,
          query,
          skill,
          t,
          skill ? [localizeSkillName(locale, skill), localizeSkillDescription(locale, skill)] : [],
        );
      }),
    [actions, query, skills, locale, t],
  );
  const visibleResources = useMemo(
    () => {
      const source = query
        ? resources.filter((resource) => designToolboxResourceMatchesQuery(resource, query))
        : designToolboxDefaultResources(actions, resources);
      return source.slice(0, query ? 14 : 8);
    },
    [actions, query, resources],
  );

  const { toolboxDetail, showToolboxDetail, cancelDetailClose, scheduleToolboxDetailClose } =
    useWiredDesignToolboxDetail();

  return (
    <>
      <div className="composer-design-toolbox-head">
        <div className="composer-design-toolbox-title">
          <Icon name="lightbulb" size={14} />
          <span>{t('chat.designToolbox.title')}</span>
        </div>
      </div>
      <div className="plus-menu__search">
        <Icon name="search" size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('chat.designToolbox.searchPlaceholder')}
          aria-label={t('chat.designToolbox.searchAria')}
        />
      </div>
      {visibleActions.length > 0 || visibleResources.length > 0 ? (
        <div className="plus-menu__list">
          {visibleActions.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.followupSection')}
            </div>
          ) : null}
          {visibleActions.map((action) => {
            const skill = findDesignToolboxSkill(action, skills);
            const actionTitle = designToolboxActionTitle(action, t);
            const actionDescription = designToolboxActionDescription(action, t);
            const skillName = skill ? localizeSkillName(locale, skill) : null;
            return (
              <ToolboxItemRow
                key={action.id}
                detailKey={action.id}
                icon={action.icon}
                name={actionTitle}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => onPickAction(action)}
                detail={
                  <>
                    <div className="plus-menu__detail-title">{actionTitle}</div>
                    {actionDescription ? (
                      <div className="plus-menu__detail-desc">{actionDescription}</div>
                    ) : null}
                    {skillName ? (
                      <div className="plus-menu__detail-skill">@{skillName}</div>
                    ) : null}
                    <div className="plus-menu__detail-badge">
                      {designToolboxActionBadge(action, t)}
                    </div>
                  </>
                }
              />
            );
          })}
          {visibleResources.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.resourcesSection')}
            </div>
          ) : null}
          {visibleResources.map((resource) => {
            const active = designToolboxResourceIsActive(resource, {
              skillIds: activeSkillSet,
              pluginId: activePluginId,
              mcpServerIds: activeMcpServerSet,
              connectorIds: activeConnectorSet,
              filePaths: activeFileSet,
            });
            return (
              <ToolboxItemRow
                key={resource.key}
                detailKey={resource.key}
                icon={resource.icon}
                name={resource.title}
                active={active}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => {
                  if (resource.kind === 'skill') {
                    onPickSkill(resource.skill);
                  } else {
                    onPickResource(resource);
                  }
                }}
                detail={
                  // Plugin rows reuse the rich visual preview (poster /
                  // sandboxed example iframe + meta); every other kind keeps
                  // the compact text detail since it has no preview asset.
                  resource.kind === 'plugin' ? (
                    <ComposerPluginPreview record={resource.plugin} locale={locale} />
                  ) : (
                    <>
                      <div className="plus-menu__detail-title">{resource.title}</div>
                      {resource.subtitle ? (
                        <div className="plus-menu__detail-desc">{resource.subtitle}</div>
                      ) : null}
                      <div className="plus-menu__detail-skill">
                        {designToolboxResourceKindLabel(resource.kind, t)}
                      </div>
                      <div className="plus-menu__detail-badge">
                        {active ? t('chat.designToolbox.selected') : resource.badge}
                      </div>
                    </>
                  )
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="plus-menu__empty">
          {t('chat.designToolbox.noResources', { query })}
        </div>
      )}
      {toolboxDetail && modalHost
        ? createPortal(
            <div
              className="plus-menu__detail"
              style={{ left: toolboxDetail.left, top: toolboxDetail.top }}
              onMouseEnter={cancelDetailClose}
              onMouseLeave={() => scheduleToolboxDetailClose(toolboxDetail.key)}
            >
              {toolboxDetail.node}
            </div>,
            modalHost,
          )
        : null}
    </>
  );
}
