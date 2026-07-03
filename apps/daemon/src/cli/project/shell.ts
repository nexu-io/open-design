// @ts-nocheck
/** @module cli/project/shell
 * Implements interactive shell bridging for projects (PTY attach over HTTP SSE + POST stdin).
 * Mirrors web Terminal tab behavior: --follow enables attachment, --json-only creates and exits.
 * Collaborators: parseFlags, structuredHttpFailure from core.
 */
import { parseFlags, structuredHttpFailure } from '../core/index.js';
import { PROJECT_BOOLEAN_FLAGS, PROJECT_STRING_FLAGS, projectDaemonUrl } from './project.js';

// `od shell --project <id>` opens an interactive PTY rooted at the project's
// working directory and attaches to it. This is the CLI parity for the web
// Terminal tab — both surfaces drive `/api/projects/:id/terminals`. Output
// streams down over SSE; local keystrokes are POSTed back up to /stdin. When
// stdin is a TTY we flip it into raw mode so the remote shell sees per-key
// bytes (ctrl-c, arrows, tab) instead of line-buffered input.
/**
 * Creates an interactive PTY in the project's working directory and optionally attaches.
 * Sends terminal dimensions if available; returns JSON if --json flag set.
 * @async
 * @param {Array<string>} args - Subcommand and arguments (only called from dispatcher with remaining args).
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
async function runShell(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od shell --project <projectId> [--shell <path>] [--json]
                                  Open an interactive shell in the project's
                                  working directory and attach to it.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Print the created terminal session as JSON and exit
                       (does not attach).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const flags = parseFlags(args, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  if (!flags.project) {
    console.error('--project <projectId> is required');
    process.exit(2);
  }
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  const body = {};
  if (flags.shell) body.shell = flags.shell;
  if (process.stdout.columns) body.cols = process.stdout.columns;
  if (process.stdout.rows) body.rows = process.stdout.rows;
  const createResp = await fetch(
    `${base}/api/projects/${encodeURIComponent(flags.project)}/terminals`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!createResp.ok) return structuredHttpFailure(createResp, 'project-not-found');
  const created = await createResp.json();
  if (flags.json) {
    return process.stdout.write(JSON.stringify(created, null, 2) + '\n');
  }
  const terminalId = created?.terminal?.id;
  if (!terminalId) {
    console.error('terminal create returned no id');
    process.exit(1);
  }
  await attachTerminal(base, flags.project, terminalId);
}

// Bridge a local TTY to a remote PTY session: SSE `data` events → stdout,
// local stdin bytes → POST /stdin, terminal resize → POST /resize. Resolves
// when the remote shell emits its `exit` event.
/**
 * @internal Bridges local TTY to remote PTY over SSE stream + POST /stdin + POST /resize.
 * Puts stdin in raw mode if available; listens for exit event from remote; handles restore on disconnect.
 * @async
 * @param {string} base - Daemon base URL.
 * @param {string} projectId - Project ID.
 * @param {string} terminalId - Terminal session ID.
 * @returns {Promise<void>} Exits process on remote exit event.
 */
async function attachTerminal(base, projectId, terminalId) {
  const termPath = `${base}/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}`;
  const isRawTty = Boolean(process.stdin.isTTY && process.stdin.setRawMode);
  if (isRawTty) process.stdin.setRawMode(true);
  process.stdin.resume();

  const onInput = (chunk) => {
    fetch(`${termPath}/stdin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: chunk.toString('utf8') }),
    }).catch(() => {});
  };
  process.stdin.on('data', onInput);

  const onResize = () => {
    fetch(`${termPath}/resize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cols: process.stdout.columns, rows: process.stdout.rows }),
    }).catch(() => {});
  };
  process.stdout.on('resize', onResize);

  const restore = () => {
    process.stdin.off('data', onInput);
    process.stdout.off('resize', onResize);
    if (isRawTty) {
      try { process.stdin.setRawMode(false); } catch { /* ignore */ }
    }
    process.stdin.pause();
  };

  try {
    const resp = await fetch(`${termPath}/stream`, { headers: { accept: 'text/event-stream' } });
    if (!resp.ok || !resp.body) {
      console.error(`shell attach failed: ${resp.status}`);
      process.exit(1);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const lines = block.split('\n');
        const eventLine = lines.find((l) => l.startsWith('event: '));
        const dataLine = lines.find((l) => l.startsWith('data: '));
        const event = eventLine ? eventLine.slice('event: '.length) : 'message';
        const dataRaw = dataLine ? dataLine.slice('data: '.length) : '';
        let parsed;
        try { parsed = JSON.parse(dataRaw); } catch { parsed = dataRaw; }
        if (event === 'data' && parsed && typeof parsed.data === 'string') {
          process.stdout.write(parsed.data);
        } else if (event === 'exit') {
          restore();
          process.exit(typeof parsed?.code === 'number' ? parsed.code : 0);
        }
      }
    }
  } finally {
    restore();
  }
}
