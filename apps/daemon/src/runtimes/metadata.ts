/** HTTPS links for the web UI when an agent is unavailable. Keys match `AGENT_DEFS[].id`. */
const AGENT_INSTALL_LINKS: Record<
  string,
  { installUrl?: string; docsUrl?: string }
> = {
  amp: {
    installUrl: 'https://ampcode.com/manual#install',
    docsUrl: 'https://ampcode.com/manual',
  },
  amr: {
    installUrl: 'https://open-design.ai/amr',
    docsUrl: 'https://github.com/nexu-io/open-design/blob/main/docs/new-agent-runtime-acp.md',
  },
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
  opencode: {
    installUrl: 'https://opencode.ai/docs',
    docsUrl: 'https://github.com/sst/opencode',
  },
  hermes: {
    installUrl: 'https://github.com/nexu-io/open-design/blob/main/docs/agent-adapters.md',
    docsUrl: 'https://hermes-agent.nousresearch.com/docs/',
  },
  'trae-cli': {
    installUrl: 'https://www.volcengine.com/docs/86677/2227861?lang=zh',
    docsUrl: 'https://www.volcengine.com/docs/86677/2227861?lang=zh',
  },
  kimi: {
    installUrl: 'https://github.com/MoonshotAI/kimi-cli',
    docsUrl: 'https://www.kimi.com/code/docs/en/kimi-cli/guides/getting-started.html?aff=open-design',
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
  mimo: {
    installUrl: 'https://mimo.ai',
    docsUrl: 'https://mimo.ai/docs',
  },
  vibe: {
    installUrl: 'https://docs.mistral.ai',
    docsUrl: 'https://github.com/mistralai/vibe-acp',
  },
  deepseek: {
    installUrl: 'https://github.com/Hmbown/CodeWhale',
    docsUrl: 'https://github.com/Hmbown/CodeWhale/blob/main/README.md',
  },
  codebuddy: {
    installUrl: 'https://www.codebuddy.cn',
    docsUrl: 'https://www.codebuddy.cn/docs/workbuddy/Overview',
  },
  atomcode: {
    installUrl: 'https://atomcode.atomgit.com/docs/en/quickstart.html',
    docsUrl: 'https://atomcode.atomgit.com/docs/en/index.html',
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
