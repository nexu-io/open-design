// The "Add server" picker: categorized `<details>` groups, an inline filter and
// a sticky close affordance. Presentational — grouping/filtering is the pure
// `buildMcpPickerGroups` rule, so this component just maps its output to JSX.
//
// UX rules:
//  - Groups are collapsed by default once the catalog crosses ~12 entries so
//    the picker fits a normal viewport. An active search pre-expands every
//    visible group so matches are immediately visible.
//  - Groups with zero matching templates are hidden entirely while a search is
//    active to avoid a wall of empty headers.
//  - "Custom server" lives in its own footer card pinned below the groups so
//    users can always reach it even after scrolling through templates.
import { useMemo } from 'react';
import type { McpTemplate } from '@open-design/contracts';
import { Icon } from '../../../components/Icon';
import { buildMcpPickerGroups } from '../rules';
import { McpPickerCard } from './McpPickerCard';

interface McpPickerPanelProps {
  templates: McpTemplate[];
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (tpl: McpTemplate) => void;
  onPickBlank: () => void;
  onClose: () => void;
}

export function McpPickerPanel({
  templates,
  query,
  onQueryChange,
  onPick,
  onPickBlank,
  onClose,
}: McpPickerPanelProps) {
  const { groups, visibleTotal } = useMemo(
    () => buildMcpPickerGroups(templates, query),
    [templates, query],
  );
  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

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
        {groups.map((group) => (
          <details key={group.id} className="mcp-picker-group" open={group.defaultOpen}>
            <summary className="mcp-picker-group-summary">
              <span className="mcp-picker-group-summary-title">{group.label}</span>
              <span className="mcp-picker-group-summary-count">
                {hasQuery ? `${group.matched.length}/${group.all.length}` : group.all.length}
              </span>
              <span className="mcp-picker-group-summary-hint">{group.hint}</span>
            </summary>
            <div className="mcp-picker-grid">
              {group.matched.map((tpl) => (
                <McpPickerCard key={tpl.id} tpl={tpl} onPick={() => onPick(tpl)} />
              ))}
            </div>
          </details>
        ))}
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
