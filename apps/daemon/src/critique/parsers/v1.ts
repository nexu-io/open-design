import type { PanelEvent, PanelistRole } from '@open-design/contracts';
import { MalformedBlockError, MissingArtifactError, OversizeBlockError } from '../errors.js';

const KNOWN_ROLES: ReadonlySet<string> = new Set(['designer', 'critic', 'brand', 'a11y', 'copy']);

interface State {
  buf: string;
  consumed: number;
  runId: string;
  adapter: string;
  protocolVersion: number;
  inRun: boolean;
  currentRound: number | null;
  shipSeen: boolean;
  designerArtifactInRound1: boolean;
  lastAdvance: number;
}

export async function* parseV1(
  source: AsyncIterable<string>,
  opts: { runId: string; adapter: string; parserMaxBlockBytes: number },
): AsyncIterable<PanelEvent> {
  const state: State = {
    buf: '',
    consumed: 0,
    runId: opts.runId,
    adapter: opts.adapter,
    protocolVersion: 1,
    inRun: false,
    currentRound: null,
    shipSeen: false,
    designerArtifactInRound1: false,
    lastAdvance: 0,
  };

  for await (const chunk of source) {
    state.buf += chunk;
    yield* drain(state);
    // Overflow check: if the buffer grew past the cap without progress since last drain.
    if (
      state.buf.length > opts.parserMaxBlockBytes &&
      state.consumed - state.lastAdvance < state.buf.length
    ) {
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
      state.inRun = true;
      yield {
        type: 'run_started',
        runId: state.runId,
        protocolVersion: state.protocolVersion,
        cast: ['designer', 'critic', 'brand', 'a11y', 'copy'],
        maxRounds: Number(attrs['maxRounds'] ?? '3'),
        threshold: Number(attrs['threshold'] ?? '8.0'),
        scale: Number(attrs['scale'] ?? '10'),
      };
      cursor += close + 1;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    // <ROUND n="N">
    const roundMatch = slice.match(/^<ROUND\s+([^>]*)>/);
    if (roundMatch) {
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
      const closeIdx = slice.indexOf('</PANELIST>');
      if (closeIdx < 0) break;
      const headEnd = slice.indexOf('>');
      if (headEnd < 0) break;
      const head = slice.slice('<PANELIST'.length, headEnd);
      const body = slice.slice(headEnd + 1, closeIdx);
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
      const round = state.currentRound!;

      yield { type: 'panelist_open', runId: state.runId, round, role };

      yield* emitInner(state, role, body);

      const rawScore = Number(attrs['score'] ?? '0');
      const score = clampScore(rawScore);
      if (isOutOfRange(rawScore)) {
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
      const closeIdx = slice.indexOf('</ROUND_END>');
      if (closeIdx < 0) break;
      const headEnd = slice.indexOf('>');
      if (headEnd < 0) break;
      const attrs = parseAttrs(slice.slice('<ROUND_END'.length, headEnd));
      const inner = slice.slice(headEnd + 1, closeIdx);
      const reason = (inner.match(/<REASON>([\s\S]*?)<\/REASON>/)?.[1] ?? '').trim();

      // Round 1 designer must have produced an artifact before round 1 closes.
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
      const closeIdx = slice.indexOf('</SHIP>');
      if (closeIdx < 0) break;

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
      const attrs = parseAttrs(slice.slice('<SHIP'.length, headEnd));
      const inner = slice.slice(headEnd + 1, closeIdx);
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
        artifactRef: { projectId: '', artifactId: '' },
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
  // <DIM name="X" score="Y">note</DIM>
  const dimRe = /<DIM\s+name="([^"]+)"\s+score="([^"]+)">([\s\S]*?)<\/DIM>/g;
  let dm: RegExpExecArray | null;
  while ((dm = dimRe.exec(inner)) !== null) {
    const raw = Number(dm[2]);
    const dimScore = clampScore(raw);
    if (isOutOfRange(raw)) {
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
      round: state.currentRound!,
      role,
      dimName: dm[1] ?? '',
      dimScore,
      dimNote: (dm[3] ?? '').trim(),
    };
  }

  // <MUST_FIX>text</MUST_FIX>
  const mfRe = /<MUST_FIX>([\s\S]*?)<\/MUST_FIX>/g;
  let mf: RegExpExecArray | null;
  while ((mf = mfRe.exec(inner)) !== null) {
    yield {
      type: 'panelist_must_fix',
      runId: state.runId,
      round: state.currentRound!,
      role,
      text: (mf[1] ?? '').trim(),
    };
  }

  // Track designer artifact in round 1
  if (role === 'designer' && state.currentRound === 1 && /<ARTIFACT\b/.test(inner)) {
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

function isOutOfRange(n: number): boolean {
  if (!isFinite(n)) return true;
  return n < 0 || n > 100;
}

function clampScore(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
