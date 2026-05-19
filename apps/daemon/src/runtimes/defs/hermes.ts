import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const hermesAgentDef = {
    id: 'hermes',
    name: 'Hermes',
    bin: 'hermes',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp', '--accept-hooks'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    // Used only when `fetchModels` (which calls `hermes acp` to enumerate
    // the user's actually-installed providers) fails — e.g. Hermes isn't on
    // PATH yet. The list doubles as discovery hints in the model picker so a
    // user who hasn't installed Hermes still sees what becomes available
    // after `hermes auth add xai-oauth` (xAI · SuperGrok subscription) or
    // `hermes auth add openai` (Codex). Reference: https://x.ai/news/grok-hermes.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      // xAI Grok — available via SuperGrok OAuth (`hermes auth add xai-oauth`)
      // or XAI_API_KEY in `~/.hermes/.env`.
      { id: 'grok-4.3', label: 'grok-4.3 (xAI · default)' },
      {
        id: 'grok-4.20-reasoning',
        label: 'grok-4.20-reasoning (xAI · deep)',
      },
      {
        id: 'grok-4.20-0309-non-reasoning',
        label: 'grok-4.20-non-reasoning (xAI · fast)',
      },
      {
        id: 'grok-4.20-multi-agent-0309',
        label: 'grok-4.20-multi-agent (xAI · orchestration)',
      },
      // OpenAI Codex.
      { id: 'openai-codex:gpt-5.5', label: 'gpt-5.5 (openai-codex:gpt-5.5)' },
      { id: 'openai-codex:gpt-5.4', label: 'gpt-5.4 (openai-codex:gpt-5.4)' },
      {
        id: 'openai-codex:gpt-5.4-mini',
        label: 'gpt-5.4-mini (openai-codex:gpt-5.4-mini)',
      },
    ],
    buildArgs: () => ['acp', '--accept-hooks'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
} satisfies RuntimeAgentDef;
