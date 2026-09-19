// `od compact` — the CLI surface for manual context compaction of
// API/BYOK (Antigravity) conversations (#5991). Per AGENTS.md
// "Capability exposure (UI/CLI dual-track)", every user-facing
// capability must be reachable through the `od` CLI as well as the web
// UI; both drive the same `POST /api/projects/:id/conversations/:cid/compact`
// endpoint. The CLI is a thin SSE client: it streams the daemon's
// progress frames to stderr and prints the resulting checkpoint record
// to stdout.
//
// Kept in its own module (not inline in cli.ts) so it stays unit-testable
// without triggering cli.ts's import-time SUBCOMMAND_MAP dispatch —
// mirrors handoff-cli.ts / artifacts-cli.ts.

import type { ChatConversationCompaction } from '@open-design/contracts';
import { resolveDaemonUrl } from './daemon-url.js';

interface CompactCliResult {
  exitCode: number;
}

interface ParsedCompactOptions {
  projectId?: string;
  conversationId?: string;
  cutAtMessageId?: string;
  daemonUrl?: string;
  json: boolean;
  help: boolean;
}

const USAGE = `Usage:
  od compact <projectId> <conversationId> [--cut-at <messageId>]
             [--daemon-url <url>] [--json]

Summarizes an API-mode (Antigravity) conversation's transcript up to a
checkpoint message via the local daemon, stores that checkpoint as the
durable compaction state the web UI replays, and prints the summary.
Omitting --cut-at cuts at the latest message.

Common options:
  --daemon-url <url>   OpenDesign daemon HTTP base.
  --json               Emit the compaction record as raw JSON.
`;

function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, code?: unknown, status?: number): CompactCliResult {
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

function parseOptions(args: string[]): ParsedCompactOptions | { error: string } {
  const options: ParsedCompactOptions = { json: false, help: false };
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--cut-at') {
      const value = args[++index];
      if (!value) return { error: '--cut-at requires a value' };
      options.cutAtMessageId = value;
    } else if (arg === '--daemon-url') {
      const value = args[++index];
      if (!value) return { error: '--daemon-url requires a value' };
      options.daemonUrl = value;
    } else if (arg.startsWith('-')) {
      return { error: `unknown option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  const projectId = positionals[0];
  const conversationId = positionals[1];
  if (projectId !== undefined) options.projectId = projectId;
  if (conversationId !== undefined) options.conversationId = conversationId;
  if (positionals.length > 2) {
    return { error: `unexpected extra argument: ${positionals[2]}` };
  }
  return options;
}

/** Parse a single SSE frame ("event: x\ndata: y\n\n") into its parts. */
function parseSseFrame(frame: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

export async function runCompactCli(args: string[]): Promise<CompactCliResult> {
  const parsed = parseOptions(args);
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}`);
    return { exitCode: 2 };
  }
  if (parsed.help) {
    process.stdout.write(USAGE);
    return { exitCode: 0 };
  }
  if (!parsed.projectId || !parsed.conversationId) {
    process.stderr.write(`missing <projectId> or <conversationId>\n\n${USAGE}`);
    return { exitCode: 2 };
  }

  let base: string;
  try {
    base = await resolveDaemonUrl(
      parsed.daemonUrl === undefined ? {} : { flagUrl: parsed.daemonUrl },
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const url = `${base}/api/projects/${encodeURIComponent(parsed.projectId)}/conversations/${encodeURIComponent(parsed.conversationId)}/compact`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: parsed.cutAtMessageId ? JSON.stringify({ cutAtMessageId: parsed.cutAtMessageId }) : '{}',
    });
  } catch (error) {
    return fail(`failed to reach daemon at ${base}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Before the stream opens the endpoint answers validation failures with
  // a plain JSON error envelope; surface it verbatim.
  if (!resp.ok || !resp.body) {
    const contentType = resp.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const envelope = (await resp.json()) as { error?: { code?: string; message?: string } };
        return fail(
          envelope?.error?.message ?? 'compaction request failed',
          envelope?.error?.code,
          resp.status,
        );
      } catch {
        // fall through to the generic failure below
      }
    }
    return fail(`compaction request failed: ${resp.status} ${await resp.text()}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let compaction: ChatConversationCompaction | null = null;

  const handleFrame = (frame: string): void => {
    const parsedFrame = parseSseFrame(frame);
    if (!parsedFrame) return;
    const { event, data } = parsedFrame;
    if (event === 'progress') {
      const record = data as { stage?: string; message?: string };
      process.stderr.write(
        `[${record.stage ?? 'compacting'}]${record.message ? ` ${record.message}` : ''}\n`,
      );
    } else if (event === 'compaction') {
      compaction = (data as { compaction: ChatConversationCompaction }).compaction;
    } else if (event === 'error') {
      const record = data as { message?: string; code?: string };
      process.stderr.write(`${record.message ?? 'compaction failed'}\n`);
    }
  };

  // The daemon closes the stream after the terminal frame, so draining
  // to completion is the loop condition.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleFrame(frame);
      boundary = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) handleFrame(buffer);

  if (!compaction) {
    return fail('stream ended without a compaction result');
  }
  // TS cannot see the closure assignment, so the guard above leaves the
  // variable narrowed to `never`; re-anchor it to the declared type.
  const finalCompaction: ChatConversationCompaction = compaction;

  if (parsed.json) {
    writeJson(finalCompaction);
  } else {
    const ledgerCount = finalCompaction.ledger?.length ?? 0;
    process.stdout.write(
      `Compacted ${finalCompaction.conversationId} at message ${finalCompaction.cutAtMessageId}` +
        (ledgerCount > 0 ? ` · ${ledgerCount} file${ledgerCount === 1 ? '' : 's'} tracked` : '') +
        '\n\n',
    );
    process.stdout.write(`${finalCompaction.summaryText.trimEnd()}\n`);
  }
  return { exitCode: 0 };
}
