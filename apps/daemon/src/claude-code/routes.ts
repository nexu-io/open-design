import os from 'node:os';
import path from 'node:path';

import type {
  ClaudeCodeInstalledMcpServersResponse,
  ClaudeCodeInstalledSkillsResponse,
  ClaudeCodeMcpServer,
  ClaudeCodeSkill,
} from '@open-design/contracts';
import type { Express } from 'express';

import {
  detectAvailability,
  readPluginMcpServers,
  readPluginSkills,
  readUserMcpServers,
  readUserSkills,
} from './reader.js';

function resolveHome(): string {
  return process.env.OD_CLAUDE_HOME ?? path.join(os.homedir(), '.claude');
}

function sortMcp(a: ClaudeCodeMcpServer, b: ClaudeCodeMcpServer): number {
  if (a.source !== b.source) return a.source === 'user' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function sortSkill(a: ClaudeCodeSkill, b: ClaudeCodeSkill): number {
  if (a.source !== b.source) return a.source === 'user' ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export function registerClaudeCodeRoutes(app: Express): void {
  app.get('/api/claude-code/mcp-servers', (_req, res) => {
    const home = resolveHome();
    if (!detectAvailability(home)) {
      const payload: ClaudeCodeInstalledMcpServersResponse = { available: false, servers: [] };
      res.json(payload);
      return;
    }
    const servers = [...readUserMcpServers(home), ...readPluginMcpServers(home)].sort(sortMcp);
    const payload: ClaudeCodeInstalledMcpServersResponse = { available: true, servers };
    res.json(payload);
  });

  app.get('/api/claude-code/skills', (_req, res) => {
    const home = resolveHome();
    if (!detectAvailability(home)) {
      const payload: ClaudeCodeInstalledSkillsResponse = { available: false, skills: [] };
      res.json(payload);
      return;
    }
    const skills = [...readUserSkills(home), ...readPluginSkills(home)].sort(sortSkill);
    const payload: ClaudeCodeInstalledSkillsResponse = { available: true, skills };
    res.json(payload);
  });
}
