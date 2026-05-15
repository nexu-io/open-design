import { useEffect, useState } from 'react';
import type { AppConfig } from '../types';
import { ConnectorSection } from './SettingsDialog';
import { Icon } from './Icon';
import { McpClientSection } from './McpClientSection';
import { UseEverywhereGuidePanel } from './UseEverywhereModal';

export type IntegrationTab = 'mcp' | 'connectors' | 'skills' | 'use-everywhere';

interface Props {
  config: AppConfig;
  initialTab?: IntegrationTab;
  composioConfigLoading?: boolean;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
}

const INTEGRATION_TABS: ReadonlyArray<{
  id: IntegrationTab;
  label: string;
  hint: string;
}> = [
  {
    id: 'mcp',
    label: 'MCP',
    hint: 'External tools',
  },
  {
    id: 'connectors',
    label: 'Connectors',
    hint: 'Accounts and APIs',
  },
  {
    id: 'skills',
    label: 'Skills',
    hint: 'Coming soon',
  },
  {
    id: 'use-everywhere',
    label: 'Use everywhere',
    hint: 'CLI, HTTP, MCP',
  },
];

export function IntegrationsView({
  config,
  initialTab = 'mcp',
  composioConfigLoading = false,
  onPersistComposioKey,
}: Props) {
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
          <p className="integrations-view__kicker">Integration</p>
          <h1 id="integrations-title" className="entry-section__title">
            Integrations
          </h1>
          <p className="integrations-view__lede">
            Connect external systems, bring MCP tools into your agent loop, and
            use Open Design from other IDEs, scripts, and automations.
          </p>
        </div>
        <div className="integrations-view__badge" aria-hidden="true">
          <Icon name="link" size={15} />
          <span>Agent-ready</span>
        </div>
      </header>

      <nav
        className="integrations-view__tabs"
        role="tablist"
        aria-label="Integration areas"
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
              <span className="integrations-view__tab-label">{tab.label}</span>
              <span className="integrations-view__tab-hint">{tab.hint}</span>
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
  return (
    <section className="integrations-view__coming-soon" aria-labelledby="integration-skills-title">
      <div className="integrations-view__coming-icon" aria-hidden="true">
        <Icon name="sparkles" size={22} />
      </div>
      <div>
        <p className="integrations-view__coming-kicker">Coming soon</p>
        <h2 id="integration-skills-title">Skills integrations</h2>
        <p>
          Skill-level integration management is being carried over from another
          branch. This tab is reserved so MCP, Connectors, and future Skills
          setup live in the same Integration route.
        </p>
      </div>
    </section>
  );
}
