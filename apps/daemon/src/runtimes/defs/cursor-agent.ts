import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';
import type { RuntimeModelOption } from '../types.js';

export function parseCursorAgentModels(stdout: string): RuntimeModelOption[] | null {
  const lines = String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (lines.length === 0) return null;

  const out = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);
  for (const line of lines) {
    if (/^(available models|models)$/i.test(line)) continue;

    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9._/:@-]*)(?:\s+-\s+(.+))?$/);
    if (!match) continue;
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const label = match[2]?.trim() || id;
    out.push({ id, label });
  }

  return out.length > 1 ? out : null;
}

export const cursorAgentDef = {
    id: 'cursor-agent',
    name: 'Cursor Agent',
    bin: 'cursor-agent',
    versionArgs: ['--version'],
    // `cursor-agent models` prints account-bound model ids per line. When
    // the user isn't authed it prints "No models available for this
    // account." — that's not a model list, so we detect it and fall back.
    listModels: {
      args: ['models'],
      timeoutMs: 5000,
      parse: (stdout) => {
        const trimmed = String(stdout || '').trim();
        if (!trimmed || /no models available/i.test(trimmed)) return null;
        return parseCursorAgentModels(trimmed);
      },
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'auto', label: 'auto' },
      { id: 'sonnet-4', label: 'sonnet-4' },
      { id: 'sonnet-4-thinking', label: 'sonnet-4-thinking' },
      { id: 'gpt-5', label: 'gpt-5' },
    ],
    // Cursor Agent does not use `-` as a "read prompt from stdin" sentinel.
    // Passing it makes the CLI treat the dash as the literal user prompt,
    // which then surfaces as "your message only contains '-'". Keep stdin
    // piped for prompt delivery, but do not append a fake prompt arg.
    buildArgs: (
      _prompt,
      _imagePaths,
      _extra,
      options = {},
      runtimeContext = {},
    ) => {
      const args = [];
      args.push(
        '--print',
        '--output-format',
        'stream-json',
        '--stream-partial-output',
        '--force',
        '--trust',
      );
      if (runtimeContext.cwd) {
        args.push('--workspace', runtimeContext.cwd);
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      // Resume the CLI's own chat across turns so it keeps working memory and
      // the daemon can skip resending the full transcript (resumesSessionViaCli
      // gate in server.ts). cursor-agent has no `--session-id`: it mints its
      // own id on the create turn (captured from the event stream and stored by
      // the daemon), so we only pass `--resume <chatId>` when a stored id
      // exists — never the daemon-minted `newSessionId`, which the CLI would
      // silently treat as a fresh chat.
      if (typeof runtimeContext.resumeSessionId === 'string' && runtimeContext.resumeSessionId) {
        args.push('--resume', runtimeContext.resumeSessionId);
      }
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'cursor-agent',
    // cursor-agent's CLI carries multi-turn memory via `--resume <chatId>`.
    // The daemon captures the emitted `session_id` (see json-event-stream.ts /
    // server.ts capturedAgentCliSessionId) and replays it next turn, which
    // lets composeChatUserRequestForAgent skip the transcript on follow-ups.
    resumesSessionViaCli: true,
    // `cursor-agent status` is a cheap, side-effect-free auth check. Declaring
    // it here is what makes detection surface an "auth required" badge for
    // Cursor Agent (the generalized probe only runs for adapters that opt in).
    authProbe: { args: ['status'], timeoutMs: 5000 },
} satisfies RuntimeAgentDef;
