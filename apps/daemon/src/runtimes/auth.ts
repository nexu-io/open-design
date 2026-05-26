import { execAgentFile } from './invocation.js';
import type { RuntimeEnv } from './types.js';

export type AgentAuthProbeResult = {
  status: 'ok' | 'missing' | 'unknown';
  message?: string;
  // Output captured from the probe child process (e.g.
  // `cursor-agent status`). Exposed so callers like the connection
  // test layer can fold the probe's own stderr/exit context into their
  // structured diagnostics — the probe runs before the smoke spawn,
  // so without this the diagnostics block would otherwise drop the
  // probe output entirely.
  stdoutTail?: string;
  stderrTail?: string;
  exitCode?: number | null;
  signal?: string | null;
};

const CURSOR_AUTH_GUIDANCE =
  'Cursor Agent is not authenticated. Run `cursor-agent login`, then `cursor-agent status`, and retry. For automation, ensure CURSOR_API_KEY is set in the Open Design process environment.';

const DEEPSEEK_AUTH_GUIDANCE =
  'DeepSeek TUI is installed but is not authenticated. Add or verify your API key in `~/.deepseek/config.toml` as `api_key = "..."`, or expose DEEPSEEK_API_KEY to the Open Design daemon process, then retry. If Open Design is launched outside an interactive shell, shell rc files such as ~/.zshrc may not be loaded.';

export function cursorAuthGuidance(): string {
  return CURSOR_AUTH_GUIDANCE;
}

export function deepseekAuthGuidance(): string {
  return DEEPSEEK_AUTH_GUIDANCE;
}

export function isCursorAuthFailureText(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  return (
    /authentication required/i.test(value) ||
    /not authenticated/i.test(value) ||
    /not logged in/i.test(value) ||
    /unauthenticated/i.test(value) ||
    /agent login/i.test(value) ||
    /cursor_api_key/i.test(value)
  );
}

export function isDeepSeekAuthFailureText(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  return (
    /KEY=<your-key>/i.test(value) ||
    /api_key\s*=\s*["']<your-key>["']/i.test(value) ||
    (/~\/\.deepseek\/config\.toml/i.test(value) && /api[_ -]?key|KEY=/i.test(value)) ||
    (/DEEPSEEK_API_KEY/i.test(value) &&
      /auth|api[_ -]?key|missing|not set|required|unauthorized/i.test(value))
  );
}

export function classifyAgentAuthFailure(
  agentId: string,
  text: string,
): AgentAuthProbeResult | null {
  if (agentId === 'cursor-agent') {
    if (!isCursorAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: cursorAuthGuidance(),
    };
  }
  if (agentId === 'deepseek') {
    if (!isDeepSeekAuthFailureText(text)) return null;
    return {
      status: 'missing',
      message: deepseekAuthGuidance(),
    };
  }
  return null;
}

// Tail length matches the smoke-test sink so the diagnostics block
// stays compact when it folds probe output back into its overrides.
const PROBE_TAIL_BYTES = 400;

function tailString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > PROBE_TAIL_BYTES ? trimmed.slice(-PROBE_TAIL_BYTES) : trimmed;
}

function withProbeTails(
  base: AgentAuthProbeResult,
  stdoutText: string,
  stderrText: string,
): AgentAuthProbeResult {
  const result: AgentAuthProbeResult = { ...base };
  const stdoutTail = tailString(stdoutText);
  const stderrTail = tailString(stderrText);
  if (stdoutTail) result.stdoutTail = stdoutTail;
  if (stderrTail) result.stderrTail = stderrTail;
  return result;
}

export async function probeAgentAuthStatus(
  agentId: string,
  resolvedBin: string,
  env: RuntimeEnv,
): Promise<AgentAuthProbeResult | null> {
  if (agentId !== 'cursor-agent') return null;
  try {
    const { stdout, stderr } = await execAgentFile(resolvedBin, ['status'], {
      env,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const stdoutText = typeof stdout === 'string' ? stdout : '';
    const stderrText = typeof stderr === 'string' ? stderr : '';
    const output = `${stdoutText}\n${stderrText}`;
    if (isCursorAuthFailureText(output)) {
      return withProbeTails(
        { status: 'missing', message: cursorAuthGuidance(), exitCode: 0, signal: null },
        stdoutText,
        stderrText,
      );
    }
    return { status: 'ok' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: unknown;
      stderr?: unknown;
      code?: string | number;
      signal?: string;
    };
    const stdoutText = typeof err.stdout === 'string' ? err.stdout : '';
    const stderrText = typeof err.stderr === 'string' ? err.stderr : '';
    const output = [err.message, stdoutText, stderrText].join('\n');
    // util.promisify(execFile) attaches `code` and `signal` to the
    // rejection error. `code` may be a number (real non-zero exit) or
    // a Node ErrnoException string ("ENOENT"); only the numeric form
    // is meaningful as an exit code.
    const numericExit = typeof err.code === 'number' ? err.code : null;
    const childSignal = typeof err.signal === 'string' ? err.signal : null;
    if (isCursorAuthFailureText(output)) {
      return withProbeTails(
        {
          status: 'missing',
          message: cursorAuthGuidance(),
          exitCode: numericExit,
          signal: childSignal,
        },
        stdoutText,
        stderrText,
      );
    }
    return withProbeTails(
      {
        status: 'unknown',
        message: 'Cursor Agent authentication status could not be verified with `cursor-agent status`.',
        exitCode: numericExit,
        signal: childSignal,
      },
      stdoutText,
      stderrText,
    );
  }
}
