// External MCP servers panel (orchestrator).
//
// Open Design connects to the configured servers as a CLIENT and surfaces their
// tools to the underlying agent (Claude Code, Hermes, Kimi for v1). This file is
// the section shell: it composes the `features/mcp-client` slice (server-list +
// agent-support hooks, the picker, the row editor) and owns only the surface-
// scoped analytics dispatch and the imperative Save handle. Persistence flows
// through `providers/mcp` -> daemon `/api/mcp/servers`.
import { forwardRef, useImperativeHandle } from 'react';
import { useAnalytics } from '../analytics/provider';
import {
  trackIntegrationsMcpTabClick,
  trackSettingsExternalMcpClick,
} from '../analytics/events';
import type { TrackingExternalMcpElement } from '@open-design/contracts/analytics';
import {
  McpAgentSupportBanner,
  McpPickerPanel,
  McpServerRow,
  useWiredMcpAgents,
  useWiredMcpServers,
  type McpClientSectionHandle,
  type McpClientSectionProps,
} from '../features/mcp-client';
import { Icon } from './Icon';
import { useT } from '../i18n';

export type { McpClientSectionHandle } from '../features/mcp-client';

export const McpClientSection = forwardRef<McpClientSectionHandle, McpClientSectionProps>(
  function McpClientSection({ onServersChanged, onDirtyChange, surface = 'integrations' }, ref) {
    const t = useT();
    const analytics = useAnalytics();
    // Single dispatch point for every click in this section: routes to the
    // payload matching the surface the section is rendered on.
    const trackMcpClick = (
      element: TrackingExternalMcpElement,
      extra?: { template_id?: string },
    ) => {
      if (surface === 'settings') {
        trackSettingsExternalMcpClick(analytics.track, {
          page_name: 'settings',
          area: 'external_mcp',
          element,
          ...extra,
        });
      } else {
        trackIntegrationsMcpTabClick(analytics.track, {
          page_name: 'integrations',
          area: 'mcp_tab',
          element,
          ...extra,
        });
      }
    };

    const servers = useWiredMcpServers({ onServersChanged, onDirtyChange });
    const agents = useWiredMcpAgents();

    useImperativeHandle(
      ref,
      () => ({
        save: servers.save,
        hasDirty: () => servers.dirty,
      }),
      [servers.save, servers.dirty],
    );

    if (!servers.loaded) {
      return (
        <section className="settings-section">
          <div className="section-head">
            <div>
              <h3>{t('mcpClient.title')}</h3>
              <p className="hint">{t('common.loading')}</p>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="settings-section">
        <div className="section-head">
          <div>
            <h3>{t('mcpClient.title')}</h3>
            <p className="hint">{t('mcpClient.subtitle')}</p>
          </div>
          <button
            type="button"
            className="primary mcp-add-btn"
            onClick={() => {
              trackMcpClick('add_server');
              servers.togglePicker();
            }}
            aria-expanded={servers.pickerOpen}
          >
            <Icon name="sparkles" size={13} />
            <span>{t('mcpClient.addServer')}</span>
          </button>
        </div>

        <McpAgentSupportBanner agents={agents} />

        {servers.pickerOpen ? (
          <McpPickerPanel
            templates={servers.templates}
            query={servers.pickerQuery}
            onQueryChange={servers.setPickerQuery}
            onPick={(tpl) => {
              trackMcpClick('pick_template', { template_id: tpl.id.replace(/-/g, '_') });
              servers.addFromTemplate(tpl);
            }}
            onPickBlank={() => {
              trackMcpClick('pick_blank');
              servers.addBlank();
            }}
            onClose={servers.closePicker}
          />
        ) : null}

        {servers.error ? <div className="mcp-error">{servers.error}</div> : null}

        {servers.rows.length === 0 ? (
          <div className="empty-card">
            <strong>{t('mcpClient.emptyTitle')}</strong>
            <p className="hint">{t('mcpClient.emptyBody')}</p>
          </div>
        ) : (
          <div className="mcp-rows">
            {servers.rows.map((row, idx) => (
              <McpServerRow
                key={row._localId}
                row={row}
                idx={idx}
                total={servers.rows.length}
                template={
                  row.templateId
                    ? servers.templates.find((tpl) => tpl.id === row.templateId)
                    : undefined
                }
                onChange={(patch) => servers.updateRow(idx, patch)}
                onRemove={() => {
                  trackMcpClick(
                    'remove_server',
                    row.templateId
                      ? { template_id: row.templateId.replace(/-/g, '_') }
                      : undefined,
                  );
                  servers.removeRow(idx);
                }}
                onMoveUp={idx > 0 ? () => servers.moveRow(idx, -1) : undefined}
                onMoveDown={
                  idx < servers.rows.length - 1 ? () => servers.moveRow(idx, 1) : undefined
                }
              />
            ))}
          </div>
        )}

        <div className="mcp-foot">
          <button
            type="button"
            className="primary"
            onClick={() => {
              trackMcpClick('saved');
              void servers.save();
            }}
            disabled={servers.saving || !servers.dirty}
          >
            {servers.saving
              ? t('settings.autosaveSaving')
              : servers.dirty
                ? t('mcpClient.saveChanges')
                : t('settings.autosaveSaved')}
          </button>
          {servers.savedAt && !servers.dirty ? (
            <span className="hint mcp-saved-msg">{t('settings.connectorsSaved')}.</span>
          ) : null}
          <span className="mcp-foot-spacer" />
          <span className="hint">
            {t('mcpClient.storedAt')} <code>.od/mcp-config.json</code>
          </span>
        </div>
      </section>
    );
  },
);
