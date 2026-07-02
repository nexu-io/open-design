import { DEFAULT_MODEL_OPTION, parseLineSeparatedModels } from './shared.js';
import { agentCapabilities } from '../capabilities.js';
import type { RuntimeAgentDef } from '../types.js';

const SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';

export const opencodeAgentDef = {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode-cli',
    fallbackBins: ['opencode'],
    versionArgs: ['--version'],
    helpArgs: ['run', '--help'],
    capabilityFlags: {
      [SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    },
    // `opencode models` prints `provider/model` per line. Real-world
    // `opencode models` calls can take >8s (network round-trip to the
    // provider registry), so the previous 8s budget timed out and fell back
    // to the hardcoded `fallbackModels`, hiding the user's actual catalog.
    // 15s matches the listModels budget the rest of the agent defs use
    // (devin, hermes, kiro, kilo, kimi, trae-cli, vibe, reasonix).
    listModels: {
      args: ['models'],
      parse: parseLineSeparatedModels,
      timeoutMs: 15_000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'anthropic/claude-sonnet-4-5',
      },
      { id: 'openai/gpt-5', label: 'openai/gpt-5' },
      { id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
    ],
    // OpenCode's CLI help currently exposes model selection and session
    // controls, but not an explicit per-run reasoning / effort flag. Keep
    // `reasoningOptions` undefined and do not synthesize argv for
    // `options.reasoning`; that would advertise a control the adapter cannot
    // actually pass through. See issue #2828.
    //
    // Prompt delivered via stdin (`opencode run` with no message argv) to
    // avoid Windows `spawn ENAMETOOLONG` while preserving OpenCode's
    // structured stream. A literal `-` is parsed as a positional message by
    // OpenCode 1.14.x and can surface as "Session not found".
    buildArgs: (_prompt, _imagePaths, _extra, options = {}, runtimeContext = {}) => {
      const args = [
        'run',
        '--format',
        'json',
      ];
      if (agentCapabilities.get('opencode')?.skipPermissions) {
        args.push(SKIP_PERMISSIONS_FLAG);
      }
      // Capture-style resume: OpenCode mints its own session id (reported on
      // the stream as `sessionID`, e.g. `ses_...`). On a follow-up turn the
      // daemon continues that session with `-s <id>` instead of re-sending the
      // flattened transcript, so the first upstream call reuses the warm prefix
      // cache. `-s` continues an EXISTING session (the create turn passes no id
      // and we capture the one OpenCode generated), mirroring codex.
      const resumeSessionId =
        typeof runtimeContext.resumeSessionId === 'string' &&
        runtimeContext.resumeSessionId.length > 0
          ? runtimeContext.resumeSessionId
          : null;
      if (resumeSessionId) {
        args.push('-s', resumeSessionId);
      }
      if (options.model && options.model !== 'default') {
        args.push('-m', options.model);
      }
      return args;
    },
    promptViaStdin: true,
    // OpenCode's CLI carries its own session across spawns: on a follow-up turn
    // the daemon resumes the captured session id (`-s <id>`) instead of
    // re-flattening the transcript. Capture-style — the resume handle is the
    // `sessionID` captured from the stream, not a daemon-minted id.
    resumesSessionViaCli: true,
    capturesSessionIdFromStream: true,
    streamFormat: 'json-event-stream',
    eventParser: 'opencode',
    // OpenCode reads MCP servers from its layered config (global ~/.config
    // /opencode/opencode.json + project opencode.json + OPENCODE_CONFIG
    // + OPENCODE_CONFIG_CONTENT). The env-var form lets the daemon hand
    // user-configured external MCP servers to a single `opencode run`
    // invocation without polluting the user's saved config files. See
    // <https://opencode.ai/docs/config> and issue #2142.
    externalMcpInjection: 'opencode-env-content',
} satisfies RuntimeAgentDef;
