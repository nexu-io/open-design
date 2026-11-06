/**
 * Regenerates `w123-acp-inflight-frames.json` — the real ACP frames the OD
 * daemon receives on an AMR run.
 *
 * NOT a test and not run by CI. It exists so the fixture is reproducible and so
 * the mapping it encodes is auditable, because a hand-built ACP frame is worth
 * nothing here: the whole point of the fixture is that the first frame of every
 * real call carries no arguments at all, and that is a fact about the bridge,
 * not something to assume.
 *
 * Run it from the daemon package (Node 24 strips the types itself):
 *
 *   node tests/fixtures/w123-export-acp-inflight-frames.ts
 *
 * ── Where the frames come from ───────────────────────────────────────────────
 *
 * Source of truth: `~/.amr/opencode-sessions/<sha>/data/opencode/opencode.db`,
 * table `event`, rows with `type = 'message.part.updated.1'` whose
 * `part.type === 'tool'`. Each row carries opencode's own tool-part snapshot
 * plus a real wall-clock `time` in milliseconds, which is what makes the
 * throttle and lead-time numbers measurable rather than invented.
 *
 * Those rows are opencode's INTERNAL shape, so they are mapped to the ACP wire
 * shape the daemon actually parses. AMR does not use opencode's own ACP bridge:
 * the OD daemon talks to the `vela` CLI, whose ACP runtime does its own
 * mapping. The two differ in ways that matter here — vela puts the raw opencode
 * tool name in `kind` (which is how `todowrite` reaches OD), never sets `name`,
 * and never forwards a running call's output. So this file reproduces vela's
 * mapper, function for function:
 *
 *   nexu/vela apps/cli/internal/agent/opencode_client.go:971 mapOpenCodeToolPart
 *   nexu/vela apps/cli/internal/agent/acp_runtime.go:965     buildACPToolUpdate
 *
 * Keep them in sync. If vela's mapper changes, this fixture is stale and the
 * conclusions drawn from it stop holding.
 *
 * ── What is trimmed ─────────────────────────────────────────────────────────
 *
 * String leaves longer than `TRIM_LIMIT` are truncated with a
 * `…[trimmed N chars]` suffix — for size, and because the untrimmed payloads
 * are real prompts and real shell output. Frame count, ordering, wall-clock
 * offsets, `sessionUpdate`/`status`/`kind`/`title`, and the `rawInput`/`content`
 * key sets are untouched; nothing under test reads the elided bytes.
 */
import { createHash } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const TRIM_LIMIT = 180;
const OUT = fileURLToPath(new URL('./w123-acp-inflight-frames.json', import.meta.url));
const SESSION_ROOT = path.join(homedir(), '.amr', 'opencode-sessions');

type Json = Record<string, unknown>;

/** `opencode_client.go:1049` toolContent — output is stringified, not embedded. */
function toolContent(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** `opencode_client.go:971` mapOpenCodeToolPart + `acp_runtime.go:965` buildACPToolUpdate. */
function buildAcpUpdate(part: Json): Json | null {
  const callId = (part.callID ?? part.id) as string | undefined;
  if (!callId) return null;
  const state = (part.state ?? {}) as Json;
  const status = state.status as string;
  const title = (state.title as string) || (part.tool as string);

  const terminal = status === 'completed' || status === 'error';
  const update: Json = {
    sessionUpdate: terminal ? 'tool_call_update' : 'tool_call',
    toolCallId: callId,
    status:
      status === 'pending' ? 'pending'
      : status === 'running' ? 'in_progress'
      : status === 'completed' ? 'completed'
      : status === 'error' ? 'failed'
      : null,
  };
  if (update.status === null) return null;
  if (title) update.title = title;
  if (part.tool) update.kind = part.tool;
  if (state.input !== undefined && state.input !== null) update.rawInput = state.input;

  const rawOutput = status === 'completed' ? state.output : status === 'error' ? state.error : null;
  if (rawOutput !== undefined && rawOutput !== null) update.rawOutput = rawOutput;
  const content = terminal ? toolContent(rawOutput) : '';
  if (content) {
    update.content = [{ type: 'content', content: { type: 'text', text: content } }];
  }
  return update;
}

function trim(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length <= TRIM_LIMIT
      ? value
      : `${value.slice(0, TRIM_LIMIT)}…[trimmed ${value.length - TRIM_LIMIT} chars]`;
  }
  if (Array.isArray(value)) return value.map(trim);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trim(v)]));
  }
  return value;
}

type Call = {
  toolCallId: string;
  session: string;
  openCodeTool: string;
  spanMs: number;
  frames: { offsetMs: number; update: unknown }[];
};

function main(): void {
  const calls = new Map<string, { session: string; tool: string; frames: { at: number; update: Json }[] }>();
  let sessions = 0;

  for (const dir of readdirSync(SESSION_ROOT)) {
    const dbPath = path.join(SESSION_ROOT, dir, 'data', 'opencode', 'opencode.db');
    let db: Database.Database;
    try {
      db = new Database(dbPath, { readonly: true });
    } catch {
      continue;
    }
    let sawTool = false;
    const rows = db
      .prepare("SELECT data FROM event WHERE type = 'message.part.updated.1' ORDER BY seq")
      .all() as { data: string }[];
    for (const row of rows) {
      let obj: Json;
      try {
        obj = JSON.parse(row.data) as Json;
      } catch {
        continue;
      }
      const part = (obj.part ?? {}) as Json;
      if (part.type !== 'tool') continue;
      const update = buildAcpUpdate(part);
      if (!update) continue;
      const id = String(update.toolCallId);
      if (!calls.has(id)) calls.set(id, { session: dir, tool: String(part.tool), frames: [] });
      calls.get(id)!.frames.push({ at: Number(obj.time), update });
      sawTool = true;
    }
    db.close();
    if (sawTool) sessions += 1;
  }

  const out: Call[] = [];
  for (const [id, call] of calls) {
    const frames = call.frames.slice().sort((a, b) => a.at - b.at);
    const t0 = frames[0]!.at;
    out.push({
      toolCallId: id,
      session: call.session,
      openCodeTool: call.tool,
      spanMs: frames[frames.length - 1]!.at - t0,
      frames: frames.map((f) => ({ offsetMs: f.at - t0, update: trim(f.update) })),
    });
  }
  out.sort((a, b) => b.spanMs - a.spanMs);

  const doc = {
    _provenance: {
      what: "Real ACP session/update frames as vela's bridge emits them to the OD daemon.",
      corpus:
        "~/.amr/opencode-sessions/*/data/opencode/opencode.db, table `event`, "
        + "type='message.part.updated.1', part.type=='tool'",
      sessions,
      exporter: 'apps/daemon/tests/fixtures/w123-export-acp-inflight-frames.ts',
      mapping: [
        'nexu/vela apps/cli/internal/agent/opencode_client.go:971 mapOpenCodeToolPart',
        'nexu/vela apps/cli/internal/agent/acp_runtime.go:965 buildACPToolUpdate',
      ],
      note: 'offsetMs is real wall clock from the opencode event row (`time`), not synthesized.',
      trimmed:
        `Every string leaf longer than ${TRIM_LIMIT} chars is truncated with a `
        + '"…[trimmed N chars]" suffix. Frame count, ordering, wall-clock offsets, '
        + 'sessionUpdate/status/kind/title and the rawInput/content key sets are byte-for-byte '
        + 'as vela emitted them; only long payload bodies are shortened (size + privacy). '
        + 'Nothing under test depends on the elided bytes.',
      callsSha256: createHash('sha256')
        .update(JSON.stringify(out))
        .digest('hex'),
    },
    calls: out,
  };
  writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`, 'utf8');
  const frames = out.reduce((n, c) => n + c.frames.length, 0);
  console.log(`wrote ${out.length} calls / ${frames} frames from ${sessions} sessions → ${OUT}`);
}

main();
