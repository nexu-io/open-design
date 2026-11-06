import type { McpAuthMode, McpServerConfig, McpTransport } from './mcp-config.js';
import type { RuntimeAgentDef } from './runtimes/types.js';
import { sanitizeMcpConfig, sanitizeMcpServer } from './mcp-config.js';

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

export type RunToolBundleParseResult =
  | { ok: true; bundle: RunToolBundle }
  | { ok: false; message: string };

export type RunToolBundleValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export type RunToolBundleDeliveryTarget =
  | 'managed-project'
  | 'external-project'
  | 'none';

export interface RunToolBundleValidationOptions {
  deliveryTarget?: RunToolBundleDeliveryTarget;
}

type RunToolBundleAgent = Pick<
  RuntimeAgentDef,
  'id' | 'name' | 'externalMcpInjection'
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function agentLabel(agent: RunToolBundleAgent): string {
  return agent.name ? `${agent.name} (${agent.id})` : agent.id;
}

export function normalizeRunToolBundleForRun(raw: unknown): RunToolBundle {
  if (!isPlainObject(raw)) return { mcpServers: [] };
  return {
    mcpServers: sanitizeMcpConfig({ servers: raw.mcpServers }).servers,
  };
}

export function parseRunToolBundleForRequest(raw: unknown): RunToolBundleParseResult {
  if (raw == null) return { ok: true, bundle: { mcpServers: [] } };
  if (!isPlainObject(raw)) {
    return { ok: false, message: 'toolBundle must be an object' };
  }
  if (raw.mcpServers == null) return { ok: true, bundle: { mcpServers: [] } };
  if (!Array.isArray(raw.mcpServers)) {
    return { ok: false, message: 'toolBundle.mcpServers must be an array' };
  }

  const seen = new Set<string>();
  const servers: McpServerConfig[] = [];
  for (const [index, entry] of raw.mcpServers.entries()) {
    const server = sanitizeMcpServer(entry);
    if (!server) {
      return {
        ok: false,
        message: `toolBundle.mcpServers[${index}] is invalid`,
      };
    }
    if (seen.has(server.id)) {
      return {
        ok: false,
        message: `toolBundle.mcpServers[${index}] duplicates server id "${server.id}"`,
      };
    }
    seen.add(server.id);
    servers.push(server);
  }
  return { ok: true, bundle: { mcpServers: servers } };
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

export function validateRunToolBundleForAgent(
  bundle: RunToolBundle | null | undefined,
  agent: RunToolBundleAgent | null | undefined,
  options: RunToolBundleValidationOptions = {},
): RunToolBundleValidationResult {
  const servers = Array.isArray(bundle?.mcpServers) ? bundle.mcpServers : [];
  const enabledServers = servers.filter((server) => server.enabled);
  if (enabledServers.length === 0) return { ok: true };
  if (!agent) {
    return {
      ok: false,
      message: 'toolBundle requires a supported agentId',
    };
  }

  if (agent.externalMcpInjection === 'claude-mcp-json') {
    if (options.deliveryTarget && options.deliveryTarget !== 'managed-project') {
      return {
        ok: false,
        message:
          `${agentLabel(agent)} receives run-scoped MCP tool bundles through project .mcp.json, ` +
          'so toolBundle requires a daemon-managed project',
      };
    }
    return { ok: true };
  }

  if (agent.externalMcpInjection === 'opencode-env-content' || agent.externalMcpInjection === 'mimo-env-content') {
    return { ok: true };
  }

  if (agent.externalMcpInjection === 'acp-merge') {
    const unsupported = servers.findIndex(
      (server) => server.enabled && server.transport !== 'stdio',
    );
    if (unsupported === -1) return { ok: true };
    return {
      ok: false,
      message:
        `toolBundle.mcpServers[${unsupported}] uses ${servers[unsupported]?.transport} transport, ` +
        `but ${agentLabel(agent)} only supports stdio run-scoped MCP servers`,
    };
  }

  return {
    ok: false,
    message: `${agentLabel(agent)} does not support run-scoped MCP tool bundles`,
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
