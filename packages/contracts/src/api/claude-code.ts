export interface ClaudeCodeMcpServer {
  name: string;
  source: 'user' | 'plugin';
  pluginName?: string;
  pluginVersion?: string;
  transport: 'stdio' | 'sse' | 'http' | 'unknown';
  command?: string;
  url?: string;
}

export interface ClaudeCodeSkill {
  id: string;
  source: 'user' | 'plugin';
  pluginName?: string;
  pluginVersion?: string;
  description?: string;
  path: string;
}

export interface ClaudeCodeInstalledMcpServersResponse {
  available: boolean;
  servers: ClaudeCodeMcpServer[];
}

export interface ClaudeCodeInstalledSkillsResponse {
  available: boolean;
  skills: ClaudeCodeSkill[];
}
