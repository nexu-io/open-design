import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Letta Code exposes its runtime through the standalone `letta-acp` ACP
// adapter. Do not probe models here: without LETTA_AGENT_ID the adapter can
// create a local agent while starting a session. Its own LETTA_ACP_MODEL
// setting remains the source of truth for the default model.
export const lettaAgentDef = {
  id: 'letta',
  name: 'Letta Code',
  bin: 'letta-acp',
  versionArgs: ['--version'],
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: () => [],
  streamFormat: 'acp-json-rpc',
  supportsImagePaths: true,
  mcpDiscovery: 'mature-acp',
  externalMcpInjection: 'acp-merge',
  // Letta returns its durable conversation id as ACP's `sessionId`; future
  // Open Design turns must drive `session/load` with that id.
  acpSessionIdIsDurable: true,
  resumesSessionViaAcpLoad: true,
} satisfies RuntimeAgentDef;
