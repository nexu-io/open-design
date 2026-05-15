// Plan §3.C2 / spec §8.1 — context chip strip.
//
// Renders the typed `ContextItem` list above the brief input. Each chip
// describes one piece of context the active plugin contributed: an
// active skill, a design-system, a craft rule, an asset, an MCP server,
// a connector, etc. Clicking the X button calls `onRemove(item)` so
// the parent can decide whether removing the chip should clear the
// applied plugin (typical) or just hide it. Clicking the chip body
// (when `onSelect` is wired) lets the host open a detail view —
// ChatComposer uses this to surface the PluginDetailsModal for
// `kind === 'plugin'` chips.

import type { ContextItem, ContextItemKind } from '@open-design/contracts';
import { Icon } from './Icon';

interface Props {
  items: ContextItem[];
  onRemove?: (item: ContextItem) => void;
  // Optional click handler for the chip body. When omitted the chip is
  // a static label; when set the body becomes a button so users can
  // drill into the underlying record (e.g. open PluginDetailsModal).
  onSelect?: (item: ContextItem) => void;
  // When true (default), an empty list renders nothing; when false the
  // empty state shows a placeholder hint useful for tests / docs.
  hideWhenEmpty?: boolean;
}

// Map each ContextItem kind to an existing Icon name so the chip
// strip can convey type at a glance. Falls back to 'sparkles' for
// unknown kinds (defensive — the schema is closed today but new
// kinds may be added without touching this file first).
const KIND_ICON: Record<ContextItemKind, Parameters<typeof Icon>[0]['name']> = {
  skill: 'sparkles',
  'design-system': 'grid',
  craft: 'pencil',
  asset: 'file',
  mcp: 'link',
  'claude-plugin': 'import',
  atom: 'orbit',
  plugin: 'sliders',
};

// Short, human-readable kind labels for the chip prefix. The raw kind
// (`design-system`, `claude-plugin`) is too long for a 200px-wide chip,
// and shows up out-of-context on hover anyway via the title attribute.
const KIND_LABEL: Record<ContextItemKind, string> = {
  skill: 'Skill',
  'design-system': 'Design',
  craft: 'Craft',
  asset: 'Asset',
  mcp: 'MCP',
  'claude-plugin': 'Claude',
  atom: 'Atom',
  plugin: 'Plugin',
};

export function ContextChipStrip(props: Props) {
  const items = props.items ?? [];
  if (items.length === 0 && (props.hideWhenEmpty ?? true)) return null;
  return (
    <div className="context-chip-strip" role="list" data-testid="context-chip-strip">
      {items.length === 0 ? (
        <div className="context-chip-strip__empty">No active plugin context.</div>
      ) : null}
      {items.map((item, idx) => {
        const iconName = KIND_ICON[item.kind] ?? 'sparkles';
        const kindLabel = KIND_LABEL[item.kind] ?? item.kind;
        const label = chipLabel(item);
        const interactive = Boolean(props.onSelect);
        const titleAttr = `${kindLabel}: ${label}`;
        const inner = (
          <>
            <span className="context-chip-strip__icon" aria-hidden>
              <Icon name={iconName} size={11} />
            </span>
            <span className="context-chip-strip__kind">{kindLabel}</span>
            <span className="context-chip-strip__label">{label}</span>
          </>
        );
        return (
          <span
            key={`${item.kind}-${chipKey(item)}-${idx}`}
            role="listitem"
            className={`context-chip-strip__chip${interactive ? ' is-interactive' : ''}`}
            data-kind={item.kind}
          >
            {interactive ? (
              <button
                type="button"
                className="context-chip-strip__body"
                onClick={() => props.onSelect?.(item)}
                title={titleAttr}
              >
                {inner}
              </button>
            ) : (
              <span className="context-chip-strip__body" title={titleAttr}>
                {inner}
              </span>
            )}
            {props.onRemove ? (
              <button
                type="button"
                className="context-chip-strip__remove"
                aria-label={`Remove ${kindLabel} ${label}`}
                onClick={() => props.onRemove?.(item)}
              >
                ×
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function chipLabel(item: ContextItem): string {
  if ('label' in item && item.label) return item.label;
  if ('id' in item && item.id) return item.id;
  if ('name' in item && item.name) return item.name;
  if ('path' in item && item.path) return item.path;
  return item.kind;
}

function chipKey(item: ContextItem): string {
  if ('id' in item && item.id) return item.id;
  if ('name' in item && item.name) return item.name;
  if ('path' in item && item.path) return item.path;
  return '';
}
