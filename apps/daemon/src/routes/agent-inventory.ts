import type { AgentInventoryResponse } from '@open-design/contracts';
import type { Express } from 'express';
import { agentCliEnvForAgent, readAppConfig } from '../app-config.js';
import { readClaudeInventory } from '../agent-inventory/claude.js';
import { spawnEnvForAgent } from '../runtimes/env.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterAgentInventoryRoutesDeps extends RouteDeps<'http' | 'paths'> {}

export async function readAgentInventoryForAgent(
  agentId: string,
  options: {
    configuredEnv?: Record<string, string>;
  } = {},
): Promise<AgentInventoryResponse> {
  const normalizedAgentId = agentId.trim().toLowerCase();
  if (normalizedAgentId === 'claude') {
    const env = spawnEnvForAgent('claude', process.env, options.configuredEnv ?? {});
    return readClaudeInventory({ env });
  }

  return {
    agentId: normalizedAgentId,
    supported: false,
    available: false,
    mcpServers: [],
    skills: [],
    reason: 'unsupported_agent',
  };
}

export function registerAgentInventoryRoutes(
  app: Express,
  ctx: RegisterAgentInventoryRoutesDeps,
): void {
  const { isLocalSameOrigin, resolvedPortRef, sendApiError } = ctx.http;
  const { RUNTIME_DATA_DIR } = ctx.paths;
  const getResolvedPort = () => resolvedPortRef.current;

  app.get('/api/agent-inventory/:agentId', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }

    const agentId = String(req.params.agentId || '').trim().toLowerCase();
    try {
      const appConfig = agentId === 'claude' ? await readAppConfig(RUNTIME_DATA_DIR) : null;
      return res.json(await readAgentInventoryForAgent(agentId, {
        configuredEnv: agentCliEnvForAgent(appConfig?.agentCliEnv, agentId),
      }));
    } catch (err) {
      return sendApiError(
        res,
        500,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : String(err),
      );
    }
  });
}
