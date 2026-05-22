import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// OpenClaw runs as a long-lived gateway daemon; `openclaw acp` is the official
// ACP bridge that translates JSON-RPC stdio into a gateway session. This lets
// OD treat OpenClaw like any other ACP-native agent (Hermes/Kimi/Kilo/Kiro/
// Vibe/Devin), without writing a custom shim.
//
// OpenClaw brings its own tools (web_search, web_fetch, image, sub-agents,
// memory, channels, etc.) which become available to OD's design loop on top
// of whatever model the gateway is configured to call.
//
// Docs: https://docs.openclaw.ai/cli/acp
export const openclawAgentDef = {
  id: 'openclaw',
  name: 'OpenClaw',
  // Use a small Node wrapper instead of `openclaw` directly: OD's ACP runner
  // closes stdin too aggressively (it does `child.stdin.end()` right after
  // writing each JSON-RPC frame), which makes OpenClaw's ACP bridge see a
  // disconnected client mid-`session/new` and reply with
  // `{code:-32603,message:"Internal error",data:{details:"ACP connection closed"}}`.
  //
  // `openclaw-acp-shim` (at ~/bin) forwards stdin to `openclaw acp ...` but
  // never propagates EOF, keeping the bridge happy until the child exits.
  // The shim version request still works because it exec's `openclaw` with
  // whatever argv we pass — so `openclaw-acp-shim --version` prints the
  // real OpenClaw version. We don't override `versionArgs` because OD's
  // detection runs that against `bin` directly.
  bin: 'openclaw-acp-shim',
  fallbackBins: ['openclaw'],
  versionArgs: ['--version'],
  // `openclaw acp` enumerates the gateway's configured model providers via the
  // standard ACP initialize handshake. The default session targets the main
  // agent session; users can override per-project via `OD_OPENCLAW_SESSION`.
  fetchModels: async (resolvedBin, env) =>
    detectAcpModels({
      bin: resolvedBin,
      args: ['acp', '--session', env.OD_OPENCLAW_SESSION || 'agent:main:main'],
      env,
      timeoutMs: 15_000,
      defaultModelOption: DEFAULT_MODEL_OPTION,
    }),
  // Surfaced as model picker hints if the live probe above fails (e.g. the
  // gateway daemon isn't running yet). The actual model is selected by
  // OpenClaw's own routing config, so `default` is the most useful entry.
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    {
      id: 'anthropic/claude-opus-4-5',
      label: 'claude-opus-4-5 (Anthropic via OpenClaw)',
    },
    {
      id: 'anthropic/claude-sonnet-4-5',
      label: 'claude-sonnet-4-5 (Anthropic via OpenClaw)',
    },
    {
      id: 'anthropic/claude-haiku-4-5',
      label: 'claude-haiku-4-5 (Anthropic via OpenClaw)',
    },
  ],
  buildArgs: (_prompt, _imagePaths, _extraAllowedDirs, options, runtimeContext) => {
    // Read `OD_OPENCLAW_SESSION` from the merged spawn env passed in
    // via `runtimeContext.env`, not from `process.env`. PR #2556
    // review (Siri-Ray): `fetchModels` above reads the merged env, so
    // the model probe enumerated session A; reading `process.env`
    // here would silently fall back to `agent:main:main` whenever the
    // user configured the override through OD's per-agent env
    // settings rather than the daemon's own launch env, routing real
    // chat work to a different gateway session than discovery did.
    //
    // Fall back to `process.env` for backwards compatibility — older
    // server.ts revisions don't populate `runtimeContext.env`, and
    // `connectionTest.ts` / `memory-llm.ts` still pass `{ cwd }`
    // only. Final fallback is the canonical default session.
    const session =
      runtimeContext?.env?.OD_OPENCLAW_SESSION ||
      process.env.OD_OPENCLAW_SESSION ||
      'agent:main:main';
    const args = ['acp', '--session', session];
    if (options?.model && options.model !== 'default') {
      // Forward chosen model id as a `--model` override for the agent turn.
      args.push('--model', options.model);
    }
    return args;
  },
  streamFormat: 'acp-json-rpc',
  // OpenClaw's ACP bridge does NOT accept per-session MCP servers. The
  // bridge surfaces the gateway's already-configured MCP layer to every
  // session. Passing `mcpServers` in `session/new` makes OpenClaw reply
  // with `-32603 Internal error: ACP bridge mode does not support per-session
  // MCP servers. Configure MCP on the OpenClaw gateway or agent instead.`
  // → leave `externalMcpInjection` and `mcpDiscovery` UNSET so OD never
  // attaches its `open-design-live-artifacts` MCP descriptor. This costs
  // OD's live-artifact write-back path, but the chat still runs end-to-end
  // and OpenClaw's own tools (web_search, web_fetch, image, sub-agents)
  // remain available.
  // mcpDiscovery: 'mature-acp',           // disabled
  // externalMcpInjection: 'acp-merge',    // disabled — see above
  installUrl: 'https://github.com/openclaw/openclaw',
  docsUrl: 'https://docs.openclaw.ai/cli/acp',
} satisfies RuntimeAgentDef;
