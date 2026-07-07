// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module prompts/run-context
 * Run-context selection normalization and the "## Selected run context" prompt
 * block.
 *
 * `normalizeRunContextSelection` / `mergeRunContextSelections` clean and merge
 * the user-selected skills, plugins, MCP servers, connectors, and workspace
 * items for a run; `renderRunContextPrompt` composes the markdown context block
 * (workspace tool hints + reference lists) that is prepended to the agent
 * prompt. All helpers are pure — they read only their arguments and depend on
 * no daemon module state.
 *
 * Extracted verbatim from apps/daemon/src/server.ts (strangler-fig slice 3).
 * server.ts imports `normalizeRunContextSelection` (routine context) and
 * `renderRunContextPrompt` (passed into the chat-run deps) back from here.
 */

const WORKSPACE_CONTEXT_KINDS = new Set([
  'design-files',
  'design-system',
  'file',
  'folder',
  'project',
  'local-code',
  'browser',
  'terminal',
  'side-chat',
  'live-artifact',
]);

function normalizeWorkspaceContextItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  const cleanString = (value, max = 500) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
  };
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const kind = cleanString(record.kind, 64);
    if (!WORKSPACE_CONTEXT_KINDS.has(kind)) continue;
    const id = cleanString(record.id, 240);
    const label = cleanString(record.label, 240);
    if (!id || !label) continue;
    const dedupeKey = `${kind}:${id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const normalized: Record<string, string> = { id, kind, label };
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

function normalizeRunContextSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const stringList = (items) => {
    if (!Array.isArray(items)) return [];
    const out = [];
    const seen = new Set();
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
    skillIds: stringList(value.skillIds),
    pluginIds: stringList(value.pluginIds),
    mcpServerIds: stringList(value.mcpServerIds),
    connectorIds: stringList(value.connectorIds),
    workspaceItems: normalizeWorkspaceContextItems(value.workspaceItems),
  };
}

function mergeRunContextSelections(...contexts) {
  const merged = { skillIds: [], pluginIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] };
  const listKeys = ['skillIds', 'pluginIds', 'mcpServerIds', 'connectorIds'];
  const workspaceSeen = new Set();
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

function projectMetadataContextSelection(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  return {
    pluginIds: Array.isArray(metadata.contextPlugins)
      ? metadata.contextPlugins.map((item) => item?.id).filter((id) => typeof id === 'string')
      : [],
    mcpServerIds: Array.isArray(metadata.contextMcpServers)
      ? metadata.contextMcpServers.map((item) => item?.id).filter((id) => typeof id === 'string')
      : [],
    connectorIds: Array.isArray(metadata.contextConnectors)
      ? metadata.contextConnectors.map((item) => item?.id).filter((id) => typeof id === 'string')
      : [],
  };
}

function formatContextRefList(ids, refs, titleKey = 'title') {
  const byId = new Map();
  if (Array.isArray(refs)) {
    for (const ref of refs) {
      if (ref && typeof ref.id === 'string') byId.set(ref.id, ref);
    }
  }
  return ids
    .map((id) => {
      const ref = byId.get(id);
      const label =
        typeof ref?.[titleKey] === 'string' && ref[titleKey].trim()
          ? ref[titleKey].trim()
          : typeof ref?.label === 'string' && ref.label.trim()
            ? ref.label.trim()
            : typeof ref?.name === 'string' && ref.name.trim()
              ? ref.name.trim()
              : id;
      const meta = [
        ref?.provider,
        ref?.transport,
        ref?.status,
        ref?.accountLabel,
      ].filter((value) => typeof value === 'string' && value.trim()).join(' · ');
      return `- ${label} (\`${id}\`)${meta ? ` — ${meta}` : ''}`;
    })
    .join('\n');
}

function formatWorkspaceContextList(items) {
  if (!Array.isArray(items)) return '';
  return items
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

function renderWorkspaceContextToolHints(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const kinds = new Set(items.map((item) => item?.kind).filter(Boolean));
  const hints = [];
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
  if (kinds.has('project')) {
    hints.push(
      '- Referenced projects: use the absolute path as a read-only reference project when present. Search and read relevant files before applying ideas to the current project; do not edit the referenced project unless the user explicitly asks.',
    );
  }
  if (kinds.has('local-code')) {
    hints.push(
      '- Local code folders: use the absolute path as read-only implementation context. Inspect files under that folder when useful, align with its conventions, and make edits only in the active Open Design project unless the user explicitly asks otherwise.',
    );
  }
  if (kinds.has('live-artifact')) {
    hints.push(
      '- Live artifact tabs: treat the selected live artifact as the preview target. Inspect or modify its source files rather than editing generated runtime output when possible.',
    );
  }
  return hints.join('\n');
}

function renderRunContextPrompt(selection, metadata) {
  const context = mergeRunContextSelections(projectMetadataContextSelection(metadata), selection);
  const lines = [];
  if (Array.isArray(context.workspaceItems) && context.workspaceItems.length > 0) {
    lines.push('### Active workspace context');
    lines.push(
      'The user selected these workspace contexts or Open Design inferred the currently focused workspace tab. Use them as the default target for phrases like "this", "current", "the browser", "the terminal", "that file", or "the referenced code/project" unless the user says otherwise. Use project-relative paths exactly when reading or editing project files, and treat absolute local paths as reference context unless explicitly asked to edit them.',
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
    lines.push(formatContextRefList(context.pluginIds, metadata?.contextPlugins ?? [], 'title'));
  }
  if (Array.isArray(context.mcpServerIds) && context.mcpServerIds.length > 0) {
    lines.push('### Selected MCP servers');
    lines.push(
      'The user selected these MCP servers for this run. Prefer their tools when they are mounted and relevant before asking where data should come from.',
    );
    lines.push(formatContextRefList(context.mcpServerIds, metadata?.contextMcpServers ?? [], 'label'));
  }
  if (Array.isArray(context.connectorIds) && context.connectorIds.length > 0) {
    lines.push('### Selected connectors');
    lines.push(
      'The user selected these connectors for this run. Discover available read-only connector tools first with `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact`, then execute relevant tools through `tools connectors execute`; do not ask for a data source that is already selected.',
    );
    lines.push(formatContextRefList(context.connectorIds, metadata?.contextConnectors ?? [], 'name'));
  }
  if (lines.length === 0) return '';
  return ['## Selected run context', ...lines].join('\n');
}

export {
  normalizeRunContextSelection,
  renderRunContextPrompt,
};
