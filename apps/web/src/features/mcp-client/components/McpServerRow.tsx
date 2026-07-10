// One saved/draft MCP server row: a collapsed summary that expands into the
// full editor (transport, command/args/env or url/headers, OAuth control, JSON
// helper). Holds only ephemeral disclosure state (expanded / example open);
// every edit flows out through `onChange`, and auth-mode inference is the pure
// `rules`.
import { useState } from 'react';
import type { McpServerConfig, McpTemplate } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { Icon } from '../../../components/Icon';
import {
  authModeAfterUrlChange,
  effectiveMcpAuthMode,
  inferMcpAuthMode,
} from '../rules';
import type { DraftRow } from '../types';
import { McpOAuthControl } from './McpOAuthControl';

interface McpServerRowProps {
  row: DraftRow;
  idx: number;
  total: number;
  /** The built-in template this row was instantiated from, when the user picked
   * a preset. Surfaces description / homepage / example hints inline. */
  template?: McpTemplate;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function McpServerRow({
  row,
  idx,
  total,
  template,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: McpServerRowProps) {
  const isHttpLike = row.transport === 'http' || row.transport === 'sse';
  const usesManagedOAuth = isHttpLike && effectiveMcpAuthMode(row) === 'oauth';
  const [expanded, setExpanded] = useState<boolean>(false);
  const summaryTitle = row.label?.trim() || row.id || 'Unnamed MCP server';
  const [showMcpExample, setShowMcpExample] = useState<boolean>(false);
  const helperId = `mcp-json-helper-panel-${row._localId}`;

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
            <Button size="icon" onClick={onMoveUp} title="Move up">
              ↑
            </Button>
          ) : null}
          {onMoveDown ? (
            <Button size="icon" onClick={onMoveDown} title="Move down">
              ↓
            </Button>
          ) : null}
          <Button
            size="icon"
            onClick={onRemove}
            title="Remove this MCP server"
          >
            ×
          </Button>
          <Button
            size="icon"
            className="mcp-row-toggle-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse this MCP server' : 'Expand this MCP server'}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <Icon name="chevron-down" size={13} />
          </Button>
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
            usesManagedOAuth ? (
              <McpOAuthControl serverId={row.id} />
            ) : (
              <div className="mcp-oauth-hint hint">
                <strong>No managed OAuth.</strong> Open Design will use this
                server as configured. Add headers below if the server needs a
                token.
              </div>
            )
          ) : null}
          {isHttpLike && row._isNew && usesManagedOAuth ? (
            <div className="mcp-oauth-hint hint">
              Save first, then click <strong>Connect</strong> to grant Open Design
              access via the provider's OAuth flow.
            </div>
          ) : null}
          {isHttpLike && row._isNew && !usesManagedOAuth ? (
            <div className="mcp-oauth-hint hint">
              <strong>No managed OAuth.</strong> Save this server and Open Design
              will use it directly.
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
                <span className="mcp-row-field-label">OAuth mode</span>
                <select
                  value={effectiveMcpAuthMode(row)}
                  onChange={(e) =>
                    onChange({
                      authMode: e.target.value as NonNullable<McpServerConfig['authMode']>,
                    })
                  }
                >
                  <option value="none">No managed OAuth</option>
                  <option value="oauth">Managed OAuth</option>
                </select>
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">URL</span>
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
                  Need help? Map your MCP server's JSON config using the example below.
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
                  Example MCP JSON
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
                    <strong>Command</strong>
                    <code>npx</code>
                  </div>
                  <div>
                    <strong>Args</strong>
                    <code>-y tdesign-mcp-server@latest</code>
                  </div>
                  <div>
                    <strong>Env</strong>
                    <code>API_KEY = your-key-here</code>
                  </div>
                  <div>
                    <strong>HTTP / SSE</strong>
                    <code>use url + headers instead of command / args</code>
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
