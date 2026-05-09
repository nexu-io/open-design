import type { PanelEvent, PanelistRole } from '@open-design/contracts/critique';
import { MalformedBlockError, MissingArtifactError, OversizeBlockError } from '../errors.js';

const KNOWN_ROLES: ReadonlySet<string> = new Set(['designer', 'critic', 'brand', 'a11y', 'copy']);

// Hoisted regexes reused across emitInner invocations. Reset lastIndex before each loop.
const DIM_RE = /<DIM\s+name="([^"]+)"\s+score="([^"]+)">([\s\S]*?)<\/DIM>/g;
const MUST_FIX_RE = /<MUST_FIX>([\s\S]*?)<\/MUST_FIX>/g;

const DEFAULT_SCORE_SCALE = 10;

interface State {
  buf: string;
  consumed: number;
  runId: string;
  adapter: string;
  protocolVersion: number;
  // Captured from <CRITIQUE_RUN scale="..."> so score bounds match the run's declared scale,
  // not a hardcoded 100. Defaults to DEFAULT_SCORE_SCALE before run_started is parsed.
  scoreScale: number;
  // Hard cap on bytes between matched open/close tags. Enforced inside drain on
  // every buffered block (PANELIST, ROUND_END, SHIP) so an oversized block that
  // arrives intact in one chunk is rejected before its body is sliced and emitted.
  // The post-drain check on state.buf only catches *unclosed* runaway blocks.
  parserMaxBlockBytes: number;
  // Threaded from parser options into ship event artifactRef so downstream
  // consumers see the real run identity instead of empty placeholders.
  projectId: string;
  artifactId: string;
  inRun: boolean;
  currentRound: number | null;
  // Count of <ROUND_END> events fired since the last <CRITIQUE_RUN> opener.
  // Used by the SHIP envelope guard: a SHIP that arrives before any round
  // completes is malformed and must be rejected.
  roundsClosed: number;
  shipSeen: boolean;
  designerArtifactInRound1: boolean;
  lastAdvance: number;
}

export async function* parseV1(
  source: AsyncIterable<string>,
  opts: {
    runId: string;
    adapter: string;
    parserMaxBlockBytes: number;
    projectId?: string;
    artifactId?: string;
  },
): AsyncIterable<PanelEvent> {
  const state: State = {
    buf: '',
    consumed: 0,
    runId: opts.runId,
    adapter: opts.adapter,
    protocolVersion: 1,
    scoreScale: DEFAULT_SCORE_SCALE,
    parserMaxBlockBytes: opts.parserMaxBlockBytes,
    projectId: opts.projectId ?? '',
    artifactId: opts.artifactId ?? '',
    inRun: false,
    currentRound: null,
    roundsClosed: 0,
    shipSeen: false,
    designerArtifactInRound1: false,
    lastAdvance: 0,
  };

  for await (const chunk of source) {
    state.buf += chunk;
    yield* drain(state);
    // After drain, anything still in the buffer is a partial tag waiting on more input.
    // If that pending block is bigger than the cap, the producer is stuck inside one
    // unclosed block and we have to fail rather than buffer indefinitely. Compare in
    // UTF-8 bytes (mrcfps review #2) so a buffer full of CJK or emoji cannot exceed
    // the configured byte cap while staying under the JS string length cap.
    const bufBytes = Buffer.byteLength(state.buf, 'utf8');
    if (bufBytes > opts.parserMaxBlockBytes) {
      throw new OversizeBlockError(
        `block exceeded ${opts.parserMaxBlockBytes} bytes at position ${state.consumed}`,
        state.consumed,
      );
    }
  }

  yield* drain(state);

  // End-of-stream invariants.
  if (state.inRun && !state.shipSeen) {
    throw new MalformedBlockError(
      `CRITIQUE_RUN never closed (no </CRITIQUE_RUN> and no <SHIP>) at position ${state.consumed}`,
      state.consumed,
    );
  }
}

function* drain(state: State): Generator<PanelEvent> {
  let cursor = 0;

  while (cursor < state.buf.length) {
    const slice = state.buf.slice(cursor);

    // <CRITIQUE_RUN ...>
    if (slice.startsWith('<CRITIQUE_RUN ')) {
      const close = slice.indexOf('>');
      if (close < 0) break;
      const attrs = parseAttrs(slice.slice('<CRITIQUE_RUN'.length, close));
      state.protocolVersion = Number(attrs['version'] ?? '1');
      const declaredScale = Number(attrs['scale'] ?? String(DEFAULT_SCORE_SCALE));
      state.scoreScale = isFinite(declaredScale) && declaredScale > 0 ? declaredScale : DEFAULT_SCORE_SCALE;
      state.inRun = true;
      yield {
        type: 'run_started',
        runId: state.runId,
        protocolVersion: state.protocolVersion,
        cast: ['designer', 'critic', 'brand', 'a11y', 'copy'],
        maxRounds: Number(attrs['maxRounds'] ?? '3'),
        threshold: Number(attrs['threshold'] ?? '8.0'),
        scale: state.scoreScale,
      };
      cursor += close + 1;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // <ROUND n="N">
    const roundMatch = slice.match(/^<ROUND\s+([^>]*)>/);
    if (roundMatch) {
      // Envelope guard (mrcfps review #2): no run-level event may appear before
      // <CRITIQUE_RUN ...> opens the envelope, otherwise downstream consumers
      // see contract-shaped events without the required run_started handshake.
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<ROUND> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      const a = parseAttrs(roundMatch[1] ?? '');
      state.currentRound = Number(a['n']);
      cursor += roundMatch[0].length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // <PANELIST ...>...</PANELIST>
    if (
      slice.startsWith('<PANELIST ') ||
      slice.startsWith('<PANELIST\t') ||
      slice.startsWith('<PANELIST\n')
    ) {
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<PANELIST> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      const closeIdx = slice.indexOf('</PANELIST>');
      if (closeIdx < 0) break;
      // Per-block size enforcement (mrcfps review): a complete oversized block
      // that arrives in one large chunk would otherwise slip past the post-drain
      // buf-size check because its body would be sliced and emitted before the
      // check ran. Catch it here, before any work happens. Use UTF-8 byte length
      // so multibyte content (CJK, emoji) cannot bypass the byte-defined cap.
      const blockText = slice.slice(0, closeIdx + '</PANELIST>'.length);
      const blockBytes = Buffer.byteLength(blockText, 'utf8');
      if (blockBytes > state.parserMaxBlockBytes) {
        throw new OversizeBlockError(
          `PANELIST block of ${blockBytes} bytes exceeded ${state.parserMaxBlockBytes} at position ${state.consumed + cursor}`,
          state.consumed + cursor,
        );
      }
      const headEnd = slice.indexOf('>');
      // headEnd must be the opener's closing >, which has to come BEFORE the
      // matched </PANELIST>. Without this guard a malformed opener like
      // <PANELIST role="critic" score="8"</PANELIST> (no opening >) would
      // pick up the closing tag's > and emit panelist events for an invalid block.
      if (headEnd < 0) break;
      if (headEnd >= closeIdx) {
        throw new MalformedBlockError(
          `<PANELIST> opening tag at position ${state.consumed + cursor} has no closing > before </PANELIST>`,
          state.consumed + cursor,
        );
      }
      const head = slice.slice('<PANELIST'.length, headEnd);
      const body = slice.slice(headEnd + 1, closeIdx);
      // Nesting guard: if another <PANELIST opening appears inside what we believe
      // is this PANELIST body, the current block was never closed and we are about
      // to mis-attribute the next sibling's content. Treat as malformed.
      if (/<PANELIST[\s>]/.test(body)) {
        throw new MalformedBlockError(
          `PANELIST block at position ${state.consumed + cursor} never closed before the next <PANELIST opening`,
          state.consumed + cursor,
        );
      }
      const attrs = parseAttrs(head);
      const roleStr = attrs['role'];

      if (!roleStr || !KNOWN_ROLES.has(roleStr)) {
        yield {
          type: 'parser_warning',
          runId: state.runId,
          kind: 'unknown_role',
          position: state.consumed + cursor,
        };
        cursor += closeIdx + '</PANELIST>'.length;
        state.lastAdvance = state.consumed + cursor;
        continue;
      }

      const role = roleStr as PanelistRole;
      // A PANELIST block must appear inside a <ROUND n="..."> envelope. If no round
      // has been opened (or the n attribute parsed to NaN), the stream is malformed
      // and emitting events with an invalid round would corrupt every downstream
      // consumer (reducer, scoreboard, persistence).
      if (state.currentRound == null || !Number.isFinite(state.currentRound)) {
        throw new MalformedBlockError(
          `PANELIST at position ${state.consumed + cursor} appeared before a valid <ROUND n="..."> opening`,
          state.consumed + cursor,
        );
      }
      const round = state.currentRound;

      yield { type: 'panelist_open', runId: state.runId, round, role };

      yield* emitInner(state, role, body);

      const rawScore = Number(attrs['score'] ?? '0');
      const score = clampScore(rawScore, state.scoreScale);
      if (isOutOfRange(rawScore, state.scoreScale)) {
        yield {
          type: 'parser_warning',
          runId: state.runId,
          kind: 'score_clamped',
          position: state.consumed + cursor,
        };
      }
      yield { type: 'panelist_close', runId: state.runId, round, role, score };

      cursor += closeIdx + '</PANELIST>'.length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // <ROUND_END n="N" ...>...</ROUND_END>
    if (slice.startsWith('<ROUND_END ')) {
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<ROUND_END> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      const closeIdx = slice.indexOf('</ROUND_END>');
      if (closeIdx < 0) break;
      const blockText = slice.slice(0, closeIdx + '</ROUND_END>'.length);
      const blockBytes = Buffer.byteLength(blockText, 'utf8');
      if (blockBytes > state.parserMaxBlockBytes) {
        throw new OversizeBlockError(
          `ROUND_END block of ${blockBytes} bytes exceeded ${state.parserMaxBlockBytes} at position ${state.consumed + cursor}`,
          state.consumed + cursor,
        );
      }
      const headEnd = slice.indexOf('>');
      if (headEnd < 0) break;
      if (headEnd >= closeIdx) {
        throw new MalformedBlockError(
          `<ROUND_END> opening tag at position ${state.consumed + cursor} has no closing > before </ROUND_END>`,
          state.consumed + cursor,
        );
      }
      const attrs = parseAttrs(slice.slice('<ROUND_END'.length, headEnd));
      const inner = slice.slice(headEnd + 1, closeIdx);
      const reason = (inner.match(/<REASON>([\s\S]*?)<\/REASON>/)?.[1] ?? '').trim();

      // The wire protocol (spec § Wire protocol parser invariants) requires the
      // designer to emit exactly one <ARTIFACT> in round 1. Subsequent rounds may
      // omit ARTIFACT and ship NOTES-only (the designer is iterating in place).
      // If protocol v2 ever relaxes this to "at any point before SHIP", widen the
      // check to use a `designerArtifactSeen` flag instead.
      if (state.currentRound === 1 && !state.designerArtifactInRound1) {
        throw new MissingArtifactError(
          `round 1 closed at position ${state.consumed + cursor} without designer ARTIFACT`,
        );
      }

      yield {
        type: 'round_end',
        runId: state.runId,
        round: Number(attrs['n']),
        composite: Number(attrs['composite'] ?? '0'),
        mustFix: Number(attrs['must_fix'] ?? '0'),
        decision: attrs['decision'] === 'ship' ? 'ship' : 'continue',
        reason,
      };
      state.currentRound = null;
      state.roundsClosed += 1;
      cursor += closeIdx + '</ROUND_END>'.length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // </ROUND>
    if (slice.startsWith('</ROUND>')) {
      cursor += '</ROUND>'.length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // <SHIP ...>...</SHIP>
    if (slice.startsWith('<SHIP ')) {
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<SHIP> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      // Envelope guard: SHIP must not arrive before at least one round has
      // completed. A stream that skips directly from <CRITIQUE_RUN> to <SHIP>
      // bypasses the round-1 designer-artifact invariant.
      if (state.roundsClosed === 0) {
        throw new MalformedBlockError(
          `<SHIP> at position ${state.consumed + cursor} appeared before any <ROUND_END>`,
          state.consumed + cursor,
        );
      }
      const closeIdx = slice.indexOf('</SHIP>');
      if (closeIdx < 0) break;
      const blockText = slice.slice(0, closeIdx + '</SHIP>'.length);
      const blockBytes = Buffer.byteLength(blockText, 'utf8');
      if (blockBytes > state.parserMaxBlockBytes) {
        throw new OversizeBlockError(
          `SHIP block of ${blockBytes} bytes exceeded ${state.parserMaxBlockBytes} at position ${state.consumed + cursor}`,
          state.consumed + cursor,
        );
      }

      if (state.shipSeen) {
        yield {
          type: 'parser_warning',
          runId: state.runId,
          kind: 'duplicate_ship',
          position: state.consumed + cursor,
        };
        cursor += closeIdx + '</SHIP>'.length;
        state.lastAdvance = state.consumed + cursor;
        continue;
      }

      state.shipSeen = true;
      const headEnd = slice.indexOf('>');
      if (headEnd < 0) break;
      if (headEnd >= closeIdx) {
        throw new MalformedBlockError(
          `<SHIP> opening tag at position ${state.consumed + cursor} has no closing > before </SHIP>`,
          state.consumed + cursor,
        );
      }
      const attrs = parseAttrs(slice.slice('<SHIP'.length, headEnd));
      const inner = slice.slice(headEnd + 1, closeIdx);

      // Validate that a non-empty <ARTIFACT> block is present inside <SHIP>.
      const artifactMatch = inner.match(/<ARTIFACT\b[^>]*>([\s\S]*?)<\/ARTIFACT>/);
      if (!artifactMatch || artifactMatch[1] === undefined || artifactMatch[1].trim().length === 0) {
        throw new MissingArtifactError(
          `<SHIP> at position ${state.consumed + cursor} contains no <ARTIFACT> block or the block is empty`,
        );
      }

      const summary = (inner.match(/<SUMMARY>([\s\S]*?)<\/SUMMARY>/)?.[1] ?? '').trim();

      const rawStatus = attrs['status'] ?? '';
      const validStatuses = ['shipped', 'below_threshold', 'timed_out', 'interrupted'] as const;
      const status = (
        validStatuses.includes(rawStatus as (typeof validStatuses)[number])
          ? rawStatus
          : 'shipped'
      ) as 'shipped' | 'below_threshold' | 'timed_out' | 'interrupted';

      yield {
        type: 'ship',
        runId: state.runId,
        round: Number(attrs['round'] ?? '0'),
        composite: Number(attrs['composite'] ?? '0'),
        status,
        artifactRef: { projectId: state.projectId, artifactId: state.artifactId },
        summary,
      };
      cursor += closeIdx + '</SHIP>'.length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // </CRITIQUE_RUN>
    if (slice.startsWith('</CRITIQUE_RUN>')) {
      state.inRun = false;
      cursor += '</CRITIQUE_RUN>'.length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // Whitespace: skip
    const ch = slice.charAt(0);
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      cursor += 1;
      continue;
    }

    // Unknown '<': wait for more bytes (partial tag across chunk boundary)
    if (ch === '<') {
      break;
    }

    // Non-whitespace, non-tag character inside CRITIQUE_RUN: malformed
    if (state.inRun) {
      throw new MalformedBlockError(
        `unexpected character "${ch}" at position ${state.consumed + cursor}`,
        state.consumed + cursor,
      );
    }

    cursor += 1;
  }

  state.consumed += cursor;
  state.buf = state.buf.slice(cursor);
}

function* emitInner(
  state: State,
  role: PanelistRole,
  inner: string,
): Generator<PanelEvent> {
  // emitInner is on the parser hot path. Reuse the module-level regex objects
  // and reset lastIndex so successive runs don't see stale match state.
  const round = state.currentRound;
  if (round == null || !Number.isFinite(round)) {
    // Defensive: callers should already have rejected this, but emitting a
    // panelist_dim with an invalid round value would corrupt downstream state.
    return;
  }

  DIM_RE.lastIndex = 0;
  let dm: RegExpExecArray | null;
  while ((dm = DIM_RE.exec(inner)) !== null) {
    const raw = Number(dm[2]);
    const dimScore = clampScore(raw, state.scoreScale);
    if (isOutOfRange(raw, state.scoreScale)) {
      yield {
        type: 'parser_warning',
        runId: state.runId,
        kind: 'score_clamped',
        position: state.consumed,
      };
    }
    yield {
      type: 'panelist_dim',
      runId: state.runId,
      round,
      role,
      dimName: dm[1] ?? '',
      dimScore,
      dimNote: (dm[3] ?? '').trim(),
    };
  }

  MUST_FIX_RE.lastIndex = 0;
  let mf: RegExpExecArray | null;
  while ((mf = MUST_FIX_RE.exec(inner)) !== null) {
    yield {
      type: 'panelist_must_fix',
      runId: state.runId,
      round,
      role,
      text: (mf[1] ?? '').trim(),
    };
  }

  // The round-1 designer artifact invariant is checked at ROUND_END close. We
  // only flip the flag here so that ROUND_END knows the artifact arrived.
  if (role === 'designer' && round === 1 && /<ARTIFACT\b/.test(inner)) {
    state.designerArtifactInRound1 = true;
  }
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1];
    if (key != null) out[key] = m[2] ?? '';
  }
  return out;
}

// Score range and clamp now respect the run's declared scale (captured from
// <CRITIQUE_RUN scale="..."> into State.scoreScale). Without this a value of
// 42 in a scale=10 run would sneak through and warp composite math.
function isOutOfRange(n: number, scale: number): boolean {
  if (!isFinite(n)) return true;
  return n < 0 || n > scale;
}

function clampScore(n: number, scale: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > scale) return scale;
  return n;
}
