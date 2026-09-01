import os from 'node:os';
import path from 'node:path';

import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

export function parsePrimeAgentModels(stdout: string): RuntimeModelOption[] {
  const models: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>();
  for (const rawLine of String(stdout || '').split('\n')) {
    const columns = rawLine.trim().split(/\s+/);
    if (columns.length < 2 || columns[0]?.toLowerCase() === 'provider') continue;
    const provider = columns[0];
    const model = columns[1];
    if (!provider || !model || /^[-─]+$/.test(provider)) continue;
    const id = `${provider}/${model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({ id, label: id });
  }
  return models;
}

export const primeAgentDef = {
  id: 'prime-agent',
  name: 'Prime Agent',
  bin: 'prime-agent',
  versionArgs: ['--version'],
  listModels: {
    args: ['model', 'list'],
    parse: parsePrimeAgentModels,
    timeoutMs: 15_000,
  },
  fallbackModels: [DEFAULT_MODEL_OPTION],
  reasoningOptions: [
    DEFAULT_MODEL_OPTION,
    { id: 'off', label: 'Off' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'Extra high' },
    { id: 'max', label: 'Maximum' },
  ],
  buildArgs: (_prompt, _images, _dirs, options = {}, runtimeContext = {}) => {
    const args = ['--mode', 'rpc'];
    if (runtimeContext.cwd) args.push('--cwd', runtimeContext.cwd);
    if (runtimeContext.piRpcSessionDir) {
      args.push('--session-dir', runtimeContext.piRpcSessionDir);
    }
    if (runtimeContext.resumeSessionId) args.push('--resume', runtimeContext.resumeSessionId);
    if (options.model && options.model !== 'default') {
      const slash = options.model.indexOf('/');
      if (slash > 0 && slash < options.model.length - 1) {
        args.push('--provider', options.model.slice(0, slash));
        args.push('--model', options.model.slice(slash + 1));
      } else {
        args.push('--model', options.model);
      }
    }
    if (options.reasoning && options.reasoning !== 'default') {
      args.push('--thinking', options.reasoning);
    }
    return args;
  },
  // Prime's ACP server advertises loadSession=false. Its CLI can reopen the
  // same JSONL session in RPC mode with `--resume`; using pi's
  // `new_session(parentSession)` instead would fork another native session.
  streamFormat: 'pi-rpc',
  piRpcSessionDir: path.join(os.homedir(), '.prime', 'agent', 'sessions'),
  piRpcResumeViaProcessArgs: true,
  supportsImagePaths: true,
  mcpDiscovery: 'mature-acp',
  externalMcpInjection: 'acp-merge',
  installUrl: 'https://github.com/PrimeIntellect-ai/prime-agent',
  docsUrl: 'https://github.com/PrimeIntellect-ai/prime-agent',
} satisfies RuntimeAgentDef;
