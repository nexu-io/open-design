import type { McpAuthMode, McpServerConfig, McpTransport } from './mcp-config.js';
import { sanitizeMcpConfig } from './mcp-config.js';

export interface RunToolBundle {
  mcpServers: McpServerConfig[];
}

export interface RunToolBundleSummary {
  mcpServers: Array<{
    id: string;
    label?: string;
    templateId?: string;
    transport: McpTransport;
    enabled: boolean;
    authMode?: McpAuthMode;
  }>;
}

export interface ExternalMcpSelection {
  enabledServers: McpServerConfig[];
  persistedTokenServerIds: Set<string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeRunToolBundleForRun(raw: unknown): RunToolBundle {
  if (!isPlainObject(raw)) return { mcpServers: [] };
  return {
    mcpServers: sanitizeMcpConfig({ servers: raw.mcpServers }).servers,
  };
}

export function summarizeRunToolBundle(bundle: RunToolBundle | null | undefined): RunToolBundleSummary {
  const servers = Array.isArray(bundle?.mcpServers) ? bundle.mcpServers : [];
  return {
    mcpServers: servers.map((server) => ({
      id: server.id,
      ...(server.label ? { label: server.label } : {}),
      ...(server.templateId ? { templateId: server.templateId } : {}),
      transport: server.transport,
      enabled: server.enabled,
      ...(server.authMode ? { authMode: server.authMode } : {}),
    })),
  };
}

export function resolveExternalMcpServersForRun({
  persistedServers,
  runScopedServers,
  sandboxMode,
}: {
  persistedServers: McpServerConfig[];
  runScopedServers: McpServerConfig[];
  sandboxMode: boolean;
}): ExternalMcpSelection {
  const runScopedIds = new Set(runScopedServers.map((server) => server.id));
  const persistedForRun = sandboxMode ? [] : persistedServers;
  const byId = new Map<string, McpServerConfig>();

  for (const server of persistedForRun) byId.set(server.id, server);
  for (const server of runScopedServers) byId.set(server.id, server);

  const persistedTokenServerIds = new Set<string>();
  for (const server of persistedForRun) {
    if (!server.enabled) continue;
    if (runScopedIds.has(server.id)) continue;
    persistedTokenServerIds.add(server.id);
  }

  return {
    enabledServers: Array.from(byId.values()).filter((server) => server.enabled),
    persistedTokenServerIds,
  };
}
