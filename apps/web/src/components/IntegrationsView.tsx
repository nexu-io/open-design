import { useEffect, useState } from 'react';
import type { AppConfig } from '../types';
import { ConnectorSection } from './SettingsDialog';
import { Icon } from './Icon';
import { McpClientSection } from './McpClientSection';
import { UseEverywhereGuidePanel } from './UseEverywhereModal';
import { useT } from '../i18n';

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

export function IntegrationsView({
  config,
  initialTab = 'mcp',
  composioConfigLoading = false,
  onPersistComposioKey,
}: Props) {
  const t = useT();
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
              onClick={() => setActiveTab(tab.id)}
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
          />
        ) : null}

        {activeTab === 'skills' ? <SkillsComingSoonPanel /> : null}

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

function SkillsComingSoonPanel() {
  const t = useT();
  return (
    <section className="integrations-view__coming-soon" aria-labelledby="integration-skills-title">
      <div className="integrations-view__coming-icon" aria-hidden="true">
        <Icon name="sparkles" size={22} />
      </div>
      <div>
        <p className="integrations-view__coming-kicker">{t('tasks.comingSoon')}</p>
        <h2 id="integration-skills-title">{t('integrations.skillsTitle')}</h2>
        <p>
          {t('integrations.skillsBody')}
        </p>
      </div>
    </section>
  );
}

function integrationTabLabel(id: IntegrationTab, t: ReturnType<typeof useT>): string {
  switch (id) {
    case 'mcp': return 'MCP';
    case 'connectors': return t('entry.tabConnectors');
    case 'skills': return t('homeHero.skills');
    case 'use-everywhere': return t('entry.useEverywhereTitle');
  }
}

function integrationTabHint(id: IntegrationTab, t: ReturnType<typeof useT>): string {
  switch (id) {
    case 'mcp': return t('integrations.tabHint.mcp');
    case 'connectors': return t('integrations.tabHint.connectors');
    case 'skills': return t('tasks.comingSoon');
    case 'use-everywhere': return 'CLI, HTTP, MCP';
  }
}
