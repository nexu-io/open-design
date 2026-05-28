import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppConfig, SkillSummary } from '../types';
import {
  buildSkillCatalogTree,
  type SkillCatalogTree,
  type SkillCatalogTreeSkill,
} from '@open-design/contracts';
import { useAnalytics } from '../analytics/provider';
import {
  trackIntegrationsConnectorsTabClick,
  trackIntegrationsTabClick,
  trackPageView,
  trackSettingsConnectorAuthResult,
} from '../analytics/events';
import { ConnectorSection } from './SettingsDialog';
import { Icon } from './Icon';
import { McpClientSection } from './McpClientSection';
import { UseEverywhereGuidePanel } from './UseEverywhereModal';
import { fetchSkills } from '../providers/registry';
import { useI18n, useT } from '../i18n';
import {
  localizeSkillDescription,
  localizeSkillName,
  localizeSkillPrompt,
} from '../i18n/content';

export type IntegrationTab = 'mcp' | 'connectors' | 'skills' | 'use-everywhere';

interface Props {
  config: AppConfig;
  initialTab?: IntegrationTab;
  composioConfigLoading?: boolean;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
}

const INTEGRATION_TABS: ReadonlyArray<{
  id: IntegrationTab;
}> = [
  { id: 'mcp' },
  { id: 'connectors' },
  { id: 'skills' },
  { id: 'use-everywhere' },
];

function integrationTabToTrackingElement(
  id: IntegrationTab,
): 'mcp' | 'connectors' | 'skills' | 'use_everywhere' {
  if (id === 'use-everywhere') return 'use_everywhere';
  return id;
}

export function IntegrationsView({
  config,
  initialTab = 'mcp',
  composioConfigLoading = false,
  onPersistComposioKey,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const integrationsPageViewFiredRef = useRef(false);
  useEffect(() => {
    if (integrationsPageViewFiredRef.current) return;
    integrationsPageViewFiredRef.current = true;
    trackPageView(analytics.track, { page_name: 'integrations' });
  }, [analytics.track]);
  const [activeTab, setActiveTab] = useState<IntegrationTab>(initialTab);
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setLocalConfig((curr) => ({
      ...curr,
      composio: config.composio,
    }));
  }, [config.composio]);

  const liveDaemonUrl =
    typeof window !== 'undefined' ? window.location.origin : undefined;

  return (
    <section className="integrations-view" aria-labelledby="integrations-title">
      <header className="integrations-view__hero">
        <div>
          <p className="integrations-view__kicker">{t('integrations.kicker')}</p>
          <h1 id="integrations-title" className="entry-section__title">
            {t('entry.navIntegrations')}
          </h1>
          <p className="integrations-view__lede">
            {t('integrations.lede')}
          </p>
        </div>
        <div className="integrations-view__badge" aria-hidden="true">
          <Icon name="link" size={15} />
          <span>{t('integrations.agentReady')}</span>
        </div>
      </header>

      <nav
        className="integrations-view__tabs"
        role="tablist"
        aria-label={t('integrations.areasAria')}
      >
        {INTEGRATION_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`integrations-view__tab${active ? ' is-active' : ''}`}
              onClick={() => {
                trackIntegrationsTabClick(analytics.track, {
                  page_name: 'integrations',
                  area: 'integrations_tab',
                  element: integrationTabToTrackingElement(tab.id),
                });
                setActiveTab(tab.id);
              }}
              data-testid={`integrations-tab-${tab.id}`}
            >
              <span className="integrations-view__tab-label">{integrationTabLabel(tab.id, t)}</span>
              <span className="integrations-view__tab-hint">{integrationTabHint(tab.id, t)}</span>
            </button>
          );
        })}
      </nav>

      <div className="integrations-view__panel">
        {activeTab === 'mcp' ? <McpClientSection /> : null}

        {activeTab === 'connectors' ? (
          <ConnectorSection
            cfg={localConfig}
            setCfg={setLocalConfig}
            composioConfigLoading={composioConfigLoading}
            onPersistComposioKey={onPersistComposioKey}
            onConnectorsTabClick={(element) =>
              trackIntegrationsConnectorsTabClick(analytics.track, {
                page_name: 'integrations',
                area: 'connectors_tab',
                element,
              })
            }
            onConnectorAuthResult={({ connectorId, action, result, errorCode }) =>
              trackSettingsConnectorAuthResult(analytics.track, {
                page_name: 'settings',
                area: 'connectors',
                connector_id: connectorId,
                action,
                result,
                ...(errorCode ? { error_code: errorCode } : {}),
              })
            }
          />
        ) : null}

        {activeTab === 'skills' ? <SkillsCatalogTreePanel /> : null}

        {activeTab === 'use-everywhere' ? (
          <div className="integrations-view__use-everywhere">
            <UseEverywhereGuidePanel
              onOpenSettings={() => setActiveTab('mcp')}
              {...(liveDaemonUrl ? { daemonUrl: liveDaemonUrl } : {})}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SkillsCatalogTreePanel() {
  const t = useT();
  const { locale } = useI18n();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<SkillCatalogViewMode>('list');
  const [filters, setFilters] = useState<SkillCatalogFilters>(DEFAULT_SKILL_CATALOG_FILTERS);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void fetchSkills({ throwOnError: true })
      .then((list) => {
        if (cancelled) return;
        setSkills(list);
      })
      .catch(() => {
        if (cancelled) return;
        setSkills([]);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase();
    return skills.filter((skill) => {
      if (filters.mode !== 'all' && skill.mode !== filters.mode) return false;
      if (filters.scenario !== 'all' && skillCatalogScenario(skill) !== filters.scenario) return false;
      if (filters.category !== 'all' && (skill.category ?? '') !== filters.category) return false;
      if (filters.platform !== 'all' && (skill.platform ?? '') !== filters.platform) return false;
      if (filters.previewType !== 'all' && skill.previewType !== filters.previewType) return false;
      if (filters.designSystem === 'required' && !skill.designSystemRequired) return false;
      if (filters.designSystem === 'optional' && skill.designSystemRequired) return false;
      if (!query) return true;
      const name = localizeSkillName(locale, skill) || skill.name;
      const description = localizeSkillDescription(locale, skill);
      const haystack = [
        skill.id,
        name,
        description,
        skill.mode,
        skillCatalogScenario(skill),
        skill.platform ?? '',
        skill.previewType,
        skill.category ?? '',
        ...(skill.triggers ?? []),
      ].join('\n');
      return haystack.toLowerCase().includes(query);
    });
  }, [filters, locale, search, skills]);

  const tree = useMemo(
    () => buildSkillCatalogTree(filteredSkills),
    [filteredSkills],
  );
  const filterOptions = useMemo(
    () => buildSkillCatalogFilterOptions(skills),
    [skills],
  );

  const selectedSkill = useMemo(() => {
    if (!selectedSkillId) return null;
    return filteredSkills.find((skill) => skill.id === selectedSkillId) ?? null;
  }, [filteredSkills, selectedSkillId]);

  useEffect(() => {
    if (selectedSkillId && filteredSkills.some((skill) => skill.id === selectedSkillId)) return;
    if (selectedSkillId) setSelectedSkillId(null);
  }, [filteredSkills, selectedSkillId]);

  return (
    <section
      className="integrations-skills-tree"
      aria-labelledby="integration-skills-title"
    >
      <header className="integrations-skills-tree__head">
        <div>
          <p className="integrations-view__coming-kicker">{t('integrations.tabLabel.skills')}</p>
          <h2 id="integration-skills-title">{t('integrations.skillsTitle')}</h2>
        </div>
        <div className="integrations-skills-tree__tools">
          <div className="integrations-skills-tree__view-toggle" aria-label={t('integrations.skillsViewMode')}>
            <button
              type="button"
              className={viewMode === 'tree' ? 'is-active' : ''}
              onClick={() => setViewMode('tree')}
            >
              {t('integrations.skillsTreeView')}
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              onClick={() => setViewMode('list')}
            >
              {t('integrations.skillsListView')}
            </button>
          </div>
          <label className="integrations-skills-tree__search">
            <Icon name="search" size={13} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('integrations.skillsSearch')}
            />
          </label>
        </div>
      </header>
      <div className="integrations-skills-tree__summary">
        <p>
          {t('integrations.skillsBody')}
        </p>
        <span>{tree.total}</span>
      </div>
      <SkillCatalogFiltersBar
        filters={filters}
        options={filterOptions}
        onChange={setFilters}
      />
      {loading ? (
        <div className="integrations-skills-tree__empty">
          {t('integrations.skillsLoading')}
        </div>
      ) : loadError ? (
        <div className="integrations-skills-tree__empty">
          {t('integrations.skillsLoadFailed')}
        </div>
      ) : tree.total === 0 ? (
        <div className="integrations-skills-tree__empty">
          {t('integrations.skillsNoFilterResults')}
        </div>
      ) : viewMode === 'list' ? (
        <SkillListView
          skills={filteredSkills}
          selectedSkill={selectedSkill}
          selectedSkillId={selectedSkillId}
          onSelectSkill={setSelectedSkillId}
        />
      ) : (
        <SkillTreeGraph
          tree={tree}
          selectedSkillId={selectedSkillId}
          selectedSkill={selectedSkill}
          onSelectSkill={setSelectedSkillId}
        />
      )}
    </section>
  );
}

type SkillCatalogViewMode = 'tree' | 'list';
type SkillDesignSystemFilter = 'all' | 'required' | 'optional';

interface SkillCatalogFilters {
  mode: string;
  scenario: string;
  category: string;
  platform: string;
  previewType: string;
  designSystem: SkillDesignSystemFilter;
}

const DEFAULT_SKILL_CATALOG_FILTERS: SkillCatalogFilters = {
  mode: 'all',
  scenario: 'all',
  category: 'all',
  platform: 'all',
  previewType: 'all',
  designSystem: 'all',
};

interface SkillCatalogFilterOption {
  id: string;
  label: string;
  count: number;
}

interface SkillCatalogFilterOptions {
  modes: SkillCatalogFilterOption[];
  scenarios: SkillCatalogFilterOption[];
  categories: SkillCatalogFilterOption[];
  platforms: SkillCatalogFilterOption[];
  previewTypes: SkillCatalogFilterOption[];
}

function SkillCatalogFiltersBar({
  filters,
  options,
  onChange,
}: {
  filters: SkillCatalogFilters;
  options: SkillCatalogFilterOptions;
  onChange: (filters: SkillCatalogFilters) => void;
}) {
  const t = useT();

  const update = <K extends keyof SkillCatalogFilters>(key: K, value: SkillCatalogFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="integrations-skills-tree__filters" aria-label={t('integrations.skillsFilters')}>
      <SkillCatalogSelect
        label={t('integrations.skillsFilterMode')}
        value={filters.mode}
        options={options.modes}
        onChange={(value) => update('mode', value)}
      />
      <SkillCatalogSelect
        label={t('integrations.skillsFilterScenario')}
        value={filters.scenario}
        options={options.scenarios}
        onChange={(value) => update('scenario', value)}
      />
      <SkillCatalogSelect
        label={t('integrations.skillsFilterCategory')}
        value={filters.category}
        options={options.categories}
        onChange={(value) => update('category', value)}
      />
      <SkillCatalogSelect
        label={t('integrations.skillsFilterPlatform')}
        value={filters.platform}
        options={options.platforms}
        onChange={(value) => update('platform', value)}
      />
      <SkillCatalogSelect
        label={t('integrations.skillsFilterPreview')}
        value={filters.previewType}
        options={options.previewTypes}
        onChange={(value) => update('previewType', value)}
      />
      <label className="integrations-skills-tree__filter">
        <span>{t('integrations.skillsFilterDesignSystem')}</span>
        <select
          value={filters.designSystem}
          onChange={(event) => update('designSystem', event.target.value as SkillDesignSystemFilter)}
          data-testid="integrations-skill-filter-design-system"
        >
          <option value="all">{t('integrations.skillsFilterAll')}</option>
          <option value="required">{t('integrations.skillsTreeDesignSystemRequired')}</option>
          <option value="optional">{t('integrations.skillsTreeDesignSystemOptional')}</option>
        </select>
      </label>
    </div>
  );
}

function SkillCatalogSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SkillCatalogFilterOption[];
  onChange: (value: string) => void;
}) {
  const t = useT();

  return (
    <label className="integrations-skills-tree__filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">{t('integrations.skillsFilterAll')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function SkillListView({
  skills,
  selectedSkill,
  selectedSkillId,
  onSelectSkill,
}: {
  skills: SkillSummary[];
  selectedSkill: SkillSummary | null;
  selectedSkillId: string | null;
  onSelectSkill: (skillId: string) => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const selectedTreeSkill = selectedSkill
    ? skillSummaryToTreeSkill(selectedSkill)
    : null;

  return (
    <div className="integrations-skills-tree__grid">
      <div className="integrations-skills-tree__list" role="list">
        {skills.map((skill) => {
          const name = localizeSkillName(locale, skill) || skill.name || skill.id;
          const description = localizeSkillDescription(locale, skill);
          const isActive = skill.id === selectedSkillId;

          return (
            <button
              key={skill.id}
              type="button"
              className={`integrations-skills-tree__list-row${isActive ? ' is-active' : ''}`}
              onClick={() => onSelectSkill(skill.id)}
              aria-pressed={isActive}
              data-testid={`integrations-skill-list-row-${skill.id}`}
            >
              <span className="integrations-skills-tree__list-title">{name}</span>
              {description ? (
                <span className="integrations-skills-tree__list-description">{description}</span>
              ) : null}
              <span className="integrations-skills-tree__list-meta">
                <span>{skill.mode}</span>
                <span>{skillCatalogScenario(skill)}</span>
                {skill.category ? <span>{skill.category}</span> : null}
                {skill.platform ? <span>{skill.platform}</span> : null}
                <span>{skill.previewType}</span>
                <span>
                  {skill.designSystemRequired
                    ? t('integrations.skillsTreeDesignSystemRequired')
                    : t('integrations.skillsTreeDesignSystemOptional')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <SkillTreeInfoPanel skill={selectedTreeSkill} emptyLabel={t('integrations.skillsListEmpty')} />
    </div>
  );
}

interface SkillTreeGraphProps {
  tree: SkillCatalogTree;
  selectedSkillId: string | null;
  selectedSkill: SkillSummary | null;
  onSelectSkill: (skillId: string) => void;
}

function SkillTreeGraph({
  tree,
  selectedSkillId,
  selectedSkill,
  onSelectSkill,
}: SkillTreeGraphProps) {
  const t = useT();
  const { locale } = useI18n();
  const layout = useMemo(
    () => buildSkillTreeSvgLayout(tree, selectedSkillId, locale, {
      mode: t('integrations.skillsTreeGuideMode'),
      scenario: t('integrations.skillsTreeGuideScenario'),
      skill: t('integrations.skillsTreeGuideSkill'),
    }),
    [locale, selectedSkillId, t, tree],
  );
  const selectedTreeSkill = selectedSkill
    ? skillSummaryToTreeSkill(selectedSkill)
    : null;

  return (
    <div className="integrations-skills-tree__grid">
      <div className="integrations-skills-tree__canvas">
        <svg
          className="integrations-skills-tree__svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={t('integrations.skillsTreeView')}
          style={{ minWidth: layout.width }}
        >
          <defs>
            <filter id="integrations-skill-node-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {layout.guides.map((guide) => (
            <g key={guide.id} className="integrations-skills-tree__guide">
              <line x1={56} y1={guide.y} x2={layout.width - 24} y2={guide.y} />
              <text x={24} y={guide.y + 4}>{guide.label}</text>
            </g>
          ))}
          {layout.edges.map((edge) => (
            <g
              key={edge.id}
              className={`integrations-skills-tree__edge${edge.active ? ' is-active' : ''}`}
            >
              <path className="integrations-skills-tree__edge-aura" d={edge.d} />
              <path className="integrations-skills-tree__edge-base" d={edge.d} />
            </g>
          ))}
          {layout.nodes.map((node) => {
            const interactive = Boolean(node.skillId);
            return (
              <g
                key={node.id}
                className={`integrations-skills-tree__svg-node is-${node.kind}${interactive ? ' is-interactive' : ' is-branch'}${node.active ? ' is-active' : ''}${node.onPath ? ' is-on-path' : ''}`}
                transform={`translate(${node.x} ${node.y})`}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-pressed={interactive ? node.active : undefined}
                onClick={interactive ? () => onSelectSkill(node.skillId!) : undefined}
                onKeyDown={interactive ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onSelectSkill(node.skillId!);
                } : undefined}
                data-testid={node.kind === 'skill' ? `integrations-skill-node-${node.skillId}` : undefined}
              >
                <title>{node.title}</title>
                {node.active ? <circle className="integrations-skills-tree__svg-glow" r={node.radius + 14} /> : null}
                {interactive ? <circle className="integrations-skills-tree__svg-affordance" r={node.radius + 8} /> : null}
                {interactive && !node.active ? <circle className="integrations-skills-tree__svg-pulse" r={node.radius + 6} /> : null}
                <circle className="integrations-skills-tree__svg-core" r={node.radius} />
                {interactive ? (
                  <circle className="integrations-skills-tree__svg-ring" r={node.radius - 7} />
                ) : (
                  <circle className="integrations-skills-tree__svg-branch-ring" r={node.radius - 9} />
                )}
                <text className="integrations-skills-tree__svg-label" y={node.kind === 'skill' ? -3 : -5}>
                  {node.label}
                </text>
                <text className="integrations-skills-tree__svg-sub" y={node.kind === 'skill' ? 12 : 11}>
                  {node.subLabel}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="integrations-skills-tree__legend" aria-hidden>
          <span><i className="is-mode" /> {t('integrations.skillsTreeLegendMode')}</span>
          <span><i className="is-scenario" /> {t('integrations.skillsTreeLegendScenario')}</span>
          <span><i className="is-skill" /> {t('integrations.skillsTreeLegendSkill')}</span>
        </div>
      </div>
      <SkillTreeInfoPanel skill={selectedTreeSkill} emptyLabel={t('integrations.skillsTreeEmpty')} />
    </div>
  );
}

interface SkillTreeSvgNode {
  id: string;
  kind: 'mode' | 'scenario' | 'skill';
  x: number;
  y: number;
  radius: number;
  label: string;
  subLabel: string;
  title: string;
  skillId: string | null;
  active: boolean;
  onPath: boolean;
}

interface SkillTreeSvgEdge {
  id: string;
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

interface SkillTreeSvgGuide {
  id: string;
  label: string;
  y: number;
}

interface SkillTreeSvgLayout {
  width: number;
  height: number;
  nodes: SkillTreeSvgNode[];
  edges: SkillTreeSvgEdge[];
  guides: SkillTreeSvgGuide[];
}

function buildSkillTreeSvgLayout(
  tree: SkillCatalogTree,
  selectedSkillId: string | null,
  locale: ReturnType<typeof useI18n>['locale'],
  guideLabels: {
    mode: string;
    scenario: string;
    skill: string;
  },
): SkillTreeSvgLayout {
  const modeGap = 330;
  const modeStartX = 170;
  const modeY = 74;
  const scenarioStartY = 178;
  const scenarioGap = 118;
  const skillRowGap = 78;
  const skillColOffset = 74;
  const nodes: SkillTreeSvgNode[] = [];
  const edges: SkillTreeSvgEdge[] = [];
  let height = 620;

  tree.modes.forEach((mode, modeIndex) => {
    const modeX = modeStartX + modeIndex * modeGap;
    const modeContainsSelected = mode.scenarios.some((scenario) =>
      scenario.skills.some((skill) => skill.id === selectedSkillId),
    );

    nodes.push({
      id: `mode-${mode.id}`,
      kind: 'mode',
      x: modeX,
      y: modeY,
      radius: 34,
      label: truncateSvgLabel(mode.label, 10),
      subLabel: String(mode.count),
      title: `${mode.label} · ${mode.count}`,
      skillId: null,
      active: false,
      onPath: modeContainsSelected,
    });

    let cursorY = scenarioStartY;
    mode.scenarios.forEach((scenario, scenarioIndex) => {
      const scenarioContainsSelected = scenario.skills.some((skill) => skill.id === selectedSkillId);
      nodes.push({
        id: `scenario-${mode.id}-${scenario.id}`,
        kind: 'scenario',
        x: modeX,
        y: cursorY,
        radius: 27,
        label: truncateSvgLabel(scenario.label, 9),
        subLabel: String(scenario.count),
        title: `${mode.label} / ${scenario.label} · ${scenario.count}`,
        skillId: null,
        active: false,
        onPath: scenarioContainsSelected,
      });
      edges.push({
        id: `edge-${mode.id}-${scenario.id}`,
        d: skillTreeConnectorPath(modeX, modeY + 34, modeX, cursorY - 27),
        x1: modeX,
        y1: modeY + 34,
        x2: modeX,
        y2: cursorY - 27,
        active: scenarioContainsSelected,
      });

      scenario.skills.forEach((skill, skillIndex) => {
        const row = Math.floor(skillIndex / 2);
        const side = skillIndex % 2 === 0 ? -1 : 1;
        const skillX = modeX + side * skillColOffset;
        const skillY = cursorY + 72 + row * skillRowGap;
        const name = localizeSkillName(locale, skill.skill) || skill.id;
        const active = skill.id === selectedSkillId;
        nodes.push({
          id: `skill-${skill.id}`,
          kind: 'skill',
          x: skillX,
          y: skillY,
          radius: 27,
          label: truncateSvgLabel(name, 8),
          subLabel: skill.platform ?? skill.previewType,
          title: `${name} · ${skill.platform ?? skill.previewType}`,
          skillId: skill.id,
          active,
          onPath: active,
        });
        edges.push({
          id: `edge-${scenario.id}-${skill.id}`,
          d: skillTreeLeafConnectorPath(modeX, cursorY + 27, skillX, skillY, 27),
          x1: modeX,
          y1: cursorY + 27,
          x2: skillX,
          y2: skillY,
          active,
        });
      });

      const rows = Math.max(1, Math.ceil(scenario.skills.length / 2));
      cursorY += 72 + rows * skillRowGap + scenarioGap;
    });
    height = Math.max(height, cursorY + 40);
  });

  const width = Math.max(720, modeStartX + Math.max(0, tree.modes.length - 1) * modeGap + 190);

  return {
    width,
    height,
    nodes,
    edges,
    guides: [
      { id: 'mode', label: guideLabels.mode, y: modeY },
      { id: 'scenario', label: guideLabels.scenario, y: scenarioStartY },
      { id: 'skill', label: guideLabels.skill, y: scenarioStartY + 72 },
    ],
  };
}

function truncateSvgLabel(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;
}

function skillTreeConnectorPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  if (Math.abs(x2 - x1) < 1) {
    return `M ${x1} ${y1} V ${y2}`;
  }

  const direction = x2 > x1 ? 1 : -1;
  const distanceX = Math.abs(x2 - x1);
  const distanceY = Math.abs(y2 - y1);
  const corner = Math.min(18, distanceX / 2, distanceY / 2);
  const busY = y1 + Math.max(28, Math.min(64, distanceY * 0.48));
  const c1x = x1 + direction * corner;
  const c2x = x2 - direction * corner;
  const c2y = y2 - corner;

  return [
    `M ${x1} ${y1}`,
    `V ${busY - corner}`,
    `Q ${x1} ${busY} ${c1x} ${busY}`,
    `H ${c2x}`,
    `Q ${x2} ${busY} ${x2} ${busY + corner}`,
    `V ${c2y}`,
    `Q ${x2} ${y2} ${x2} ${y2}`,
  ].join(' ');
}

function skillTreeLeafConnectorPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  targetRadius: number,
): string {
  if (Math.abs(x2 - x1) < 1) {
    return `M ${x1} ${y1} V ${y2 - targetRadius}`;
  }

  const direction = x2 > x1 ? 1 : -1;
  const endX = x2 - direction * targetRadius;
  const distanceX = Math.abs(endX - x1);
  const distanceY = Math.abs(y2 - y1);
  const corner = Math.min(16, distanceX / 2, distanceY / 2);

  return [
    `M ${x1} ${y1}`,
    `V ${y2 - corner}`,
    `Q ${x1} ${y2} ${x1 + direction * corner} ${y2}`,
    `H ${endX}`,
  ].join(' ');
}

function SkillTreeInfoPanel({
  skill,
  emptyLabel,
}: {
  skill: SkillCatalogTreeSkill | null;
  emptyLabel: string;
}) {
  const t = useT();
  const { locale } = useI18n();

  if (!skill) {
    return (
      <aside className="integrations-skills-tree__detail is-empty">
        {emptyLabel}
      </aside>
    );
  }

  const name = localizeSkillName(locale, skill.skill) || skill.id;
  const description = localizeSkillDescription(locale, skill.skill);
  const prompt = localizeSkillPrompt(locale, skill.skill) || skill.examplePrompt;

  return (
    <aside className="integrations-skills-tree__detail" data-testid="integrations-skill-detail">
      <p className="integrations-skills-tree__detail-kicker">
        {skill.mode} / {skill.scenario}
      </p>
      <h3>{name}</h3>
      {description ? <p>{description}</p> : null}
      <dl>
        <div>
          <dt>{t('integrations.skillsTreePlatform')}</dt>
          <dd>{skill.platform ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('integrations.skillsTreePreviewType')}</dt>
          <dd>{skill.previewType}</dd>
        </div>
        <div>
          <dt>{t('integrations.skillsTreeDesignSystem')}</dt>
          <dd>
            {skill.designSystemRequired
              ? t('integrations.skillsTreeDesignSystemRequired')
              : t('integrations.skillsTreeDesignSystemOptional')}
          </dd>
        </div>
        <div>
          <dt>{t('integrations.skillsTreeSource')}</dt>
          <dd>{skill.source ?? 'built-in'}</dd>
        </div>
      </dl>
      {prompt ? (
        <div className="integrations-skills-tree__prompt">
          <span>{t('integrations.skillsTreeExamplePrompt')}</span>
          <p>{prompt}</p>
        </div>
      ) : null}
    </aside>
  );
}

function skillSummaryToTreeSkill(skill: SkillSummary): SkillCatalogTreeSkill {
  return buildSkillCatalogTree([skill]).modes[0]!.scenarios[0]!.skills[0]!;
}

function skillCatalogScenario(skill: SkillSummary): string {
  return skill.scenario?.trim() || 'general';
}

function buildSkillCatalogFilterOptions(skills: SkillSummary[]): SkillCatalogFilterOptions {
  return {
    modes: buildSkillCatalogFacetOptions(skills.map((skill) => skill.mode)),
    scenarios: buildSkillCatalogFacetOptions(skills.map((skill) => skillCatalogScenario(skill))),
    categories: buildSkillCatalogFacetOptions(skills.map((skill) => skill.category)),
    platforms: buildSkillCatalogFacetOptions(skills.map((skill) => skill.platform)),
    previewTypes: buildSkillCatalogFacetOptions(skills.map((skill) => skill.previewType)),
  };
}

function buildSkillCatalogFacetOptions(values: Array<string | null | undefined>): SkillCatalogFilterOption[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const id = value?.trim();
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });

  return Array.from(counts, ([id, count]) => ({
    id,
    label: labelSkillCatalogFacet(id),
    count,
  })).sort((left, right) => {
    if (left.id === 'general') return -1;
    if (right.id === 'general') return 1;
    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
  });
}

function labelSkillCatalogFacet(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function integrationTabLabel(id: IntegrationTab, t: ReturnType<typeof useT>): string {
  switch (id) {
    case 'mcp': return t('integrations.tabLabel.mcp');
    case 'connectors': return t('entry.tabConnectors');
    case 'skills': return t('integrations.tabLabel.skills');
    case 'use-everywhere': return t('entry.useEverywhereTitle');
  }
}

function integrationTabHint(id: IntegrationTab, t: ReturnType<typeof useT>): string {
  switch (id) {
    case 'mcp': return t('integrations.tabHint.mcp');
    case 'connectors': return t('integrations.tabHint.connectors');
    case 'skills': return t('integrations.skillsTreeView');
    case 'use-everywhere': return t('integrations.tabHint.useEverywhere');
  }
}
