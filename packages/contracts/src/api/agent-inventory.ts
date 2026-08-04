export type AgentInventorySource = 'user';
export type AgentInventoryMcpTransport = 'stdio' | 'sse' | 'http' | 'unknown';
export type AgentInventoryReason = 'config_not_detected' | 'unsupported_agent';

export interface AgentInventoryMcpServer {
  id: string;
  name: string;
  source: AgentInventorySource;
  transport: AgentInventoryMcpTransport;
  description?: string;
}

export interface AgentInventorySkill {
  id: string;
  name: string;
  source: AgentInventorySource;
  description?: string;
}

export interface AgentInventoryResponse {
  agentId: string;
  supported: boolean;
  available: boolean;
  mcpServers: AgentInventoryMcpServer[];
  skills: AgentInventorySkill[];
  reason?: AgentInventoryReason;
  warnings?: string[];
}
