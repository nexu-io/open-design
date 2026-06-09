import path from 'node:path';

import { redactSecrets } from './redact.js';

export interface ClaudeCliDiagnosticInput {
  agentId: string;
  exitCode?: number | null;
  signal?: string | null;
  stderrTail?: string | null;
  stdoutTail?: string | null;
  env?: Record<string, unknown> | null;
  resolvedBin?: string | null;
}

export interface ClaudeCliDiagnostic {
  message: string;
  detail: string;
  retryable: boolean;
  /**
   * Stable `ApiErrorCode` for this failure class, when one is more specific
   * than the generic `AGENT_EXECUTION_FAILED`. Lets the web map the code to a
   * localized message and lets triage count failures by class. Omitted for
   * branches that have no dedicated code yet.
   */
  code?: string;
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
  code?: string,
): ClaudeCliDiagnostic {
  const configDir = envValue(input.env, 'CLAUDE_CONFIG_DIR');
  const baseUrl = envValue(input.env, 'ANTHROPIC_BASE_URL');
  const runtimeLabel = selectedClaudeCompatibleRuntime(input) === 'openclaude'
    ? 'OpenClaude'
    : 'Claude Code';
  const diagnosticTail = redactSecrets(body(input)).replace(/\s+/g, ' ').trim().slice(-240);
  const context: string[] = [message, detail];
  if (diagnosticTail) context.push(`Claude output: ${diagnosticTail}`);
  if (configDir) context.push(`Effective CLAUDE_CONFIG_DIR: ${configDir}.`);
  if (baseUrl) context.push(`ANTHROPIC_BASE_URL is set for this ${runtimeLabel} process.`);
  return {
    message: redactSecrets(message),
    detail: redactSecrets(context.filter(Boolean).join(' ')),
    retryable: true,
    ...(code ? { code } : {}),
  };
}

function selectedClaudeCompatibleRuntime(input: ClaudeCliDiagnosticInput): 'claude' | 'openclaude' {
  if (typeof input.resolvedBin !== 'string' || !input.resolvedBin.trim()) return 'claude';
  const base = path
    .basename(input.resolvedBin.trim().replace(/\\/g, '/'))
    .replace(/\.(exe|cmd|bat)$/i, '')
    .toLowerCase();
  return base === 'openclaude' ? 'openclaude' : 'claude';
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
  const runtime = selectedClaudeCompatibleRuntime(input);
  const isOpenClaude = runtime === 'openclaude';
  const runtimeLabel = isOpenClaude ? 'OpenClaude' : 'Claude Code';
  const defaultEndpointLabel = isOpenClaude ? 'its configured endpoint' : 'the Anthropic API';

  const customEndpointConnectionFailure =
    hasCustomBaseUrl &&
    (/connectionrefused/i.test(text) ||
      /connection refused/i.test(text) ||
      /econnrefused/i.test(text));
  if (customEndpointConnectionFailure) {
    return withContext(
      'Claude Code could not reach the configured custom Anthropic endpoint.',
      'ANTHROPIC_BASE_URL appears to point at a local or proxy endpoint that refused the connection. Start or fix that proxy, clear the stale endpoint, or remove the custom endpoint to retry with standard Claude Code auth.',
      input,
    );
  }

  // A connection that *was established* and then dropped (or kept resetting),
  // distinct from the `connection refused` case above (which never connects).
  // The exact text has several faces depending on where the failure lands;
  // these were captured by driving the real Claude Code CLI (2.1.168) against
  // a flaky local hop:
  //   - SSE stream cut after it started  -> "API Error: The socket connection
  //     was closed unexpectedly. ... pass verbose: true ..."
  //   - TLS tunnel reset/timeout         -> "API Error: Unable to connect to
  //     API (ECONNRESET)" / "API Error: Unable to connect to API (ETIMEDOUT)"
  // Both are transient and worth retrying; the CLI retries internally for a
  // minute or more before surfacing them, which is why long runs appear to
  // "abort after a while". Most visible on large generations whose streaming
  // response outlives a flaky hop (VPN, GFW/relay, corporate proxy, or a
  // self-hosted ANTHROPIC_BASE_URL relay that caps streaming-request duration).
  const connectionDropped =
    /socket connection was closed/i.test(text) ||
    /closed unexpectedly/i.test(text) ||
    /unable to connect to api \((econnreset|etimedout)\)/i.test(text) ||
    /socket hang up/i.test(text) ||
    /econnreset/i.test(text) ||
    /etimedout/i.test(text) ||
    /epipe/i.test(text) ||
    /und_err_socket/i.test(text) ||
    /premature close/i.test(text) ||
    /other side closed/i.test(text) ||
    /fetch failed/i.test(text) ||
    /\bconnection (error|reset|closed)\b/i.test(text);
  if (connectionDropped) {
    if (hasCustomBaseUrl) {
      const customEndpointFallback = isOpenClaude
        ? 'check the OpenClaude endpoint configuration.'
        : 'remove ANTHROPIC_BASE_URL to retry with standard Claude Code auth.';
      return withContext(
        `${runtimeLabel} lost its connection to the configured custom Anthropic endpoint before the response finished.`,
        `The connection to ANTHROPIC_BASE_URL was closed mid-stream — often a proxy or relay that drops long-lived streaming requests, and most likely on large generations. Retry; if it keeps happening, raise the proxy idle/stream timeout, or ${customEndpointFallback}`,
        input,
        'AGENT_CONNECTION_DROPPED',
      );
    }
    return withContext(
      `${runtimeLabel} lost its connection to ${defaultEndpointLabel} before the response finished.`,
      'The network connection was closed mid-response — common on unstable networks, VPNs, or proxies that drop long-lived streaming requests, and most likely on large generations. Retry the request.',
      input,
      'AGENT_CONNECTION_DROPPED',
    );
  }

  const authFailure =
    /\b401\b/.test(text) ||
    /apikeysource["'\s:]+none/i.test(text) ||
    /not logged in/i.test(text) ||
    /please run \/login/i.test(text) ||
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
    if (isOpenClaude) {
      return withContext(
        'OpenClaude could not authenticate with its configured endpoint.',
        'The spawned OpenClaude process exited before producing a response. Check the OpenClaude API key, endpoint, and local configuration, then retry.',
        input,
      );
    }
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
    if (isOpenClaude) {
      return withContext(
        'OpenClaude exited before producing diagnostics.',
        'Check the OpenClaude API key, endpoint, and local configuration, then retry.',
        input,
      );
    }
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
