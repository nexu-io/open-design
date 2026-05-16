import { redactSecrets } from './redact.js';

export interface ClaudeCliDiagnosticInput {
  agentId: string;
  exitCode?: number | null;
  signal?: string | null;
  stderrTail?: string | null;
  stdoutTail?: string | null;
  env?: Record<string, unknown> | null;
}

export interface ClaudeCliDiagnostic {
  message: string;
  detail: string;
  retryable: boolean;
}

function envValue(
  env: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!env) return null;
  const found = Object.keys(env).find((k) => k.toUpperCase() === key);
  if (!found) return null;
  const value = env[found];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function body(input: ClaudeCliDiagnosticInput): string {
  return [input.stderrTail, input.stdoutTail]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n');
}

function withContext(
  message: string,
  detail: string,
  input: ClaudeCliDiagnosticInput,
): ClaudeCliDiagnostic {
  const configDir = envValue(input.env, 'CLAUDE_CONFIG_DIR');
  const baseUrl = envValue(input.env, 'ANTHROPIC_BASE_URL');
  const diagnosticTail = redactSecrets(body(input)).replace(/\s+/g, ' ').trim().slice(-240);
  const context: string[] = [message, detail];
  if (diagnosticTail) context.push(`Claude output: ${diagnosticTail}`);
  if (configDir) context.push(`Effective CLAUDE_CONFIG_DIR: ${configDir}.`);
  if (baseUrl) context.push('ANTHROPIC_BASE_URL is set for this Claude Code process.');
  return {
    message: redactSecrets(message),
    detail: redactSecrets(context.filter(Boolean).join(' ')),
    retryable: true,
  };
}

export function diagnoseClaudeCliFailure(
  input: ClaudeCliDiagnosticInput,
): ClaudeCliDiagnostic | null {
  if (input.agentId !== 'claude') return null;
  if (input.exitCode === 0 && !input.signal) return null;

  const text = body(input);
  const normalized = text.toLowerCase();
  const hasCustomBaseUrl = envValue(input.env, 'ANTHROPIC_BASE_URL') !== null;
  const hasConfigDir = envValue(input.env, 'CLAUDE_CONFIG_DIR') !== null;

  const authFailure =
    /\b401\b/.test(text) ||
    /apikeysource["'\s:]+none/i.test(text) ||
    /(auth|oauth|credential|token).*(fail|invalid|missing|expired|not found|none|unauthorized)/i.test(text) ||
    /(unauthorized|invalid api key|missing api key|could not authenticate|authentication failed)/i.test(text);
  if (authFailure && hasCustomBaseUrl) {
    return withContext(
      'Claude Code could not authenticate with the configured custom Anthropic endpoint.',
      'Check ANTHROPIC_BASE_URL, proxy credentials, endpoint authentication environment, and model access. Remove the custom endpoint only if you want to retry with standard Claude Code auth.',
      input,
    );
  }
  if (authFailure) {
    const configHint = hasConfigDir
      ? 'The configured Claude config directory may contain stale or expired auth state.'
      : 'If you use multiple Claude profiles, set CLAUDE_CONFIG_DIR in Settings so Open Design spawns the same profile that works in your terminal.';
    return withContext(
      'Claude Code could not authenticate. Run `claude`, use `/login`, then retry the Open Design request.',
      `The spawned Claude Code process exited before producing a response. ${configHint}`,
      input,
    );
  }

  const modelUnavailable =
    /selected model is not available/i.test(text) ||
    /current plan or region/i.test(text) ||
    /(model).*(not available|not supported|unsupported|not found|not have access|no access)/i.test(text);
  if (modelUnavailable && hasCustomBaseUrl) {
    return withContext(
      'Claude Code could not access the selected model through the configured custom endpoint.',
      'The custom ANTHROPIC_BASE_URL or proxy may not expose the model Claude Code selected. Change the model, fix the endpoint/proxy, or remove ANTHROPIC_BASE_URL and retry with standard Claude Code auth.',
      input,
    );
  }

  const windowsCredentialMismatch =
    /credential manager/i.test(text) ||
    /\bwsl\b/i.test(text) ||
    /powershell/i.test(text) ||
    /native windows/i.test(text);
  if (windowsCredentialMismatch) {
    return withContext(
      'Claude Code appears to be using credentials from a different local environment.',
      'Re-authenticate Claude Code in the same Windows, WSL, or shell environment that Open Design uses. On native Windows, check Windows Credential Manager if `/login` does not repair the session.',
      input,
    );
  }

  const configStateFailure =
    /(config|profile|session|credential|oauth)/i.test(text) &&
    /(stale|corrupt|expired|different|missing|not found|invalid)/i.test(text);
  if (configStateFailure) {
    const message = hasConfigDir
      ? 'Claude Code failed while using the configured Claude profile.'
      : 'Claude Code may be using a different or stale local profile than your terminal.';
    const detail = hasConfigDir
      ? 'Re-run `claude` and `/login` for that profile, then retry Open Design.'
      : 'Run `claude` and `/login`, or set CLAUDE_CONFIG_DIR in Settings when you use multiple Claude profiles.';
    return withContext(message, detail, input);
  }

  if (!text.trim() && input.exitCode === 1 && hasCustomBaseUrl) {
    return withContext(
      'Claude Code exited before producing diagnostics while using a custom Anthropic endpoint.',
      'Check ANTHROPIC_BASE_URL, proxy credentials, endpoint authentication environment, and model access. Remove the custom endpoint only if you want to retry with standard Claude Code auth.',
      input,
    );
  }

  if (!text.trim() && input.exitCode === 1) {
    const message = hasConfigDir
      ? 'Claude Code exited before producing diagnostics while using the configured Claude profile.'
      : 'Claude Code exited before producing diagnostics.';
    const detail = hasConfigDir
      ? 'Re-run `claude` and `/login` for that profile, then retry Open Design.'
      : 'Run `claude`, use `/login`, and retry. If you use multiple Claude profiles, set CLAUDE_CONFIG_DIR in Settings so Open Design uses the same profile as your terminal.';
    return withContext(
      message,
      detail,
      input,
    );
  }

  if (normalized.includes('anthropic_base_url') && hasCustomBaseUrl) {
    return withContext(
      'Claude Code failed while using a custom Anthropic endpoint.',
      'Check the ANTHROPIC_BASE_URL endpoint, proxy, model access, and authentication settings, then retry.',
      input,
    );
  }

  return null;
}
