import { DEFAULT_MODEL_OPTION, clampCodexReasoning } from './shared.js';
import type { RuntimeModelOption } from '../types.js';
import type { RuntimeAgentDef } from '../types.js';

export function parseCodexDebugModels(stdout: string): RuntimeModelOption[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(stdout || ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const models = (parsed as { models?: unknown }).models;
  if (!Array.isArray(models)) return null;

  const out = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);
  for (const raw of models) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as {
      slug?: unknown;
      id?: unknown;
      display_name?: unknown;
      name?: unknown;
      visibility?: unknown;
    };
    if (entry.visibility === 'hidden') continue;
    const id =
      typeof entry.slug === 'string'
        ? entry.slug.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.display_name === 'string' && entry.display_name.trim()
        ? entry.display_name.trim()
        : typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim()
          : id;
    out.push({ id, label });
  }
  return out.length > 1 ? out : null;
}

export function codexNeedsDangerFullAccessSandbox(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Operator override for deployments where Codex cannot create its
  // workspace-write sandbox, for example unprivileged Linux containers.
  // Only danger-full-access is accepted; unknown values keep the default path.
  if (env.OD_CODEX_SANDBOX?.trim() === 'danger-full-access') return true;
  if (platform === 'win32') return true;
  // WSL reports `linux` but Codex still hits the Windows read-only
  // workspace-write sandbox path when launched from there (#2834).
  return Boolean(env.WSL_DISTRO_NAME?.trim());
}

export const codexAgentDef = {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    versionArgs: ['--version'],
    // Codex exposes its installed model catalog through `debug models` on
    // recent CLIs. Older builds fall back to these static hints.
    listModels: {
      args: ['debug', 'models'],
      parse: parseCodexDebugModels,
      timeoutMs: 5000,
    },
    authProbe: {
      args: ['login', 'status'],
      timeoutMs: 5000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'gpt-5.5', label: 'gpt-5.5' },
      { id: 'gpt-5.4', label: 'gpt-5.4' },
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
      { id: 'gpt-5.1', label: 'gpt-5.1' },
      { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' },
      { id: 'gpt-5-codex', label: 'gpt-5-codex' },
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'o3', label: 'o3' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
    reasoningOptions: [
      { id: 'default', label: 'Default' },
      { id: 'none', label: 'None' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'XHigh' },
    ],
    // Prompt is delivered via stdin pipe (gated by `promptViaStdin: true`
    // below) to avoid Windows `spawn ENAMETOOLONG` while keeping Codex on
    // its structured JSON stream. Recent Codex CLI versions reject a bare
    // `-` argv sentinel — passing both the pipe and `-` produces
    // `error: unexpected argument '-' found` and the agent exits with
    // code 2 before any prompt is read (see issue #237). The pipe alone
    // is sufficient for stdin delivery.
    buildArgs: (
      _prompt,
      _imagePaths,
      extraAllowedDirs = [],
      options = {},
      runtimeContext = {},
    ) => {
      // Codex CLI's `workspace-write` sandbox blocks shell invocations on
      // Windows ("powershell.exe ... rejected: blocked by policy", #1721),
      // because Codex has no working OS-level sandbox on Windows and falls
      // back to a coarse policy that rejects any shell. macOS (Seatbelt)
      // and Linux (Landlock+seccomp) keep workspace-write because their
      // sandbox enforcement permits shell while restricting writes.
      const needsDangerFullAccess = codexNeedsDangerFullAccessSandbox();
      // Capture-style resume: when the daemon has a stored Codex thread id for
      // this conversation it asks the CLI to continue that session with
      // `exec resume <thread_id>` instead of `exec` (a fresh session). Codex
      // mints its own id, so the daemon does not specify one — it captures the
      // id from the create turn's `thread.started.thread_id` event (see the
      // json-event-stream `codex` parser) and replays it here on resume.
      const resumeSessionId =
        typeof runtimeContext.resumeSessionId === 'string' &&
        runtimeContext.resumeSessionId.length > 0
          ? runtimeContext.resumeSessionId
          : null;
      // `codex exec resume` rejects `--sandbox` (only valid on a fresh
      // `exec`); the sandbox mode must be passed as a `-c sandbox_mode=...`
      // config override. We mirror the exact same effective sandbox policy as
      // the create turn so Codex's per-turn `turn_context` block byte-matches
      // across turns and does not break the upstream prefix cache the resume
      // is meant to reuse.
      const sandboxArgs = needsDangerFullAccess
        ? resumeSessionId
          ? ['-c', 'sandbox_mode="danger-full-access"']
          : ['--sandbox', 'danger-full-access']
        : resumeSessionId
          ? [
              '-c',
              'sandbox_mode="workspace-write"',
              '-c',
              'sandbox_workspace_write.network_access=true',
            ]
          : [
              '--sandbox',
              'workspace-write',
              '-c',
              'sandbox_workspace_write.network_access=true',
            ];
      const args = resumeSessionId
        ? ['exec', 'resume', '--json', '--skip-git-repo-check', ...sandboxArgs]
        : ['exec', '--json', '--skip-git-repo-check', ...sandboxArgs];
      if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
        args.push('--disable', 'plugins');
      }
      // `-C <cwd>` and `--add-dir <dir>` are CREATE-only flags: `codex exec
      // resume` rejects both (`error: unexpected argument '-C' found`), so
      // appending them on a resume turn would make the follow-up turn die
      // before the first event. The daemon already spawns the child with
      // `cwd: effectiveCwd`, and resuming by explicit SESSION_ID does not use
      // codex's cwd-based session filtering, so the resumed turn still runs in
      // the right workspace without `-C`. The extra writable dirs were granted
      // when the session was created and are carried by the resumed session.
      if (!resumeSessionId) {
        if (runtimeContext.cwd) {
          args.push('-C', runtimeContext.cwd);
        }
        const dirs = (extraAllowedDirs || []).filter(
          (d) => typeof d === 'string' && d.length > 0,
        );
        for (const d of dirs) {
          args.push('--add-dir', d);
        }
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      if (options.reasoning && options.reasoning !== 'default') {
        const effort = clampCodexReasoning(options.model, options.reasoning);
        // Codex accepts `-c key=value` config overrides; reasoning effort
        // is exposed as `model_reasoning_effort`.
        args.push('-c', `model_reasoning_effort="${effort}"`);
      }
      // The resume thread id is the positional SESSION_ID argument of
      // `codex exec resume`; it must come after the flags. The prompt is
      // delivered via stdin (promptViaStdin), so the thread id is the final
      // argv entry.
      if (resumeSessionId) {
        args.push(resumeSessionId);
      }
      return args;
    },
    promptViaStdin: true,
    // Codex's CLI carries its own session across spawns: on a follow-up turn
    // the daemon resumes the captured thread id instead of re-sending the
    // flattened transcript, so the first upstream call reuses the warm prefix
    // cache. Capture-style: the resume handle is the `thread.started.thread_id`
    // captured from the stream, not a daemon-minted id.
    resumesSessionViaCli: true,
    capturesSessionIdFromStream: true,
    streamFormat: 'json-event-stream',
    eventParser: 'codex',
} satisfies RuntimeAgentDef;
