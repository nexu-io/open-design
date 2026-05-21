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

interface AgentDiagnosticConfig {
  brandName: string;
  profileLabel: string;
  // How to tell the user to authenticate. Used in different sentence shapes:
  //   "Run <runAndLogin>, then retry..."
  //   "Re-run <runAndLogin> for that profile, then retry..."
  //   "Run <runAndUseLogin>, and retry..."
  runAndLogin: string;
  runAndUseLogin: string;
  configDirEnvKey: string;
  baseUrlEnvKey: string;
  apiKeyEnvKey: string;
  endpointLabel: string;
  // When true, the agent authenticates primarily via its apiKeyEnvKey in -p
  // mode (not OAuth /login). Diagnostics should surface API-key guidance
  // when the key is present and auth fails, rather than redirecting to /login.
  apiKeyIsPrimaryAuth?: boolean;
  // Additional env keys to report in diagnostic context when their effective
  // value is set (e.g. CODEBUDDY_INTERNET_ENVIRONMENT).
  contextEnvKeys?: string[];
}

const CLAUDE_DIAGNOSTIC_CONFIG: AgentDiagnosticConfig = {
  brandName: 'Claude Code',
  profileLabel: 'Claude',
  runAndLogin: '`claude` and `/login`',
  runAndUseLogin: '`claude`, use `/login`',
  configDirEnvKey: 'CLAUDE_CONFIG_DIR',
  baseUrlEnvKey: 'ANTHROPIC_BASE_URL',
  apiKeyEnvKey: 'ANTHROPIC_API_KEY',
  endpointLabel: 'Anthropic',
};

const CODEBUDDY_DIAGNOSTIC_CONFIG: AgentDiagnosticConfig = {
  brandName: 'CodeBuddy Code',
  profileLabel: 'CodeBuddy',
  runAndLogin: '`codebuddy` and `/login`',
  runAndUseLogin: '`codebuddy`, use `/login`',
  configDirEnvKey: 'CODEBUDDY_CONFIG_DIR',
  baseUrlEnvKey: 'CODEBUDDY_BASE_URL',
  apiKeyEnvKey: 'CODEBUDDY_API_KEY',
  endpointLabel: 'CodeBuddy',
  apiKeyIsPrimaryAuth: true,
  contextEnvKeys: ['CODEBUDDY_INTERNET_ENVIRONMENT'],
};

const AGENT_DIAGNOSTIC_CONFIGS = new Map<string, AgentDiagnosticConfig>([
  ['claude', CLAUDE_DIAGNOSTIC_CONFIG],
  ['codebuddy', CODEBUDDY_DIAGNOSTIC_CONFIG],
]);

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
  config: AgentDiagnosticConfig,
): ClaudeCliDiagnostic {
  const configDir = envValue(input.env, config.configDirEnvKey);
  const baseUrl = envValue(input.env, config.baseUrlEnvKey);
  const diagnosticTail = redactSecrets(body(input)).replace(/\s+/g, ' ').trim().slice(-240);
  const context: string[] = [message, detail];
  if (diagnosticTail) context.push(`${config.brandName} output: ${diagnosticTail}`);
  if (configDir) context.push(`Effective ${config.configDirEnvKey}: ${configDir}.`);
  if (baseUrl) context.push(`${config.baseUrlEnvKey} is set for this ${config.brandName} process.`);
  if (config.contextEnvKeys) {
    for (const ctxKey of config.contextEnvKeys) {
      const ctxValue = envValue(input.env, ctxKey);
      if (ctxValue) context.push(`${ctxKey}=${ctxValue} is effective for this ${config.brandName} process.`);
    }
  }
  return {
    message: redactSecrets(message),
    detail: redactSecrets(context.filter(Boolean).join(' ')),
    retryable: true,
  };
}

function diagnoseCliFailure(
  input: ClaudeCliDiagnosticInput,
  config: AgentDiagnosticConfig,
): ClaudeCliDiagnostic | null {
  if (input.exitCode === 0 && !input.signal) return null;

  const text = body(input);
  const normalized = text.toLowerCase();
  const hasCustomBaseUrl = envValue(input.env, config.baseUrlEnvKey) !== null;
  const hasConfigDir = envValue(input.env, config.configDirEnvKey) !== null;

  const customEndpointConnectionFailure =
    hasCustomBaseUrl &&
    (/connectionrefused/i.test(text) ||
      /connection refused/i.test(text) ||
      /econnrefused/i.test(text));
  if (customEndpointConnectionFailure) {
    return withContext(
      `${config.brandName} could not reach the configured custom ${config.endpointLabel} endpoint.`,
      `${config.baseUrlEnvKey} appears to point at a local or proxy endpoint that refused the connection. Start or fix that proxy, clear the stale endpoint, or remove the custom endpoint to retry with standard ${config.brandName} auth.`,
      input,
      config,
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
    if (config.apiKeyIsPrimaryAuth) {
      const hasApiKey = envValue(input.env, config.apiKeyEnvKey) !== null;
      const message = hasApiKey
        ? `${config.brandName} could not authenticate with the configured custom ${config.endpointLabel} endpoint.`
        : `${config.brandName} could not authenticate with the configured custom ${config.endpointLabel} endpoint. No API key is configured.`;
      const detail = hasApiKey
        ? `Check ${config.apiKeyEnvKey}, ${config.baseUrlEnvKey}, proxy credentials, and model access in Settings.`
        : `Set ${config.apiKeyEnvKey} in Settings so the spawned ${config.brandName} process can authenticate against the custom endpoint, then retry.`;
      return withContext(message, detail, input, config);
    }
    return withContext(
      `${config.brandName} could not authenticate with the configured custom ${config.endpointLabel} endpoint.`,
      `Check ${config.baseUrlEnvKey}, proxy credentials, endpoint authentication environment, and model access. Remove the custom endpoint only if you want to retry with standard ${config.brandName} auth.`,
      input,
      config,
    );
  }
  if (authFailure) {
    const hasApiKey = envValue(input.env, config.apiKeyEnvKey) !== null;
    // CodeBuddy authenticates via API key in -p mode; all auth failures
    // point at API key setup, not /login (which -p never uses).
    if (config.apiKeyIsPrimaryAuth) {
      const configHint = hasConfigDir
        ? `Check ${config.apiKeyEnvKey} and ${config.configDirEnvKey} in Settings.`
        : `Set ${config.apiKeyEnvKey} in Settings. If you use multiple ${config.profileLabel} profiles, also set ${config.configDirEnvKey} so Open Design uses the correct one.`;
      const message = hasApiKey
        ? `${config.brandName} could not authenticate with the configured API key.`
        : `${config.brandName} could not authenticate. No API key is configured.`;
      const detail = hasApiKey
        ? `The spawned ${config.brandName} process has ${config.apiKeyEnvKey} set but still exited before producing a response. ${configHint}`
        : `The spawned ${config.brandName} process requires ${config.apiKeyEnvKey} for authentication in -p mode. ${configHint}`;
      return withContext(message, detail, input, config);
    }
    const configHint = hasConfigDir
      ? `The configured ${config.profileLabel} config directory may contain stale or expired auth state.`
      : `If you use multiple ${config.profileLabel} profiles, set ${config.configDirEnvKey} in Settings so Open Design spawns the same profile that works in your terminal.`;
    return withContext(
      `${config.brandName} could not authenticate. Run ${config.runAndUseLogin}, then retry the Open Design request.`,
      `The spawned ${config.brandName} process exited before producing a response. ${configHint}`,
      input,
      config,
    );
  }

  const modelUnavailable =
    /selected model is not available/i.test(text) ||
    /current plan or region/i.test(text) ||
    /(model).*(not available|not supported|unsupported|not found|not have access|no access)/i.test(text);
  if (modelUnavailable && hasCustomBaseUrl) {
    return withContext(
      `${config.brandName} could not access the selected model through the configured custom endpoint.`,
      `The custom ${config.baseUrlEnvKey} or proxy may not expose the model ${config.brandName} selected. Change the model, fix the endpoint/proxy, or remove ${config.baseUrlEnvKey} and retry with standard ${config.brandName} auth.`,
      input,
      config,
    );
  }

  const windowsCredentialMismatch =
    /credential manager/i.test(text) ||
    /\bwsl\b/i.test(text) ||
    /powershell/i.test(text) ||
    /native windows/i.test(text);
  if (windowsCredentialMismatch) {
    return withContext(
      `${config.brandName} appears to be using credentials from a different local environment.`,
      `Re-authenticate ${config.brandName} in the same Windows, WSL, or shell environment that Open Design uses. On native Windows, check Windows Credential Manager if the login command does not repair the session.`,
      input,
      config,
    );
  }

  const configStateFailure =
    /(config|profile|session|credential|oauth)/i.test(text) &&
    /(stale|corrupt|expired|different|missing|not found|invalid)/i.test(text);
  if (configStateFailure) {
    if (config.apiKeyIsPrimaryAuth) {
      const hasApiKey = envValue(input.env, config.apiKeyEnvKey) !== null;
      const message = hasApiKey
        ? `${config.brandName} failed with a configuration or credential error.`
        : `${config.brandName} failed with a configuration or credential error. No API key is configured.`;
      const detail = hasApiKey
        ? `Check ${config.apiKeyEnvKey} and related settings in Settings, then retry.`
        : `Set ${config.apiKeyEnvKey} in Settings so the spawned ${config.brandName} process can authenticate, then retry.`;
      return withContext(message, detail, input, config);
    }
    const message = hasConfigDir
      ? `${config.brandName} failed while using the configured ${config.profileLabel} profile.`
      : `${config.brandName} may be using a different or stale local profile than your terminal.`;
    const detail = hasConfigDir
      ? `Re-run ${config.runAndLogin} for that profile, then retry Open Design.`
      : `Run ${config.runAndLogin}, or set ${config.configDirEnvKey} in Settings when you use multiple ${config.profileLabel} profiles.`;
    return withContext(message, detail, input, config);
  }

  if (!text.trim() && input.exitCode === 1 && hasCustomBaseUrl) {
    if (config.apiKeyIsPrimaryAuth) {
      const hasApiKey = envValue(input.env, config.apiKeyEnvKey) !== null;
      const message = hasApiKey
        ? `${config.brandName} exited before producing diagnostics while using a custom ${config.endpointLabel} endpoint.`
        : `${config.brandName} exited before producing diagnostics while using a custom ${config.endpointLabel} endpoint. No API key is configured.`;
      const detail = hasApiKey
        ? `Check ${config.apiKeyEnvKey}, ${config.baseUrlEnvKey}, proxy credentials, and model access in Settings.`
        : `Set ${config.apiKeyEnvKey} in Settings so the spawned ${config.brandName} process can authenticate against the custom endpoint, then retry.`;
      return withContext(message, detail, input, config);
    }
    return withContext(
      `${config.brandName} exited before producing diagnostics while using a custom ${config.endpointLabel} endpoint.`,
      `Check ${config.baseUrlEnvKey}, proxy credentials, endpoint authentication environment, and model access. Remove the custom endpoint only if you want to retry with standard ${config.brandName} auth.`,
      input,
      config,
    );
  }

  if (!text.trim() && input.exitCode === 1) {
    if (config.apiKeyIsPrimaryAuth) {
      const hasApiKey = envValue(input.env, config.apiKeyEnvKey) !== null;
      const message = hasApiKey
        ? `${config.brandName} exited before producing diagnostics.`
        : `${config.brandName} exited before producing diagnostics. No API key is configured.`;
      const detail = hasApiKey
        ? `Check ${config.apiKeyEnvKey} and related settings in Settings, then retry.`
        : `Set ${config.apiKeyEnvKey} in Settings so the spawned ${config.brandName} process can authenticate, then retry.`;
      return withContext(message, detail, input, config);
    }
    const message = hasConfigDir
      ? `${config.brandName} exited before producing diagnostics while using the configured ${config.profileLabel} profile.`
      : `${config.brandName} exited before producing diagnostics.`;
    const detail = hasConfigDir
      ? `Re-run ${config.runAndLogin} for that profile, then retry Open Design.`
      : `Run ${config.runAndUseLogin}, and retry. If you use multiple ${config.profileLabel} profiles, set ${config.configDirEnvKey} in Settings so Open Design uses the same profile as your terminal.`;
    return withContext(
      message,
      detail,
      input,
      config,
    );
  }

  if (normalized.includes(config.baseUrlEnvKey.toLowerCase()) && hasCustomBaseUrl) {
    return withContext(
      `${config.brandName} failed while using a custom ${config.endpointLabel} endpoint.`,
      `Check the ${config.baseUrlEnvKey} endpoint, proxy, model access, and authentication settings, then retry.`,
      input,
      config,
    );
  }

  return null;
}

export function diagnoseClaudeCliFailure(
  input: ClaudeCliDiagnosticInput,
): ClaudeCliDiagnostic | null {
  const config = AGENT_DIAGNOSTIC_CONFIGS.get(input.agentId);
  if (!config) return null;
  return diagnoseCliFailure(input, config);
}
