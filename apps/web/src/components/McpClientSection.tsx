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
import { Icon } from './Icon';

interface Props {
  // Receive a notification when servers list changes so the parent can
  // re-render dependent affordances (e.g. composer chip count). Optional.
  onServersChanged?: (servers: McpServerConfig[]) => void;
  // Surface the dirty/save state up to the dialog footer so a single
  // "Save" button can drive both the global config and this section.
  onDirtyChange?: (dirty: boolean) => void;
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
}

function rowsFromServers(servers: McpServerConfig[]): DraftRow[] {
  return servers.map((s) => ({
    ...s,
    _envText: s.env ? mapToText(s.env) : '',
    _headersText: s.headers ? mapToText(s.headers) : '',
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
    command: tpl.command,
    args: tpl.args ? [...tpl.args] : undefined,
    url: tpl.url,
    _envText: Object.keys(env).length > 0 ? mapToText(env) : '',
    _headersText: Object.keys(headers).length > 0 ? mapToText(headers) : '',
    _isNew: true,
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
  };
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

// Picker grouping. Mirrors `McpTemplateCategory` in `packages/contracts`.
// The order here is the *display* order in the picker — keep it intentional
// so the most useful categories for Open Design (visual generation, then
// editing, then publishing surfaces) sit at the top.
const CATEGORY_ORDER: ReadonlyArray<{
  id: NonNullable<McpTemplate['category']>;
  label: string;
  hint: string;
}> = [
  {
    id: 'image-generation',
    label: 'Image generation',
    hint: 'Models that produce raster, vector or video assets.',
  },
  {
    id: 'image-editing',
    label: 'Image editing',
    hint: 'Local post-processing, OCR and CV-driven edits.',
  },
  {
    id: 'web-capture',
    label: 'Web capture',
    hint: 'Render a URL into an image so the agent can see what it built.',
  },
  {
    id: 'design-systems',
    label: 'Design systems',
    hint: 'Figma read/write, design-token translation, brand inspiration.',
  },
  {
    id: 'ui-components',
    label: 'UI components',
    hint: 'Designer-grade components, blocks and landing-page material.',
  },
  {
    id: 'data-viz',
    label: 'Data viz',
    hint: 'Charts and diagrams as proper image artifacts.',
  },
  {
    id: 'publishing',
    label: 'Publishing',
    hint: 'Push generated artifacts to a public URL.',
  },
  {
    id: 'utilities',
    label: 'Utilities',
    hint: 'Filesystem, fetch, GitHub and similar generic tools.',
  },
];

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

function validateRow(r: DraftRow): string | null {
  if (!ID_PATTERN.test(r.id)) {
    return 'ID must start with a letter or digit and only contain letters, digits, dash, or underscore (max 64 chars).';
  }
  if (r.transport === 'stdio') {
    if (!r.command || !r.command.trim()) return 'Command is required for stdio transport.';
  } else {
    if (!r.url || !r.url.trim()) return 'URL is required for SSE / HTTP transport.';
    try {
      const parsed = new URL(r.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'URL must use http:// or https://.';
      }
    } catch {
      return 'URL is malformed.';
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
  function McpClientSection({ onServersChanged, onDirtyChange }, ref) {
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchMcpServers();
      if (cancelled) return;
      if (!data) {
        setError('Could not reach the local daemon. Make sure Open Design is running, then reopen this panel.');
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
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromTemplate(tpl, new Set(curr.map((r) => r.id)))]);
  };

  const addBlank = () => {
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromBlank(new Set(curr.map((r) => r.id)))]);
  };

  const save = async (): Promise<boolean> => {
    for (const r of rows) {
      const err = validateRow(r);
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
      setError('Save failed. Check that the daemon is running and try again.');
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
            <h3>External MCP servers</h3>
            <p className="hint">Loading…</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>External MCP servers</h3>
          <p className="hint">
            Surface tools from third-party MCP servers (Higgsfield, GitHub,
            filesystem…) to your coding agent.
          </p>
        </div>
        <button
          type="button"
          className="primary mcp-add-btn"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
        >
          <Icon name="sparkles" size={13} />
          <span>Add server</span>
        </button>
      </div>

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
          <strong>No MCP servers configured.</strong>
          <p className="hint">
            Click &ldquo;Add server&rdquo; to get started — pick a template
            (Higgsfield OpenClaw, Pollinations, Allyson, Imagician, EdgeOne
            Pages, GitHub, Filesystem…) or set up a custom stdio / HTTP server.
          </p>
        </div>
      ) : (
        <div className="mcp-rows">
          {rows.map((row, idx) => (
            <McpRow
              key={`${row.id}-${idx}`}
              row={row}
              idx={idx}
              total={rows.length}
              template={
                row.templateId
                  ? templates.find((t) => t.id === row.templateId)
                  : undefined
              }
              onChange={(patch) => updateRow(idx, patch)}
              onRemove={() => removeRow(idx)}
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
          onClick={() => void save()}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
        {savedAt && !dirty ? (
          <span className="hint mcp-saved-msg">Saved.</span>
        ) : null}
        <span className="mcp-foot-spacer" />
        <span className="hint">
          Stored at <code>.od/mcp-config.json</code>
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
  const renderGroups = CATEGORY_ORDER.map((cat) => {
    const all = grouped.get(cat.id) ?? [];
    const matched = all.filter((t) => templateMatchesQuery(t, trimmed));
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
          <strong>Pick a template</strong>
          <button
            type="button"
            className="icon-btn mcp-picker-close"
            onClick={onClose}
            title="Close picker"
            aria-label="Close picker"
          >
            ×
          </button>
        </div>
        <span className="hint">
          Pre-fills the form. You can still edit any field after.
        </span>
        <input
          type="search"
          className="mcp-picker-search"
          placeholder="Filter by name, transport, capability…"
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
            No templates match &ldquo;{trimmed}&rdquo;. Try clearing the filter
            or use the custom server option below.
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
            <Icon name="settings" size={13} />
            <strong>Custom server</strong>
          </span>
          <span className="mcp-picker-desc">
            Empty form. Pick stdio or SSE / HTTP and fill the fields yourself.
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
  return (
    <div className="mcp-picker-item">
      <button
        type="button"
        className="mcp-picker-item-action"
        onClick={onPick}
        title={tpl.description}
      >
        <span className="mcp-picker-item-head">
          <Icon name="link" size={13} />
          <strong>{tpl.label}</strong>
          <span className="mcp-picker-transport">{tpl.transport}</span>
        </span>
        <span className="mcp-picker-desc">{tpl.description}</span>
        {tpl.example ? (
          <span className="mcp-picker-example">
            <span className="mcp-picker-example-label">Try:</span>
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
          <Icon name="external-link" size={11} />
          <span>Homepage</span>
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
  const isHttpLike = row.transport === 'http' || row.transport === 'sse';
  // Every row starts collapsed. The Settings page is meant to be scannable
  // — the user expands a row only when they need to edit fields or run the
  // OAuth dance. Newly-added rows from the picker are no exception: their
  // fields are already pre-filled from the template, so the user can save
  // immediately if they don't need to customize anything.
  const [expanded, setExpanded] = useState<boolean>(false);
  const summaryTitle = row.label?.trim() || row.id || 'Unnamed MCP server';
  return (
    <div
      className={`mcp-row${row.enabled ? '' : ' mcp-row-disabled'}${
        expanded ? ' mcp-row-expanded' : ''
      }`}
    >
      <div className="mcp-row-head">
        <label className="mcp-row-toggle" title={row.enabled ? 'Enabled' : 'Disabled'}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            aria-label="Enable this MCP server"
          />
        </label>
        {expanded ? (
          <input
            type="text"
            className="mcp-row-label"
            value={row.label ?? ''}
            placeholder="Display name (optional)"
            onChange={(e) => onChange({ label: e.target.value })}
          />
        ) : (
          // When collapsed, the label is read-only — keeps the row compact
          // and avoids accidental edits while scanning. The user can click
          // the expand caret to reveal the full editable label input.
          <button
            type="button"
            className="mcp-row-summary-title"
            onClick={() => setExpanded(true)}
            title="Expand to edit"
          >
            <span className="mcp-row-summary-name">{summaryTitle}</span>
            <span
              className="mcp-row-summary-transport"
              aria-label={`Transport: ${row.transport}`}
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
            <button type="button" className="icon-btn" onClick={onMoveUp} title="Move up">
              ↑
            </button>
          ) : null}
          {onMoveDown ? (
            <button type="button" className="icon-btn" onClick={onMoveDown} title="Move down">
              ↓
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            onClick={onRemove}
            title="Remove this MCP server"
          >
            ×
          </button>
          <button
            type="button"
            className="icon-btn mcp-row-toggle-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse this MCP server' : 'Expand this MCP server'}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <Icon name="chevron-down" size={13} />
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          {template ? (
            <details className="mcp-row-info">
              <summary className="mcp-row-info-summary">
                <span className="mcp-row-info-summary-label">
                  About {template.label}
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
                    <Icon name="external-link" size={11} />
                    <span>Homepage</span>
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
                    title="Paste this prompt into the chat composer to try the server end-to-end"
                  >
                    <span className="mcp-row-info-example-label">Try:</span>{' '}
                    <span className="mcp-row-info-example-text">"{template.example}"</span>
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}

          {isHttpLike && !row._isNew && row.id ? (
            <McpOAuthControl serverId={row.id} />
          ) : null}
          {isHttpLike && row._isNew ? (
            <div className="mcp-oauth-hint hint">
              Save first, then click <strong>Connect</strong> to grant Open Design
              access via the provider's OAuth flow.
            </div>
          ) : null}

          <div className="mcp-row-grid">
            <label className="mcp-row-field">
              <span className="mcp-row-field-label">ID</span>
              <input
                type="text"
                value={row.id}
                onChange={(e) => onChange({ id: e.target.value })}
                spellCheck={false}
              />
            </label>
            <label className="mcp-row-field">
              <span className="mcp-row-field-label">Transport</span>
              <select
                value={row.transport}
                onChange={(e) =>
                  onChange({ transport: e.target.value as DraftRow['transport'] })
                }
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
                <span className="mcp-row-field-label">Command</span>
                <input
                  type="text"
                  value={row.command ?? ''}
                  placeholder="e.g. npx, node, /path/to/binary"
                  onChange={(e) => onChange({ command: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">Args</span>
                <input
                  type="text"
                  value={(row.args ?? []).join(' ')}
                  placeholder="space-separated"
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
                <span className="mcp-row-field-label">Env (KEY=VALUE)</span>
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
                <span className="mcp-row-field-label">URL</span>
                <input
                  type="text"
                  value={row.url ?? ''}
                  placeholder="https://mcp.higgsfield.ai/mcp"
                  onChange={(e) => onChange({ url: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">Headers (KEY=VALUE)</span>
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
      setError('Disconnect failed. Check daemon logs.');
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
              <strong>Connected.</strong>{' '}
              {expiresLabel ? (
                <span className="hint">Token expires {expiresLabel}.</span>
              ) : (
                <span className="hint">Non-expiring token.</span>
              )}
            </span>
          </>
        ) : isAwaiting ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-pending" aria-hidden />
            <span>
              <strong>Waiting for authorization…</strong>{' '}
              <span className="hint">
                Approve in the browser tab that opened. We'll catch the callback
                automatically — or click Refresh below if you completed it
                already.
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="mcp-oauth-dot" aria-hidden />
            <span>
              <strong>Not connected.</strong>{' '}
              <span className="hint">
                Click Connect to grant Open Design access via the provider's OAuth flow.
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
              title="Reauthenticate (replaces the existing token)"
            >
              {busy === 'starting' || busy === 'awaiting' ? 'Connecting…' : 'Reconnect'}
            </button>
            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title="Re-check token status against the daemon"
            >
              {busy === 'refreshing' ? 'Checking…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
            >
              {busy === 'disconnecting' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : isAwaiting ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onRefreshStatus}
              disabled={busy === 'refreshing'}
              title="I've completed authorization — check connection status now"
            >
              {busy === 'refreshing' ? 'Checking…' : 'I\u2019ve approved — Refresh'}
            </button>
            <button type="button" onClick={onCancelPending}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onConnect}
            disabled={busy !== 'idle'}
          >
            {busy === 'starting' ? 'Starting…' : 'Connect'}
          </button>
        )}
      </div>

      {pendingAuthUrl && !connected ? (
        <div className="mcp-oauth-fallback">
          <span className="hint">
            Browser didn't open?{' '}
            <a
              href={pendingAuthUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="md-link"
            >
              Open authorization page
            </a>
            .
          </span>
        </div>
      ) : null}

      {error ? <div className="mcp-oauth-error">{error}</div> : null}
    </div>
  );
}
