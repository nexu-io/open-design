import os from 'node:os';
import path from 'node:path';

import { redactSecrets } from './redact.js';

export interface CopilotCliDiagnosticInput {
  agentId: string;
  exitCode?: number | null;
  signal?: string | null;
  stderrTail?: string | null;
  stdoutTail?: string | null;
  env?: Record<string, unknown> | null;
}

export interface CopilotCliDiagnostic {
  message: string;
  detail: string;
  retryable: boolean;
}

function body(input: CopilotCliDiagnosticInput): string {
  return [input.stderrTail, input.stdoutTail]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n');
}

function copilotTrustedFolderExample(): string {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Open Design', '**');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Open Design', '**');
  }
  return path.join(home, '.local', 'share', 'Open Design', '**');
}

function withContext(
  message: string,
  detail: string,
  input: CopilotCliDiagnosticInput,
): CopilotCliDiagnostic {
  const diagnosticTail = redactSecrets(body(input)).replace(/\s+/g, ' ').trim().slice(-240);
  const context: string[] = [message, detail];
  if (diagnosticTail) context.push(`Copilot output: ${diagnosticTail}`);
  return {
    message: redactSecrets(message),
    detail: redactSecrets(context.filter(Boolean).join(' ')),
    retryable: true,
  };
}

export function diagnoseCopilotCliFailure(
  input: CopilotCliDiagnosticInput,
): CopilotCliDiagnostic | null {
  if (input.agentId !== 'copilot') return null;
  if (input.exitCode === 0 && !input.signal) return null;

  const text = body(input);
  const normalized = text.toLowerCase();

  const rateLimited =
    /user_weekly_rate_limited/i.test(text) ||
    /rate[_ -]?limit/i.test(text) ||
    /\b429\b/.test(text);
  if (rateLimited) {
    return withContext(
      'GitHub Copilot CLI hit a provider rate limit for the selected model.',
      'Try model `auto` in Settings, switch to another Copilot model, or retry after your quota resets. Open Design previously surfaced this as a generic exit code 1.',
      input,
    );
  }

  const trustedFolderFailure =
    /trustedfolder/i.test(text) ||
    /trusted folder/i.test(text) ||
    /folder trust/i.test(text) ||
    /directory is not trusted/i.test(text) ||
    /not trusted/i.test(text) ||
    (/tool\.execution_complete/i.test(text) &&
      /"success"\s*:\s*false/i.test(text) &&
      /(trust|permission|access denied|not allowed|outside workspace)/i.test(text));
  if (trustedFolderFailure) {
    const trustedPath = copilotTrustedFolderExample();
    return withContext(
      'GitHub Copilot CLI could not access the Open Design project directory.',
      `Add the Open Design application data directory to trustedFolders in ~/.copilot/config.json, for example: "${trustedPath}". Copilot requires this before tool calls can read or write project files launched by Open Design.`,
      input,
    );
  }

  if (!text.trim() && input.exitCode === 1) {
    const trustedPath = copilotTrustedFolderExample();
    return withContext(
      'GitHub Copilot CLI exited before producing diagnostics.',
      `If tool calls failed to read or write project files, add "${trustedPath}" to trustedFolders in ~/.copilot/config.json. Otherwise retry with model \`auto\` or check \`copilot --help\` in your terminal.`,
      input,
    );
  }

  if (
    normalized.includes('tool') &&
    (normalized.includes('permission') ||
      normalized.includes('access denied') ||
      normalized.includes('not allowed'))
  ) {
    const trustedPath = copilotTrustedFolderExample();
    return withContext(
      'GitHub Copilot CLI rejected a tool call against the Open Design project directory.',
      `If file tools fail, add "${trustedPath}" to trustedFolders in ~/.copilot/config.json and retry.`,
      input,
    );
  }

  return null;
}
