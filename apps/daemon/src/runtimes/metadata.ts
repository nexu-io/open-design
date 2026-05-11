/** HTTPS links for the web UI when an agent is unavailable. Keys match `AGENT_DEFS[].id`. */
const AGENT_INSTALL_LINKS: Record<
  string,
  { installUrl?: string; docsUrl?: string }
> = {
  claude: {
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
  },
  codex: {
    installUrl: 'https://github.com/openai/codex',
    docsUrl: 'https://developers.openai.com/codex',
  },
  devin: {
    installUrl: 'https://cli.devin.ai/docs',
    docsUrl: 'https://docs.devin.ai',
  },
  gemini: {
    installUrl: 'https://github.com/google-gemini/gemini-cli',
    docsUrl: 'https://github.com/google-gemini/gemini-cli/blob/main/README.md',
  },
  opencode: {
    installUrl: 'https://opencode.ai/docs',
    docsUrl: 'https://github.com/sst/opencode',
  },
  hermes: {
    installUrl: 'https://github.com/nexu-io/open-design/blob/main/docs/agent-adapters.md',
    docsUrl: 'https://hermes-agent.nousresearch.com/docs/',
  },
  kimi: {
    installUrl: 'https://github.com/MoonshotAI/kimi-cli',
    docsUrl: 'https://www.kimi.com/code/docs/en/kimi-cli/guides/getting-started.html',
  },
  'cursor-agent': {
    installUrl: 'https://cursor.com/docs/cli/overview',
    docsUrl: 'https://docs.cursor.com/en/cli/overview',
  },
  qwen: {
    installUrl: 'https://github.com/QwenLM/qwen-code',
    docsUrl: 'https://qwenlm.github.io/qwen-code-docs/en/index',
  },
  qoder: {
    installUrl: 'https://qoder.com/download',
    docsUrl: 'https://docs.qoder.com',
  },
  copilot: {
    installUrl: 'https://github.com/github/copilot-cli',
    docsUrl: 'https://docs.github.com/en/copilot/how-tos/use-copilot-extensions/use-in-cli',
  },
  pi: {
    installUrl: 'https://github.com/nexu-io/open-design/blob/main/docs/agent-adapters.md',
    docsUrl: 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md',
  },
  kiro: {
    installUrl: 'https://kiro.dev',
    docsUrl: 'https://kiro.dev/docs/cli/',
  },
  kilo: {
    installUrl: 'https://kilo.ai',
    docsUrl: 'https://kilo.ai/docs/cli',
  },
  vibe: {
    installUrl: 'https://docs.mistral.ai',
    docsUrl: 'https://github.com/mistralai/vibe-acp',
  },
  deepseek: {
    installUrl: 'https://github.com/deepseek-ai/DeepSeek-TUI',
    docsUrl: 'https://github.com/deepseek-ai/DeepSeek-TUI/blob/main/README.md',
  },
};

function sanitizeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function installMetaForAgent(
  agentId: string,
): { installUrl?: string; docsUrl?: string } {
  const meta = AGENT_INSTALL_LINKS[agentId];
  if (!meta) return {};
  const installUrl = sanitizeHttpsUrl(meta.installUrl);
  const docsUrl = sanitizeHttpsUrl(meta.docsUrl);
  return {
    ...(installUrl ? { installUrl } : {}),
    ...(docsUrl ? { docsUrl } : {}),
  };
}
