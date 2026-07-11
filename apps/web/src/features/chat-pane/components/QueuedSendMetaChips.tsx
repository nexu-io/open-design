import type { QueuedSendItem } from '../types';

// Surfaces what a queued turn carries — attachments, visual marks, and the
// staged plugin / skill / MCP / connector context from its meta — as compact
// chips so the user can see (and trust) what will be sent without expanding it.
// Counts use the same plain-English style as the rest of this strip.
export function QueuedSendMetaChips({ item }: { item: QueuedSendItem }) {
  const ctx = item.meta?.context;
  const files = item.attachments?.length ?? 0;
  const marks = item.commentAttachments?.length ?? 0;
  const plugins = item.meta?.appliedPluginSnapshot ? 1 : ctx?.pluginIds?.length ?? 0;
  const skills = ctx?.skillIds?.length ?? 0;
  const mcp = ctx?.mcpServerIds?.length ?? 0;
  const connectors = ctx?.connectorIds?.length ?? 0;
  const workspace = ctx?.workspaceItems?.length ?? 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const chips: Array<{ key: string; label: string }> = [];
  if (files > 0) chips.push({ key: 'files', label: plural(files, 'file') });
  if (marks > 0) chips.push({ key: 'marks', label: plural(marks, 'mark') });
  if (plugins > 0) chips.push({ key: 'plugins', label: plural(plugins, 'plugin') });
  if (skills > 0) chips.push({ key: 'skills', label: plural(skills, 'skill') });
  if (mcp > 0) chips.push({ key: 'mcp', label: `${mcp} MCP` });
  if (connectors > 0) chips.push({ key: 'connectors', label: plural(connectors, 'connector') });
  if (workspace > 0) chips.push({ key: 'workspace', label: plural(workspace, 'workspace context') });
  if (chips.length === 0) return null;
  return (
    <div className="chat-queued-send-chips">
      {chips.map((chip) => (
        <span key={chip.key} className="chat-queued-send-chip">
          {chip.label}
        </span>
      ))}
    </div>
  );
}
