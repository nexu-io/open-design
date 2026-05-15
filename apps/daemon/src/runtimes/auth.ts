import { execAgentFile } from './invocation.js';
import type { RuntimeEnv } from './types.js';

export type AgentAuthProbeResult = {
  status: 'ok' | 'missing' | 'unknown';
  message?: string;
};

const CURSOR_AUTH_GUIDANCE =
  'Cursor Agent is not authenticated. Run `cursor-agent login`, then `cursor-agent status`, and retry. For automation, ensure CURSOR_API_KEY is set in the Open Design process environment.';

export function cursorAuthGuidance(): string {
  return CURSOR_AUTH_GUIDANCE;
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

export function classifyAgentAuthFailure(
  agentId: string,
  text: string,
): AgentAuthProbeResult | null {
  if (agentId !== 'cursor-agent') return null;
  if (!isCursorAuthFailureText(text)) return null;
  return {
    status: 'missing',
    message: cursorAuthGuidance(),
  };
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
