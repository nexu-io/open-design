// External MCP servers panel.
//
// Open Design connects to the configured servers as a CLIENT and surfaces
// their tools to the underlying agent (Claude Code, Hermes, Kimi for v1).
// This panel is the user-facing form; persistence flows through
// `state/mcp.ts` -> daemon `/api/mcp/servers`.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@open-design/components';
import { useAnalytics } from '../analytics/provider';
import {
  trackIntegrationsMcpTabClick,
  trackSettingsExternalMcpClick,
} from '../analytics/events';
import type { TrackingExternalMcpElement } from '@open-design/contracts/analytics';
import {
  disconnectMcpOAuth,
  fetchMcpOAuthStatus,
  fetchMcpServers,
  saveMcpServers,
  startMcpOAuth,
  suggestMcpServerId,
} from '../state/mcp';
import type {
  McpOAuthStatusResponse,
  McpServerConfig,
  McpTemplate,
} from '../state/mcp';
import { fetchAgents } from '../providers/registry';
import type { AgentInfo } from '../types';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';
import { Icon } from './Icon';
import { useT } from '../i18n';

type Translate = ReturnType<typeof useT>;

interface Props {
  // Receive a notification when servers list changes so the parent can
  // re-render dependent affordances (e.g. composer chip count). Optional.
  onServersChanged?: (servers: McpServerConfig[]) => void;
  // Surface the dirty/save state up to the dialog footer so a single
  // "Save" button can drive both the global config and this section.
  onDirtyChange?: (dirty: boolean) => void;
  // This section renders on two surfaces: the Integrations MCP tab and the
  // Settings -> External MCP panel. Defaults to 'integrations' so the
  // IntegrationsView call site stays unchanged.
  surface?: 'integrations' | 'settings';
}

// Imperative handle: lets the dialog footer Save button trigger this
// section's save without us having to lift the entire row state up.
export interface McpClientSectionHandle {
  save: () => Promise<boolean>;
  hasDirty: () => boolean;
}

interface DraftRow extends McpServerConfig {
  // Local-only flags. Stripped before sending to the daemon.
  _isNew?: boolean;
  // Free-form text for the env / headers panel — committed back to a real
  // map when the user steps away from the field.
  _envText?: string;
  _headersText?: string;
  // Per-instance local id to use as a stable React `key` independent of
  // the editable `id` field (avoids remounts & focus loss while editing).
  _localId: string;
}

// Simple incrementing local id generator for row keys. Kept module-scoped
// and deterministic for the lifetime of this UI instance.
let NEXT_LOCAL_ID = 1;
function genLocalId(): string {
  return `mcp-row-${NEXT_LOCAL_ID++}`;
}

function isLoopbackMcpUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const host = new URL(rawUrl)
      .hostname
      .replace(/^\[|\]$/g, '')
      .toLowerCase()
      .replace(/\.+$/g, '');
    if (host === 'localhost' || host === '::1') return true;
    if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
    return /^::ffff:127(?:\.\d{1,3}){3}$/i.test(host);
  } catch {
    return false;
  }
}

function inferMcpAuthMode(url: string | undefined): NonNullable<McpServerConfig['authMode']> {
  return isLoopbackMcpUrl(url) ? 'none' : 'oauth';
}

function effectiveMcpAuthMode(
  row: Pick<McpServerConfig, 'transport' | 'url' | 'authMode'>,
): NonNullable<McpServerConfig['authMode']> {
  if (row.transport !== 'http' && row.transport !== 'sse') return 'none';
  return row.authMode ?? inferMcpAuthMode(row.url);
}

function authModeAfterUrlChange(
  row: Pick<McpServerConfig, 'url' | 'authMode'>,
  nextUrl: string,
): NonNullable<McpServerConfig['authMode']> {
  const previousInferred = inferMcpAuthMode(row.url);
  if (!row.authMode || row.authMode === previousInferred) {
    return inferMcpAuthMode(nextUrl);
  }
  return row.authMode;
}

function rowsFromServers(servers: McpServerConfig[]): DraftRow[] {
  return servers.map((s) => ({
    ...s,
    ...(s.transport === 'http' || s.transport === 'sse'
      ? { authMode: effectiveMcpAuthMode(s) }
      : {}),
    _envText: s.env ? mapToText(s.env) : '',
    _headersText: s.headers ? mapToText(s.headers) : '',
    _localId: genLocalId(),
  }));
}

function mapToText(m: Record<string, string>): string {
  return Object.entries(m)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function textToMap(text: string | undefined): Record<string, string> | undefined {
  if (!text) return undefined;
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rowsToServers(rows: DraftRow[]): McpServerConfig[] {
  return rows.map((r) => {
    const out: McpServerConfig = {
      id: r.id,
      transport: r.transport,
      enabled: r.enabled,
    };
    if (r.label) out.label = r.label;
    if (r.templateId) out.templateId = r.templateId;
    if (r.transport === 'stdio') {
      if (r.command) out.command = r.command;
      if (r.args && r.args.length > 0) out.args = r.args;
      const env = textToMap(r._envText);
      if (env) out.env = env;
    } else {
      out.authMode = effectiveMcpAuthMode(r);
      if (r.url) out.url = r.url;
      const headers = textToMap(r._headersText);
      if (headers) out.headers = headers;
    }
    return out;
  });
}

function rowFromTemplate(
  tpl: McpTemplate,
  taken: ReadonlySet<string>,
): DraftRow {
  const id = suggestMcpServerId(tpl.id, taken);
  const env: Record<string, string> = {};
  for (const f of tpl.envFields ?? []) env[f.key] = '';
  const headers: Record<string, string> = {};
  for (const f of tpl.headerFields ?? []) headers[f.key] = '';
  return {
    id,
    label: tpl.label,
    templateId: tpl.id,
    transport: tpl.transport,
    enabled: true,
    ...(tpl.transport === 'http' || tpl.transport === 'sse'
      ? { authMode: tpl.authMode ?? inferMcpAuthMode(tpl.url) }
      : {}),
    command: tpl.command,
    args: tpl.args ? [...tpl.args] : undefined,
    url: tpl.url,
    _envText: Object.keys(env).length > 0 ? mapToText(env) : '',
    _headersText: Object.keys(headers).length > 0 ? mapToText(headers) : '',
    _isNew: true,
    _localId: genLocalId(),
  };
}

function rowFromBlank(taken: ReadonlySet<string>): DraftRow {
  return {
    id: suggestMcpServerId('custom', taken),
    label: '',
    transport: 'stdio',
    enabled: true,
    command: '',
    args: [],
    _envText: '',
    _headersText: '',
    _isNew: true,
    _localId: genLocalId(),
  };
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

// Picker grouping. Mirrors `McpTemplateCategory` in `packages/contracts`.
// The order here is the *display* order in the picker — keep it intentional
// so the most useful categories for Open Design (visual generation, then
// editing, then publishing surfaces) sit at the top.
function categoryOrder(t: Translate): ReadonlyArray<{
  id: NonNullable<McpTemplate['category']>;
  label: string;
  hint: string;
}> {
  return [
    {
      id: 'image-generation',
      label: t('mcp.categoryImageGeneration'),
      hint: t('mcp.categoryImageGenerationHint'),
    },
    {
      id: 'image-editing',
      label: t('mcp.categoryImageEditing'),
      hint: t('mcp.categoryImageEditingHint'),
    },
    {
      id: 'web-capture',
      label: t('mcp.categoryWebCapture'),
      hint: t('mcp.categoryWebCaptureHint'),
    },
    {
      id: 'design-systems',
      label: t('mcp.categoryDesignSystems'),
      hint: t('mcp.categoryDesignSystemsHint'),
    },
    {
      id: 'ui-components',
      label: t('mcp.categoryUiComponents'),
      hint: t('mcp.categoryUiComponentsHint'),
    },
    {
      id: 'data-viz',
      label: t('mcp.categoryDataViz'),
      hint: t('mcp.categoryDataVizHint'),
    },
    {
      id: 'publishing',
      label: t('mcp.categoryPublishing'),
      hint: t('mcp.categoryPublishingHint'),
    },
    {
      id: 'utilities',
      label: t('mcp.categoryUtilities'),
      hint: t('mcp.categoryUtilitiesHint'),
    },
  ];
}

function templateMatchesQuery(tpl: McpTemplate, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    tpl.label.toLowerCase().includes(needle) ||
    tpl.id.toLowerCase().includes(needle) ||
    (tpl.description?.toLowerCase().includes(needle) ?? false) ||
    (tpl.example?.toLowerCase().includes(needle) ?? false)
  );
}

function validateRow(r: DraftRow, t: Translate): string | null {
  if (!ID_PATTERN.test(r.id)) {
    return t('mcp.idInvalid');
  }
  if (r.transport === 'stdio') {
    if (!r.command || !r.command.trim()) return t('mcp.commandRequired');
  } else {
    if (!r.url || !r.url.trim()) return t('mcp.urlRequired');
    try {
      const parsed = new URL(r.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return t('mcp.urlProtocolInvalid');
      }
    } catch {
      return t('mcp.urlMalformed');
    }
  }
  return null;
}

// Stable signature used to detect dirty state — cheap diff against the
// last-known-saved server list. Avoids a deep equality library.
function signature(rows: DraftRow[]): string {
  return JSON.stringify(rowsToServers(rows));
}

export const McpClientSection = forwardRef<McpClientSectionHandle, Props>(
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
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [savedSig, setSavedSig] = useState<string>('[]');
  const [templates, setTemplates] = useState<McpTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Free-text filter at the top of the picker. Empty string = show all.
  // Lives in the section (not the picker render block) so toggling the
  // picker preserves the user's last query while they scan through it.
  const [pickerQuery, setPickerQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Cached agent list so the support banner can tell the user which of the
  // installed CLI agents will actually receive the MCP servers below.
  // Without this, OpenCode / Codex / Gemini users save a server and have
  // no way to learn it never reached the agent (issue #2142).
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchMcpServers();
      if (cancelled) return;
      if (!data) {
        setError(t('mcpClient.daemonError'));
        setLoaded(true);
        return;
      }
      const fresh = rowsFromServers(data.servers);
      setRows(fresh);
      setSavedSig(signature(fresh));
      setTemplates(data.templates);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchAgents();
      if (cancelled) return;
      setAgents(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => signature(rows) !== savedSig, [rows, savedSig]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const updateRow = (idx: number, patch: Partial<DraftRow>) => {
    setRows((curr) => curr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((curr) => curr.filter((_, i) => i !== idx));
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    setRows((curr) => {
      const next = [...curr];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return curr;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  };

  const addFromTemplate = (tpl: McpTemplate) => {
    trackMcpClick('pick_template', { template_id: tpl.id.replace(/-/g, '_') });
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromTemplate(tpl, new Set(curr.map((r) => r.id)))]);
  };

  const addBlank = () => {
    trackMcpClick('pick_blank');
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromBlank(new Set(curr.map((r) => r.id)))]);
  };

  const save = async (): Promise<boolean> => {
    for (const r of rows) {
      const err = validateRow(r, t);
      if (err) {
        setError(`${r.label || r.id}: ${err}`);
        return false;
      }
    }
    setError(null);
    setSaving(true);
    const payload = rowsToServers(rows);
    const data = await saveMcpServers(payload);
    setSaving(false);
    if (!data) {
      setError(t('mcpClient.saveFailed'));
      return false;
    }
    const fresh = rowsFromServers(data.servers);
    setRows(fresh);
    setSavedSig(signature(fresh));
    setTemplates(data.templates);
    setSavedAt(Date.now());
    onServersChanged?.(data.servers);
    return true;
  };

  useImperativeHandle(ref, () => ({
    save,
    hasDirty: () => dirty,
  }), [save, dirty]);

  if (!loaded) {
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
            setPickerOpen((v) => !v);
          }}
          aria-expanded={pickerOpen}
        >
          <Icon name="sparkles" size={14} />
          <span>{t('mcpClient.addServer')}</span>
        </button>
      </div>

      <McpAgentSupportBanner agents={agents} />

      {pickerOpen ? (
        <PickerPanel
          templates={templates}
          query={pickerQuery}
          onQueryChange={setPickerQuery}
          onPick={addFromTemplate}
          onPickBlank={addBlank}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {error ? (
        <div className="mcp-error">{error}</div>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty-card">
          <strong>{t('mcpClient.emptyTitle')}</strong>
          <p className="hint">
            {t('mcpClient.emptyBody')}
          </p>
        </div>
      ) : (
        <div className="mcp-rows">
          {rows.map((row, idx) => (
            <McpRow
              key={row._localId}
              row={row}
              idx={idx}
              total={rows.length}
              template={
                row.templateId
                  ? templates.find((tpl) => tpl.id === row.templateId)
                  : undefined
              }
              onChange={(patch) => updateRow(idx, patch)}
              onRemove={() => {
                trackMcpClick(
                  'remove_server',
                  row.templateId
                    ? { template_id: row.templateId.replace(/-/g, '_') }
                    : undefined,
                );
                removeRow(idx);
              }}
              onMoveUp={idx > 0 ? () => moveRow(idx, -1) : undefined}
              onMoveDown={idx < rows.length - 1 ? () => moveRow(idx, 1) : undefined}
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
            void save();
          }}
          disabled={saving || !dirty}
        >
          {saving ? t('settings.autosaveSaving') : dirty ? t('mcpClient.saveChanges') : t('settings.autosaveSaved')}
        </button>
        {savedAt && !dirty ? (
          <span className="hint mcp-saved-msg">{t('settings.connectorsSaved')}.</span>
        ) : null}
        <span className="mcp-foot-spacer" />
        <span className="hint">
          {t('mcpClient.storedAt')} <code>.od/mcp-config.json</code>
        </span>
      </div>
    </section>
  );
});

interface PickerPanelProps {
  templates: McpTemplate[];
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (tpl: McpTemplate) => void;
  onPickBlank: () => void;
  onClose: () => void;
}

/**
 * The "Add server" picker, broken out so we can give it categorized
 * `<details>` groups, an inline filter and a sticky close affordance.
 *
 * UX rules:
 *  - Groups are collapsed by default once the catalog crosses ~12 entries
 *    so the picker fits in a normal viewport. We pre-expand all groups
 *    when the user types a search so matches are immediately visible.
 *  - Groups with zero matching templates are hidden entirely while a
 *    search is active to avoid a wall of empty headers.
 *  - "Custom server" lives in its own footer card pinned below the groups
 *    so users can always reach it even after scrolling through templates.
 */
function PickerPanel({
  templates,
  query,
  onQueryChange,
  onPick,
  onPickBlank,
  onClose,
}: PickerPanelProps) {
  const t = useT();
  const grouped = useMemo(() => {
    const buckets = new Map<McpTemplate['category'], McpTemplate[]>();
    for (const tpl of templates) {
      const list = buckets.get(tpl.category) ?? [];
      list.push(tpl);
      buckets.set(tpl.category, list);
    }
    return buckets;
  }, [templates]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  // Total visible across all groups so we can show an empty-state if the
  // search filters everything out.
  let visibleTotal = 0;
  const renderGroups = categoryOrder(t).map((cat) => {
    const all = grouped.get(cat.id) ?? [];
    const matched = all.filter((item) => templateMatchesQuery(item, trimmed));
    visibleTotal += matched.length;
    if (all.length === 0) return null;
    if (hasQuery && matched.length === 0) return null;
    // Default-expanded for the first three groups (the visual-asset
    // pipeline most users will land here for); collapsed otherwise.
    // Active query forces every visible group open so matches surface
    // without an extra click.
    const defaultOpen =
      hasQuery ||
      cat.id === 'image-generation' ||
      cat.id === 'image-editing' ||
      cat.id === 'web-capture';
    return (
      <details
        key={cat.id}
        className="mcp-picker-group"
        open={defaultOpen}
      >
        <summary className="mcp-picker-group-summary">
          <span className="mcp-picker-group-summary-title">{cat.label}</span>
          <span className="mcp-picker-group-summary-count">
            {hasQuery ? `${matched.length}/${all.length}` : all.length}
          </span>
          <span className="mcp-picker-group-summary-hint">{cat.hint}</span>
        </summary>
        <div className="mcp-picker-grid">
          {matched.map((tpl) => (
            <PickerCard key={tpl.id} tpl={tpl} onPick={() => onPick(tpl)} />
          ))}
        </div>
      </details>
    );
  });

  return (
    <div className="mcp-picker">
      <div className="mcp-picker-head">
        <div className="mcp-picker-head-row">
          <strong>{t('mcp.pickTemplate')}</strong>
          <button
            type="button"
            className="icon-btn mcp-picker-close"
            onClick={onClose}
            title={t('mcp.closePicker')}
            aria-label={t('mcp.closePicker')}
          >
            ×
          </button>
        </div>
        <span className="hint">
          {t('mcp.pickerHint')}
        </span>
        <input
          type="search"
          className="mcp-picker-search"
          placeholder={t('mcp.pickerFilterPlaceholder')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          spellCheck={false}
          autoFocus
        />
      </div>

      <div className="mcp-picker-groups">
        {renderGroups}
        {hasQuery && visibleTotal === 0 ? (
          <div className="mcp-picker-empty hint">
            {t('mcp.pickerNoMatch', { query: trimmed })}
          </div>
        ) : null}
      </div>

      <div className="mcp-picker-foot">
        <button
          type="button"
          className="mcp-picker-item mcp-picker-item-action mcp-picker-custom"
          onClick={onPickBlank}
        >
          <span className="mcp-picker-item-head">
            <Icon name="settings" size={14} />
            <strong>{t('mcp.customServer')}</strong>
          </span>
          <span className="mcp-picker-desc">
            {t('mcp.customServerDesc')}
          </span>
        </button>
      </div>
    </div>
  );
}

function PickerCard({
  tpl,
  onPick,
}: {
  tpl: McpTemplate;
  onPick: () => void;
}) {
  const t = useT();
  return (
    <div className="mcp-picker-item">
      <button
        type="button"
        className="mcp-picker-item-action"
        onClick={onPick}
        title={tpl.description}
      >
        <span className="mcp-picker-item-head">
          <Icon name="link" size={14} />
          <strong>{tpl.label}</strong>
          <span className="mcp-picker-transport">{tpl.transport}</span>
        </span>
        <span className="mcp-picker-desc">{tpl.description}</span>
        {tpl.example ? (
          <span className="mcp-picker-example">
            <span className="mcp-picker-example-label">{t('mcp.tryLabel')}</span>
            <span className="mcp-picker-example-text">"{tpl.example}"</span>
          </span>
        ) : null}
      </button>
      {tpl.homepage ? (
        <a
          className="mcp-picker-homepage"
          href={tpl.homepage}
          target="_blank"
          rel="noreferrer noopener"
          title={tpl.homepage}
        >
          <Icon name="external-link" size={14} />
          <span>{t('mcp.homepage')}</span>
        </a>
      ) : null}
    </div>
  );
}

interface RowProps {
  row: DraftRow;
  idx: number;
  total: number;
  // The original built-in template this row was instantiated from, when the
  // user picked a preset. Lets us surface description / homepage / example
  // hints inline so the saved row isn't a wall of opaque form fields.
  template?: McpTemplate;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function McpRow({ row, idx, total, template, onChange, onRemove, onMoveUp, onMoveDown }: RowProps) {
  const t = useT();
  const isHttpLike = row.transport === 'http' || row.transport === 'sse';
  const usesManagedOAuth = isHttpLike && effectiveMcpAuthMode(row) === 'oauth';
  const [expanded, setExpanded] = useState<boolean>(false);
  const summaryTitle = row.label?.trim() || row.id || t('mcp.unnamedServer');
  const [showMcpExample, setShowMcpExample] = useState<boolean>(false);
  const helperId = `mcp-json-helper-panel-${row._localId}`;

  return (
    <div
      className={`mcp-row${row.enabled ? '' : ' mcp-row-disabled'}${
        expanded ? ' mcp-row-expanded' : ''
      }`}
    >
      <div className="mcp-row-head">
        <label className="mcp-row-toggle" title={row.enabled ? t('mcp.enabled') : t('mcp.disabled')}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            aria-label={t('mcp.enableServerAria')}
          />
        </label>
        {expanded ? (
          <input
            type="text"
            className="mcp-row-label"
            value={row.label ?? ''}
            placeholder={t('mcp.displayNamePlaceholder')}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        ) : (
          <button
            type="button"
            className="mcp-row-summary-title"
            onClick={() => setExpanded(true)}
            title={t('mcp.expandToEdit')}
          >
            <span className="mcp-row-summary-name">{summaryTitle}</span>
            <span
              className="mcp-row-summary-transport"
              aria-label={t('mcp.transportAria', { transport: row.transport })}
            >
              {row.transport}
            </span>
          </button>
        )}
        <span className="mcp-row-counter hint">
          {idx + 1} / {total}
        </span>
        <div className="mcp-row-actions">
          {onMoveUp ? (
            <Button size="icon" onClick={onMoveUp} title={t('mcp.moveUp')}>
              ↑
            </Button>
          ) : null}
          {onMoveDown ? (
            <Button size="icon" onClick={onMoveDown} title={t('mcp.moveDown')}>
              ↓
            </Button>
          ) : null}
          <Button
            size="icon"
            onClick={onRemove}
            title={t('mcp.removeServer')}
          >
            ×
          </Button>
          <Button
            size="icon"
            className="mcp-row-toggle-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? t('mcp.collapseServerAria') : t('mcp.expandServerAria')}
            title={expanded ? t('mcp.collapse') : t('mcp.expand')}
          >
            <Icon name="chevron-down" size={14} />
          </Button>
        </div>
      </div>

      {expanded ? (
        <>
          {template ? (
            <details className="mcp-row-info">
              <summary className="mcp-row-info-summary">
                <span className="mcp-row-info-summary-label">
                  {t('mcp.aboutTemplate', { name: template.label })}
                </span>
                {template.homepage ? (
                  <a
                    className="mcp-row-info-link"
                    href={template.homepage}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={template.homepage}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Icon name="external-link" size={14} />
                    <span>{t('mcp.homepage')}</span>
                  </a>
                ) : null}
              </summary>
              <div className="mcp-row-info-body">
                {template.description ? (
                  <p className="mcp-row-info-desc hint">{template.description}</p>
                ) : null}
                {template.example ? (
                  <p
                    className="mcp-row-info-example"
                    title={t('mcp.tryPromptTitle')}
                  >
                    <span className="mcp-row-info-example-label">{t('mcp.tryLabel')}</span>{' '}
                    <span className="mcp-row-info-example-text">"{template.example}"</span>
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}

          {isHttpLike && !row._isNew && row.id ? (
            usesManagedOAuth ? (
              <McpOAuthControl serverId={row.id} />
            ) : (
              <div className="mcp-oauth-hint hint">
                <strong>{t('mcp.noManagedOAuth')}</strong>{' '}
                {t('mcp.noManagedOAuthUseAsConfigured')}
              </div>
            )
          ) : null}
          {isHttpLike && row._isNew && usesManagedOAuth ? (
            <div className="mcp-oauth-hint hint">
              {t('mcp.saveFirstThenClick')}{' '}
              <strong>{t('mcp.connect')}</strong>{' '}
              {t('mcp.toGrantOAuthAccess')}
            </div>
          ) : null}
          {isHttpLike && row._isNew && !usesManagedOAuth ? (
            <div className="mcp-oauth-hint hint">
              <strong>{t('mcp.noManagedOAuth')}</strong>{' '}
              {t('mcp.noManagedOAuthSaveDirect')}
            </div>
          ) : null}

          <div className="mcp-row-grid">
            <label className="mcp-row-field">
              <span className="mcp-row-field-label">{t('mcp.fieldId')}</span>
              <input
                type="text"
                value={row.id}
                onChange={(e) => onChange({ id: e.target.value })}
                spellCheck={false}
              />
            </label>
            <label className="mcp-row-field">
              <span className="mcp-row-field-label">{t('mcp.fieldTransport')}</span>
              <select
                value={row.transport}
                onChange={(e) => {
                  const transport = e.target.value as DraftRow['transport'];
                  onChange({
                    transport,
                    ...(transport === 'http' || transport === 'sse'
                      ? { authMode: row.authMode ?? inferMcpAuthMode(row.url) }
                      : { authMode: undefined }),
                  });
                }}
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="http">streamable HTTP</option>
              </select>
            </label>
          </div>

          {row.transport === 'stdio' ? (
            <>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('mcp.fieldCommand')}</span>
                <input
                  type="text"
                  value={row.command ?? ''}
                  placeholder={t('mcp.commandPlaceholder')}
                  onChange={(e) => onChange({ command: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('mcp.fieldArgs')}</span>
                <input
                  type="text"
                  value={(row.args ?? []).join(' ')}
                  placeholder={t('mcp.argsPlaceholder')}
                  onChange={(e) =>
                    onChange({
                      args: e.target.value
                        .split(/\s+/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('mcp.fieldEnv')}</span>
                <textarea
                  rows={Math.max(2, (row._envText ?? '').split('\n').length)}
                  value={row._envText ?? ''}
                  placeholder="GITHUB_TOKEN=ghp_…"
                  onChange={(e) => onChange({ _envText: e.target.value })}
                  spellCheck={false}
                />
              </label>
            </>
          ) : (
            <>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('mcp.fieldOAuthMode')}</span>
                <select
                  value={effectiveMcpAuthMode(row)}
                  onChange={(e) =>
                    onChange({
                      authMode: e.target.value as NonNullable<McpServerConfig['authMode']>,
                    })
                  }
                >
                  <option value="none">{t('mcp.authModeNone')}</option>
                  <option value="oauth">{t('mcp.authModeOAuth')}</option>
                </select>
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('mcp.fieldUrl')}</span>
                <input
                  type="text"
                  value={row.url ?? ''}
                  placeholder="https://mcp.higgsfield.ai/mcp"
                  onChange={(e) => {
                    const url = e.target.value;
                    onChange({ url, authMode: authModeAfterUrlChange(row, url) });
                  }}
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('mcp.fieldHeaders')}</span>
                <textarea
                  rows={Math.max(2, (row._headersText ?? '').split('\n').length)}
                  value={row._headersText ?? ''}
                  placeholder="Authorization=Bearer …"
                  onChange={(e) => onChange({ _headersText: e.target.value })}
                  spellCheck={false}
                />
              </label>
            </>
          )}

          <div className={`mcp-json-helper ${showMcpExample ? 'is-open' : ''}`}>
            <button
              type="button"
              className="mcp-json-helper-toggle"
              aria-expanded={showMcpExample}
              aria-controls={helperId}
              onClick={() => setShowMcpExample((prev) => !prev)}
            >
              <span className="mcp-json-helper-toggle-content">
                <span className="mcp-json-helper-eye">
                  <Icon name="eye" />
                </span>
                <span className="mcp-json-helper-toggle-text">
                  {t('mcp.jsonHelperToggle')}
                </span>
              </span>
              <span className="mcp-json-helper-toggle-icon">
                {showMcpExample ? (
                  <Icon name="arrow-up" />
                ) : (
                  <Icon name="chevron-down" />
                )}
              </span>
            </button>

            {showMcpExample && (
              <div className="mcp-json-helper-example" id={helperId}>
                <div className="mcp-json-helper-example-head">
                  {t('mcp.jsonHelperExampleHead')}
                </div>
                <pre className="mcp-json-helper-code">
                  <code>
                    <span className="json-punctuation">{"{"}</span>
                    {"\n  "}
                    <span className="json-key">"mcpServers"</span>
                    <span className="json-punctuation">: {"{"}</span>
                    {"\n    "}
                    <span className="json-key">"tdesign"</span>
                    <span className="json-punctuation">: {"{"}</span>
                    {"\n      "}
                    <span className="json-key">"command"</span>
                    <span className="json-punctuation">:</span>{" "}
                    <span className="json-string">"npx"</span>
                    <span className="json-punctuation">,</span>
                    {"\n      "}
                    <span className="json-key">"args"</span>
                    <span className="json-punctuation">: [</span>
                    <span className="json-string">"-y"</span>
                    <span className="json-punctuation">, </span>
                    <span className="json-string">"tdesign-mcp-server@latest"</span>
                    <span className="json-punctuation">],</span>
                    {"\n      "}
                    <span className="json-key">"env"</span>
                    <span className="json-punctuation">: {"{"}</span>
                    {"\n        "}
                    <span className="json-key">"API_KEY"</span>
                    <span className="json-punctuation">:</span>{" "}
                    <span className="json-string">"your-key-here"</span>
                    {"\n      "}
                    <span className="json-punctuation">{"}"}</span>
                    {"\n    "}
                    <span className="json-punctuation">{"}"}</span>
                    {"\n  "}
                    <span className="json-punctuation">{"}"}</span>
                    {"\n"}
                    <span className="json-punctuation">{"}"}</span>
                  </code>
                </pre>
                <div className="mcp-json-helper-conversion">
                  <div>
                    <strong>{t('mcp.fieldCommand')}</strong>
                    <code>npx</code>
                  </div>
                  <div>
                    <strong>{t('mcp.fieldArgs')}</strong>
                    <code>-y tdesign-mcp-server@latest</code>
                  </div>
                  <div>
                    <strong>{t('mcp.fieldEnvShort')}</strong>
                    <code>API_KEY = your-key-here</code>
                  </div>
                  <div>
                    <strong>HTTP / SSE</strong>
                    <code>{t('mcp.jsonHelperHttpNote')}</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * "Connect" / "Disconnect" panel for an HTTP/SSE MCP server.
 *
 * The OAuth flow is fully owned by the daemon — this component just kicks
 * it off (POST /api/mcp/oauth/start), opens the returned authorize URL in
 * a new tab, listens for the postMessage from the callback page, and
 * refreshes the local status badge. There's also a fallback poll every
 * 2 seconds while a connect is pending in case the callback page can't
 * reach back via postMessage (cross-origin tab opener edge cases).
 */
function McpOAuthControl({ serverId }: { serverId: string }) {
  const t = useT();
  const [status, setStatus] = useState<McpOAuthStatusResponse | null>(null);
  const [busy, setBusy] = useState<'idle' | 'starting' | 'awaiting' | 'disconnecting' | 'refreshing'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Holds the authorize URL while we are waiting on the user to complete
  // OAuth in their browser. Surfaced as a fallback `<a>` so the user can
  // re-open the tab if they accidentally closed it (or if the system
  // browser ate the popup-open call without giving us feedback).
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const data = await fetchMcpOAuthStatus(serverId);
    if (data) setStatus(data);
    return data;
  };

  useEffect(() => {
    void refresh();
  }, [serverId]);

  // Listen for the postMessage that the callback HTML page emits when the
  // OAuth flow completes. We accept messages from any origin because the
  // callback page is served by THIS daemon, but we still validate the
  // payload shape before reacting to it.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'mcp-oauth') return;
      if (data.serverId && data.serverId !== serverId) return;
      if (data.ok) {
        setError(null);
        setPendingAuthUrl(null);
        void refresh();
      } else if (typeof data.message === 'string') {
        setError(data.message);
      }
      setBusy('idle');
      stopPoll();
    }
    window.addEventListener('message', onMessage);
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('open-design-mcp-oauth');
      bc.onmessage = (ev) => onMessage(ev as MessageEvent);
    }
    return () => {
      window.removeEventListener('message', onMessage);
      if (bc) bc.close();
      stopPoll();
    };
  }, [serverId]);

  function stopPoll() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function startPoll() {
    stopPoll();
    let elapsed = 0;
    pollTimer.current = setInterval(() => {
      elapsed += 2000;
      void (async () => {
        const data = await refresh();
        // Auto-stop when the daemon reports connected — handles the
        // Electron / system-browser case where postMessage can never
        // reach back across processes, so polling IS the delivery
        // channel for "auth completed" events.
        if (data?.connected) {
          setBusy('idle');
          setError(null);
          setPendingAuthUrl(null);
          stopPoll();
        }
      })();
      // Top out at 5 minutes — same as the daemon-side state cache TTL.
      if (elapsed >= 5 * 60 * 1000) stopPoll();
    }, 2000);
  }

  const onConnect = async () => {
    setError(null);
    setPendingAuthUrl(null);
    setBusy('starting');
    const result = await startMcpOAuth(serverId);
    if (!result.ok) {
      setBusy('idle');
      setError(result.message);
      return;
    }
    setBusy('awaiting');
    setPendingAuthUrl(result.response.authorizeUrl);
    startPoll();
    // Best-effort: try to open the tab automatically. We deliberately do
    // NOT treat a null return value as failure — Electron's
    // setWindowOpenHandler always returns deny (so window.open returns
    // null) but actually invokes shell.openExternal under the hood, so
    // the URL DID open in the system browser. The fallback link below
    // covers the rare case where neither path actually opens a tab.
    try {
      window.open(
        result.response.authorizeUrl,
        '_blank',
        'noopener=no,noreferrer=no',
      );
    } catch {
      // ignore — fallback anchor is always rendered while pending
    }
  };

  // Manual fallback for the user to push when they've completed auth in
  // another tab/window but the postMessage handshake didn't fire (closed
  // opener tab, cross-origin Electron BrowserWindow, etc.).
  const onRefreshStatus = async () => {
    setBusy('refreshing');
    const data = await refresh();
    setBusy('idle');
    if (data?.connected) {
      setError(null);
      setPendingAuthUrl(null);
      stopPoll();
    } else if (busy === 'awaiting' || pendingAuthUrl) {
      // Still pending — keep the awaiting indicator visible so the user
      // knows we're still listening for the callback.
      setBusy('awaiting');
    }
  };

  const onCancelPending = () => {
    setPendingAuthUrl(null);
    setBusy('idle');
    setError(null);
    stopPoll();
  };

  const onDisconnect = async () => {
    setBusy('disconnecting');
    const ok = await disconnectMcpOAuth(serverId);
    setBusy('idle');
    if (ok) {
      setError(null);
      setPendingAuthUrl(null);
      setStatus({ connected: false });
    } else {
      setError(t('mcp.disconnectFailed'));
    }
  };

  const connected = Boolean(status?.connected);
  const expiresLabel =
    status?.expiresAt && status.expiresAt > 0
      ? new Date(status.expiresAt).toLocaleString()
      : null;
  const isAwaiting = busy === 'awaiting' || (Boolean(pendingAuthUrl) && !connected);

  return (
    <div className={`mcp-oauth-control${connected ? ' connected' : ''}`}>
      <div className="mcp-oauth-status" aria-live="polite">
        {connected ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-ok" aria-hidden />
            <span>
              <strong>{t('mcp.connected')}</strong>{' '}
              {expiresLabel ? (
                <span className="hint">{t('mcp.tokenExpires', { time: expiresLabel })}</span>
              ) : (
                <span className="hint">{t('mcp.nonExpiringToken')}</span>
              )}
            </span>
          </>
        ) : isAwaiting ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-pending" aria-hidden />
            <span>
              <strong>{t('mcp.waitingForAuthorization')}</strong>{' '}
              <span className="hint">
                {t('mcp.approveInBrowserHint')}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="mcp-oauth-dot" aria-hidden />
            <span>
              <strong>{t('mcp.notConnected')}</strong>{' '}
              <span className="hint">
                {t('mcp.clickConnectHint')}
              </span>
            </span>
          </>
        )}
      </div>

      <div className="mcp-oauth-actions">
        {connected ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title={t('mcp.reauthenticateTitle')}
            >
              {busy === 'starting' || busy === 'awaiting' ? t('mcp.connecting') : t('mcp.reconnect')}
            </button>
            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title={t('mcp.recheckTokenTitle')}
            >
              {busy === 'refreshing' ? t('mcp.checking') : t('mcp.refresh')}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
            >
              {busy === 'disconnecting' ? t('mcp.disconnecting') : t('mcp.disconnect')}
            </button>
          </>
        ) : isAwaiting ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onRefreshStatus}
              disabled={busy === 'refreshing'}
              title={t('mcp.completedAuthTitle')}
            >
              {busy === 'refreshing' ? t('mcp.checking') : t('mcp.approvedRefresh')}
            </button>
            <button type="button" onClick={onCancelPending}>
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onConnect}
            disabled={busy !== 'idle'}
          >
            {busy === 'starting' ? t('mcp.starting') : t('mcp.connect')}
          </button>
        )}
      </div>

      {pendingAuthUrl && !connected ? (
        <div className="mcp-oauth-fallback">
          <span className="hint">
            {t('mcp.browserDidntOpen')}{' '}
            <a
              href={pendingAuthUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="md-link"
            >
              {t('mcp.openAuthorizationPage')}
            </a>
            .
          </span>
        </div>
      ) : null}

      {error ? <div className="mcp-oauth-error">{error}</div> : null}
    </div>
  );
}

/**
 * Renders a compact two-line banner showing which installed CLI agents
 * receive the user's external MCP servers at spawn time and which do not.
 * The truth source is the daemon `/api/agents` payload — every runtime def
 * carries an `externalMcpInjection` discriminator (one of
 * `claude-mcp-json` / `acp-merge` / `opencode-env-content`, or undefined
 * when no native injection is wired yet).
 *
 * The banner replaces the previous silent-failure UX from issue #2142:
 * users were configuring servers under OpenCode / Codex / Gemini and
 * never learning the daemon never forwarded them to the agent process.
 * Rendered above the picker so it is the first thing the user reads.
 */
function McpAgentSupportBanner({ agents }: { agents: AgentInfo[] }) {
  const t = useT();
  // Empty payload = either still loading or daemon unreachable. Either
  // way, render nothing — the error banner below already covers the
  // "daemon unreachable" path and we don't want to flash an empty hint
  // during the initial fetch.
  if (agents.length === 0) return null;
  // `/api/agents` returns every runtime def the daemon knows about,
  // including CLIs the user hasn't installed (those carry
  // `available: false`). Splitting the full catalog into "Forwarded to /
  // Not forwarded to" would mention adapters the user can't even launch,
  // which is misleading. Scope the banner to installed CLIs only.
  const installed = agents.filter((a) => a.available && isVisibleLocalCliAgent(a));
  if (installed.length === 0) return null;
  const supported = installed.filter(
    (a) => typeof a.externalMcpInjection === 'string',
  );
  const unsupported = installed.filter(
    (a) => !a.externalMcpInjection,
  );
  if (supported.length === 0 && unsupported.length === 0) return null;
  // ACP adapters (Hermes / Kimi / Kilo / Kiro / Vibe / Devin) currently
  // accept stdio MCP servers only — `buildAcpMcpServers()` in
  // `apps/daemon/src/mcp-config.ts` filters to `transport === 'stdio'`
  // because the ACP `mcpServers` descriptor itself has no slot for
  // HTTP / SSE entries. Tag those runtimes inline so the banner does
  // not silently claim full forwarding for HTTP MCP servers, which
  // would re-introduce the very silent-failure UX we are removing.
  const renderNames = (list: AgentInfo[]) =>
    list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) =>
        a.externalMcpInjection === 'acp-merge'
          ? `${a.name} (stdio only)`
          : a.name,
      )
      .join(' · ');
  const hasAcpSupported = supported.some(
    (a) => a.externalMcpInjection === 'acp-merge',
  );
  return (
    <div className="mcp-agent-support">
      {supported.length > 0 ? (
        <p className="hint mcp-agent-support-line">
          <strong>{t('mcpClient.forwardedToLabel')}</strong> {renderNames(supported)}.
          {hasAcpSupported ? <> {t('mcpClient.forwardedAcpNote')}</> : null}
        </p>
      ) : null}
      {unsupported.length > 0 ? (
        <p className="hint mcp-agent-support-line mcp-agent-support-unsupported">
          <strong>{t('mcpClient.notForwardedToLabel')}</strong> {renderNames(unsupported)}. {t('mcpClient.notForwardedNote')}
        </p>
      ) : null}
    </div>
  );
}
