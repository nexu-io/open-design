// UI-only types for the MCP client slice. Wire shapes come from
// `@open-design/contracts` (never redeclared here); these are the local view
// models the slice's hooks and dumb components pass around.
import type {
  McpServerConfig,
  McpTemplate,
  StartMcpOAuthResponse,
} from '@open-design/contracts';

/**
 * Result of the OAuth start transport, as the slice's port sees it. Structurally
 * identical to the provider adapter's return type — `dependencies.ts` binds the
 * two — but defined in-slice so no feature file imports `providers/` (ADR 0002).
 */
export type McpOAuthStartResult =
  | { ok: true; response: StartMcpOAuthResponse }
  | { ok: false; status: number | null; message: string };

/** Normalized OAuth callback signal the bridge hands the slice, decoupled from
 * the raw `postMessage` payload shape. */
export interface McpOAuthCallbackResult {
  ok: boolean;
  message?: string;
}

/**
 * A saved server plus editor-only scratch state. The underscore-prefixed fields
 * never reach the daemon — they are stripped by `rowsToServers` before a save.
 */
export interface DraftRow extends McpServerConfig {
  /** Newly-added row not yet persisted (drives "Save first" OAuth hints). */
  _isNew?: boolean;
  /** Free-form KEY=VALUE text for the env panel; committed back to a map on save. */
  _envText?: string;
  /** Free-form KEY=VALUE text for the headers panel; committed back on save. */
  _headersText?: string;
  /** Per-instance local id used as a stable React `key`, independent of the
   * editable `id` field so editing the id does not remount the row. */
  _localId: string;
}

/** Which surface the section renders on — drives the analytics payload and
 * nothing else. Defaults to `'integrations'` so the IntegrationsView call site
 * stays unchanged. */
export type McpClientSurface = 'integrations' | 'settings';

export interface McpClientSectionProps {
  /** Notified when the servers list changes so the parent can re-render
   * dependent affordances (e.g. composer chip count). Optional. */
  onServersChanged?: (servers: McpServerConfig[]) => void;
  /** Surfaces the dirty/save state up to the dialog footer so one "Save"
   * button can drive both the global config and this section. */
  onDirtyChange?: (dirty: boolean) => void;
  surface?: McpClientSurface;
}

/**
 * Imperative handle: lets the dialog footer Save button trigger this section's
 * save without lifting the entire row state up.
 */
export interface McpClientSectionHandle {
  save: () => Promise<boolean>;
  hasDirty: () => boolean;
}

/** OAuth control's in-flight phase. */
export type McpOAuthBusy =
  | 'idle'
  | 'starting'
  | 'awaiting'
  | 'disconnecting'
  | 'refreshing';

/** One category's slice of the "Add server" picker, precomputed by the pure
 * `buildMcpPickerGroups` rule so the picker component stays presentational. */
export interface McpPickerGroup {
  id: NonNullable<McpTemplate['category']>;
  label: string;
  hint: string;
  /** Every template in this category (before the query filter). */
  all: McpTemplate[];
  /** Templates matching the active query. */
  matched: McpTemplate[];
  /** Whether the `<details>` group renders open by default. */
  defaultOpen: boolean;
}

/** Result of grouping templates for the picker: the visible groups plus the
 * total matched across them (for the empty-state). */
export interface McpPickerGroups {
  groups: McpPickerGroup[];
  visibleTotal: number;
}
