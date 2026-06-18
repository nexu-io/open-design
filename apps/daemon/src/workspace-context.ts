// Run-context normalization + prompt rendering: turns the user's selected
// skills/plugins/MCP servers/connectors/workspace tabs into the "Selected run
// context" prompt block. Extracted from server.ts as another breakup slice —
// pure data munging with no daemon-closure dependencies (no db/app/req).

const WORKSPACE_CONTEXT_KINDS = new Set([
  'design-files',
  'design-system',
  'file',
  'folder',
  'browser',
  'terminal',
  'side-chat',
  'live-artifact',
]);

export interface WorkspaceContextItem {
  id: string;
  kind: string;
  label: string;
  tabId?: string;
  path?: string;
  absolutePath?: string;
  url?: string;
  title?: string;
}

export interface RunContextSelection {
  skillIds: string[];
  pluginIds: string[];
  mcpServerIds: string[];
  connectorIds: string[];
  workspaceItems: WorkspaceContextItem[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickStr(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function normalizeWorkspaceContextItems(items: unknown): WorkspaceContextItem[] {
  if (!Array.isArray(items)) return [];
  const out: WorkspaceContextItem[] = [];
  const seen = new Set<string>();
  const cleanString = (value: unknown, max = 500): string => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
  };
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const kind = cleanString(record.kind, 64);
    if (!WORKSPACE_CONTEXT_KINDS.has(kind)) continue;
    const id = cleanString(record.id, 240);
    const label = cleanString(record.label, 240);
    if (!id || !label) continue;
    const dedupeKey = `${kind}:${id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const normalized: WorkspaceContextItem = { id, kind, label };
    const tabId = cleanString(record.tabId, 240);
    const pathValue = cleanString(record.path, 500);
    const absolutePath = cleanString(record.absolutePath, 1000);
    const url = cleanString(record.url, 1000);
    const title = cleanString(record.title, 500);
    if (tabId) normalized.tabId = tabId;
    if (pathValue) normalized.path = pathValue;
    if (absolutePath) normalized.absolutePath = absolutePath;
    if (url) normalized.url = url;
    if (title) normalized.title = title;
    out.push(normalized);
  }
  return out;
}

export function normalizeRunContextSelection(value: unknown): Partial<RunContextSelection> {
  const record = asRecord(value);
  if (!record) return {};
  const stringList = (items: unknown): string[] => {
    if (!Array.isArray(items)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  };
  return {
    skillIds: stringList(record.skillIds),
    pluginIds: stringList(record.pluginIds),
    mcpServerIds: stringList(record.mcpServerIds),
    connectorIds: stringList(record.connectorIds),
    workspaceItems: normalizeWorkspaceContextItems(record.workspaceItems),
  };
}

export function mergeRunContextSelections(...contexts: unknown[]): Record<string, unknown> {
  const merged: {
    skillIds: string[];
    pluginIds: string[];
    mcpServerIds: string[];
    connectorIds: string[];
    workspaceItems: WorkspaceContextItem[];
  } = { skillIds: [], pluginIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] };
  const listKeys = ['skillIds', 'pluginIds', 'mcpServerIds', 'connectorIds'] as const;
  const workspaceSeen = new Set<string>();
  for (const context of contexts) {
    const normalized = normalizeRunContextSelection(context);
    for (const key of listKeys) {
      const seen = new Set(merged[key]);
      for (const id of normalized[key] ?? []) {
        if (!seen.has(id)) {
          seen.add(id);
          merged[key].push(id);
        }
      }
    }
    for (const item of normalized.workspaceItems ?? []) {
      const key = `${item.kind}:${item.id}`;
      if (workspaceSeen.has(key)) continue;
      workspaceSeen.add(key);
      merged.workspaceItems.push(item);
    }
  }
  return Object.fromEntries(
    Object.entries(merged).filter(([, ids]) => ids.length > 0),
  );
}

function idsFromContextRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item as { id?: unknown } | null | undefined)?.id)
    .filter((id): id is string => typeof id === 'string');
}

export function projectMetadataContextSelection(metadata: unknown): Partial<RunContextSelection> {
  const record = asRecord(metadata);
  if (!record) return {};
  return {
    pluginIds: idsFromContextRefs(record.contextPlugins),
    mcpServerIds: idsFromContextRefs(record.contextMcpServers),
    connectorIds: idsFromContextRefs(record.contextConnectors),
  };
}

export function formatContextRefList(ids: string[], refs: unknown, titleKey = 'title'): string {
  const byId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(refs)) {
    for (const ref of refs) {
      const r = asRecord(ref);
      if (r && typeof r.id === 'string') byId.set(r.id, r);
    }
  }
  return ids
    .map((id) => {
      const ref = byId.get(id);
      const label = pickStr(ref?.[titleKey]) || pickStr(ref?.label) || pickStr(ref?.name) || id;
      const meta = [ref?.provider, ref?.transport, ref?.status, ref?.accountLabel]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' · ');
      return `- ${label} (\`${id}\`)${meta ? ` — ${meta}` : ''}`;
    })
    .join('\n');
}

export function formatWorkspaceContextList(items: unknown): string {
  if (!Array.isArray(items)) return '';
  return (items as WorkspaceContextItem[])
    .map((item, index) => {
      const details = [
        item.path ? `path: \`${item.path}\`` : null,
        item.absolutePath ? `absolute: \`${item.absolutePath}\`` : null,
        item.url ? `url: ${item.url}` : null,
        item.title ? `title: ${item.title}` : null,
        item.tabId ? `tab: \`${item.tabId}\`` : null,
      ].filter(Boolean).join(' | ');
      return `${index + 1}. ${item.kind}: ${item.label} (\`${item.id}\`)${details ? ` — ${details}` : ''}`;
    })
    .join('\n');
}

export function renderWorkspaceContextToolHints(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const kinds = new Set(
    (items as WorkspaceContextItem[]).map((item) => item?.kind).filter(Boolean),
  );
  const hints: string[] = [];
  if (kinds.has('browser')) {
    hints.push(
      '- Browser tabs: use the selected browser tab URL/title as the target for requests about logos, fonts, images, colors, motion code, element/page screenshots, accessibility, OG/meta tags, or page structure. Prefer mounted browser automation / browser-use style tools when available (DOM snapshot, page screenshot, element screenshot, accessibility tree, evaluated JavaScript). If only URL/title context is available and no inspection tool is mounted, say that explicitly and do not invent page internals.',
    );
  }
  if (kinds.has('terminal')) {
    hints.push(
      '- Terminal tabs: treat the selected terminal tab as the target shell/session. If the exact scrollback is not included in the prompt, run safe project-local read-only commands or ask for the terminal transcript instead of guessing hidden output.',
    );
  }
  if (kinds.has('file') || kinds.has('folder') || kinds.has('design-files')) {
    hints.push(
      '- File and Design Files tabs: use project-relative paths exactly as shown. Read before editing, and keep generated screenshots/briefs/assets in Design Files when the user asks to capture or extract references.',
    );
  }
  if (kinds.has('live-artifact')) {
    hints.push(
      '- Live artifact tabs: treat the selected live artifact as the preview target. Inspect or modify its source files rather than editing generated runtime output when possible.',
    );
  }
  return hints.join('\n');
}

export function renderRunContextPrompt(selection: unknown, metadata: unknown): string {
  const meta = asRecord(metadata);
  const context = mergeRunContextSelections(projectMetadataContextSelection(metadata), selection);
  const lines: string[] = [];
  if (Array.isArray(context.workspaceItems) && context.workspaceItems.length > 0) {
    lines.push('### Active workspace context');
    lines.push(
      'The user did not manually choose this context; Open Design selected the currently focused workspace tab. Use it as the default target for phrases like "this", "current", "the browser", "the terminal", or "that file" unless the user says otherwise. Use project-relative paths exactly when reading or editing project files.',
    );
    lines.push(formatWorkspaceContextList(context.workspaceItems));
    const toolHints = renderWorkspaceContextToolHints(context.workspaceItems);
    if (toolHints) lines.push(toolHints);
  }
  if (Array.isArray(context.pluginIds) && context.pluginIds.length > 0) {
    lines.push('### Selected plugins');
    lines.push(
      'The user selected these plugins as run context. When an active plugin snapshot is pinned, follow that executable plugin block; otherwise combine these plugins as requested references.',
    );
    lines.push(formatContextRefList(context.pluginIds, meta?.contextPlugins ?? [], 'title'));
  }
  if (Array.isArray(context.mcpServerIds) && context.mcpServerIds.length > 0) {
    lines.push('### Selected MCP servers');
    lines.push(
      'The user selected these MCP servers for this run. Prefer their tools when they are mounted and relevant before asking where data should come from.',
    );
    lines.push(formatContextRefList(context.mcpServerIds, meta?.contextMcpServers ?? [], 'label'));
  }
  if (Array.isArray(context.connectorIds) && context.connectorIds.length > 0) {
    lines.push('### Selected connectors');
    lines.push(
      'The user selected these connectors for this run. Discover available read-only connector tools first with `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact`, then execute relevant tools through `tools connectors execute`; do not ask for a data source that is already selected.',
    );
    lines.push(formatContextRefList(context.connectorIds, meta?.contextConnectors ?? [], 'name'));
  }
  if (lines.length === 0) return '';
  return ['## Selected run context', ...lines].join('\n');
}

export function normalizeProjectDisplayStatus(status: string): string {
  return status === 'starting' || status === 'queued' ? 'running' : status;
}
