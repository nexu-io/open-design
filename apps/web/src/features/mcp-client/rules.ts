// Pure business rules for the MCP client slice: auth-mode inference, draft-row
// <-> wire-config mapping, template instantiation, validation, dirty-detection,
// id suggestion, picker grouping and agent-support partitioning. No transport,
// no DOM, no React — every function here takes plain data and returns plain
// data, so it tests with zero doubles.
import type {
  McpServerConfig,
  McpTemplate,
} from '@open-design/contracts';
import type { AgentInfo } from '../../types';
import { isVisibleLocalCliAgent } from '../../utils/visibleAgents';
import { CATEGORY_ORDER, DEFAULT_OPEN_CATEGORIES, ID_PATTERN } from './constants';
import type { DraftRow, McpPickerGroups } from './types';

// Simple incrementing local id generator for row keys. Kept module-scoped and
// deterministic for the lifetime of this UI instance.
let NEXT_LOCAL_ID = 1;
export function genLocalId(): string {
  return `mcp-row-${NEXT_LOCAL_ID++}`;
}

export function isLoopbackMcpUrl(rawUrl: string | undefined): boolean {
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

export function inferMcpAuthMode(
  url: string | undefined,
): NonNullable<McpServerConfig['authMode']> {
  return isLoopbackMcpUrl(url) ? 'none' : 'oauth';
}

export function effectiveMcpAuthMode(
  row: Pick<McpServerConfig, 'transport' | 'url' | 'authMode'>,
): NonNullable<McpServerConfig['authMode']> {
  if (row.transport !== 'http' && row.transport !== 'sse') return 'none';
  return row.authMode ?? inferMcpAuthMode(row.url);
}

export function authModeAfterUrlChange(
  row: Pick<McpServerConfig, 'url' | 'authMode'>,
  nextUrl: string,
): NonNullable<McpServerConfig['authMode']> {
  const previousInferred = inferMcpAuthMode(row.url);
  if (!row.authMode || row.authMode === previousInferred) {
    return inferMcpAuthMode(nextUrl);
  }
  return row.authMode;
}

export function mapToText(m: Record<string, string>): string {
  return Object.entries(m)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

export function textToMap(
  text: string | undefined,
): Record<string, string> | undefined {
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

export function rowsFromServers(servers: McpServerConfig[]): DraftRow[] {
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

export function rowsToServers(rows: DraftRow[]): McpServerConfig[] {
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

export function rowFromTemplate(
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

export function rowFromBlank(taken: ReadonlySet<string>): DraftRow {
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

export function templateMatchesQuery(tpl: McpTemplate, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    tpl.label.toLowerCase().includes(needle) ||
    tpl.id.toLowerCase().includes(needle) ||
    (tpl.description?.toLowerCase().includes(needle) ?? false) ||
    (tpl.example?.toLowerCase().includes(needle) ?? false)
  );
}

export function validateRow(r: DraftRow): string | null {
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

/**
 * Stable signature used to detect dirty state — a cheap diff against the
 * last-known-saved server list. Avoids a deep-equality library.
 */
export function signature(rows: DraftRow[]): string {
  return JSON.stringify(rowsToServers(rows));
}

/**
 * Generate a unique stable id from a label (lowercase, slug). Falls back to a
 * short random suffix so duplicates of the same template still land at distinct
 * ids.
 */
export function suggestMcpServerId(
  label: string,
  taken: ReadonlySet<string>,
): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'mcp-server';
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const next = `${base}-${i}`;
    if (!taken.has(next)) return next;
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Group the templates into the picker's ordered categories, applying the free-
 * text query. A group is dropped when it has no templates at all, or when a
 * query is active and nothing in it matches. `defaultOpen` follows the static
 * default set, but any active query forces every visible group open so matches
 * surface without an extra click. `visibleTotal` is the match count across all
 * groups, used to drive the picker's empty-state.
 */
export function buildMcpPickerGroups(
  templates: McpTemplate[],
  query: string,
): McpPickerGroups {
  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const buckets = new Map<McpTemplate['category'], McpTemplate[]>();
  for (const tpl of templates) {
    const list = buckets.get(tpl.category) ?? [];
    list.push(tpl);
    buckets.set(tpl.category, list);
  }

  const groups: McpPickerGroups['groups'] = [];
  let visibleTotal = 0;
  for (const cat of CATEGORY_ORDER) {
    const all = buckets.get(cat.id) ?? [];
    const matched = all.filter((t) => templateMatchesQuery(t, trimmed));
    visibleTotal += matched.length;
    if (all.length === 0) continue;
    if (hasQuery && matched.length === 0) continue;
    groups.push({
      id: cat.id,
      label: cat.label,
      hint: cat.hint,
      all,
      matched,
      defaultOpen: hasQuery || DEFAULT_OPEN_CATEGORIES.has(cat.id),
    });
  }
  return { groups, visibleTotal };
}

/** The agent-support banner's partition: which installed CLI agents forward the
 * user's external MCP servers and which do not. Scoped to installed, visible
 * local CLI agents so the banner never mentions adapters the user can't launch. */
export interface McpAgentSupport {
  supported: AgentInfo[];
  unsupported: AgentInfo[];
  /** Whether any supported agent is an ACP adapter (stdio-only forwarding). */
  hasAcpSupported: boolean;
}

export function partitionMcpAgentSupport(agents: AgentInfo[]): McpAgentSupport {
  const installed = agents.filter((a) => a.available && isVisibleLocalCliAgent(a));
  const supported = installed.filter(
    (a) => typeof a.externalMcpInjection === 'string',
  );
  const unsupported = installed.filter((a) => !a.externalMcpInjection);
  const hasAcpSupported = supported.some(
    (a) => a.externalMcpInjection === 'acp-merge',
  );
  return { supported, unsupported, hasAcpSupported };
}
