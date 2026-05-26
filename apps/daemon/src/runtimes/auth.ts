import { execAgentFile } from './invocation.js';
import type { RuntimeEnv } from './types.js';

export type AgentAuthProbeResult = {
  status: 'ok' | 'missing' | 'unknown';
  message?: string;
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
    const output = `${stdout ?? ''}\n${stderr ?? ''}`;
    if (isCursorAuthFailureText(output)) {
      return { status: 'missing', message: cursorAuthGuidance() };
    }
    return { status: 'ok' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: unknown;
      stderr?: unknown;
    };
    const output = [
      err.message,
      typeof err.stdout === 'string' ? err.stdout : '',
      typeof err.stderr === 'string' ? err.stderr : '',
    ].join('\n');
    if (isCursorAuthFailureText(output)) {
      return { status: 'missing', message: cursorAuthGuidance() };
    }
    return {
      status: 'unknown',
      message: 'Cursor Agent authentication status could not be verified with `cursor-agent status`.',
    };
  }
}
