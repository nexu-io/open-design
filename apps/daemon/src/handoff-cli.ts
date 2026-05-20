// `od project handoff` — the CLI surface for the resume-conversation
// handoff capability. Per AGENTS.md "Capability exposure (UI/CLI
// dual-track)", every user-facing capability must be reachable through
// the `od` CLI as well as the web UI; both drive the same
// `POST /api/projects/:id/handoff` endpoint.
//
// Kept in its own module (not inline in cli.ts) so it stays unit-testable
// without triggering cli.ts's import-time SUBCOMMAND_MAP dispatch —
// mirrors artifacts-cli.ts / runArtifactsCli.

import type { HandoffRequest, HandoffResponse } from '@open-design/contracts/api/handoff';
import { resolveDaemonUrl } from './daemon-url.js';

interface HandoffCliResult {
  exitCode: number;
}

/**
 * A 2xx response is only a success if the body is actually a well-formed
 * HandoffResponse. A broken daemon/proxy can return 200 with malformed or
 * shape-invalid JSON; without this check the CLI would print `undefined`
 * (or `{}` under --json) and still exit 0, breaking the fail-fast contract
 * scripts depend on.
 */
function isHandoffResponse(value: unknown): value is HandoffResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.prompt === 'string' &&
    typeof v.model === 'string' &&
    typeof v.inputTokens === 'number' &&
    typeof v.outputTokens === 'number' &&
    typeof v.transcriptMessageCount === 'number'
  );
}

const USAGE = `Usage:
  od project handoff <projectId> --conversation <id> --api-key <key> --model <model>
                     [--base-url <url>] [--max-tokens <n>] [--daemon-url <url>] [--json]

Synthesizes a "resume conversation" handoff prompt from one conversation's
transcript via the local daemon. Prints the prompt to stdout; --json emits
the full response (prompt + model + token usage).
`;

function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, code?: unknown, status?: number): HandoffCliResult {
  writeJson(
    {
      ok: false,
      ...(status === undefined ? {} : { status }),
      error: { message, ...(code === undefined ? {} : { code }) },
    },
    process.stderr,
  );
  return { exitCode: 1 };
}

interface ParsedHandoffOptions {
  projectId?: string;
  conversationId?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  daemonUrl?: string;
  json: boolean;
  help: boolean;
}

function parseOptions(args: string[]): ParsedHandoffOptions | { error: string } {
  const options: ParsedHandoffOptions = { json: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--conversation') {
      const value = args[++index];
      if (!value) return { error: '--conversation requires a value' };
      options.conversationId = value;
    } else if (arg === '--api-key') {
      const value = args[++index];
      if (!value) return { error: '--api-key requires a value' };
      options.apiKey = value;
    } else if (arg === '--model') {
      const value = args[++index];
      if (!value) return { error: '--model requires a value' };
      options.model = value;
    } else if (arg === '--base-url') {
      const value = args[++index];
      if (!value) return { error: '--base-url requires a value' };
      options.baseUrl = value;
    } else if (arg === '--max-tokens') {
      const value = args[++index];
      if (!value) return { error: '--max-tokens requires a value' };
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { error: '--max-tokens must be a positive number' };
      }
      options.maxTokens = parsed;
    } else if (arg === '--daemon-url') {
      const value = args[++index];
      if (!value) return { error: '--daemon-url requires a URL' };
      options.daemonUrl = value;
    } else if (arg.startsWith('-')) {
      return { error: `unknown option: ${arg}` };
    } else if (options.projectId === undefined) {
      options.projectId = arg;
    } else {
      return { error: `unexpected argument: ${arg}` };
    }
  }
  return options;
}

export async function runProjectHandoff(args: string[]): Promise<HandoffCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help) {
    process.stdout.write(USAGE);
    return { exitCode: 0 };
  }
  if (!options.projectId) return fail('handoff requires <projectId>');
  if (!options.conversationId) return fail('handoff requires --conversation <id>');
  if (!options.apiKey) return fail('handoff requires --api-key <key>');
  if (!options.model) return fail('handoff requires --model <model>');

  try {
    const daemonUrl = (
      await resolveDaemonUrl(options.daemonUrl === undefined ? {} : { flagUrl: options.daemonUrl })
    ).replace(/\/$/, '');
    const body: HandoffRequest = {
      conversationId: options.conversationId,
      apiKey: options.apiKey,
      model: options.model,
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    };
    const resp = await fetch(
      `${daemonUrl}/api/projects/${encodeURIComponent(options.projectId)}/handoff`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const payload = await resp.json().catch(() => undefined);
    if (!resp.ok) {
      const err = (payload as { error?: { code?: string; message?: string } } | undefined)?.error;
      return fail(err?.message ?? `handoff failed: HTTP ${resp.status}`, err?.code, resp.status);
    }
    // A 2xx with an unparseable or shape-invalid body is a failure, not a
    // success that prints `undefined` — fail fast so scripts can trust the
    // exit code.
    if (!isHandoffResponse(payload)) {
      return fail('daemon returned a malformed handoff response', undefined, resp.status);
    }
    if (options.json) {
      writeJson(payload);
    } else {
      // Default output is the synthesized prompt itself, so it pipes
      // cleanly into a file or another command.
      process.stdout.write(`${payload.prompt}\n`);
    }
    return { exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
