import { describe, expect, it } from 'vitest';
import {
  createRoleMarkerGuard,
  FABRICATED_ROLE_MARKER_RE,
} from '../src/role-marker-guard.js';

describe('FABRICATED_ROLE_MARKER_RE', () => {
  // ── Markdown-style markers (in scope) ─────────────────────────────

  it('matches ## user at start of text', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## user\nfabricated')).toBe(true);
  });

  it('matches ## assistant at start of text', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## assistant\nfabricated')).toBe(true);
  });

  it('matches ## system at start of text', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## system\nfabricated')).toBe(true);
  });

  it('matches ## assist (short form)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## assist\nfabricated')).toBe(true);
  });

  it('matches ## user after a newline', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('OK\n## user\nfabricated')).toBe(true);
  });

  it('matches ##   user with extra whitespace between ## and role', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\n##   user\nfabricated')).toBe(true);
  });

  it('matches ##\tuser with tab between ## and role', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\n##\tuser\nfabricated')).toBe(true);
  });

  it('matches ## assistantReading (glued — no separator after role)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\n## assistantReading the file')).toBe(true);
  });

  it('matches ## USER (uppercase, case-insensitive)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\n## USER\nfabricated')).toBe(true);
  });

  // ── Leading whitespace tolerance ───────────────────────────────────

  it('matches when line has leading spaces before ## user', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\n  ## user\nfabricated')).toBe(true);
  });

  // ── Chat-style markers (deliberately out of scope) ─────────────────
  // These are documented as intentionally excluded — see docblock in
  // role-marker-guard.ts. The host doesn't parse them as turn boundaries
  // and they collide with legitimate output too often to be paired with
  // kill-on-detection.

  it('does NOT match User: marker (chat-style out of scope)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('OK\nUser: hello')).toBe(false);
  });

  it('does NOT match Assistant: marker', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nAssistant: sure')).toBe(false);
  });

  it('does NOT match Human: marker', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nHuman: what now?')).toBe(false);
  });

  it('does NOT match AI: marker', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nAI: processing')).toBe(false);
  });

  // ── Negative cases ────────────────────────────────────────────────

  it('does NOT match ## user in the middle of a line (no preceding newline)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('here is the ## user content')).toBe(false);
  });

  it('does NOT match plain text without markers', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('This is a normal response.')).toBe(false);
  });

  it('does NOT match empty string', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('')).toBe(false);
  });

  it('does NOT match ## usability (different word, no match in alternation)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## usability improvements')).toBe(false);
  });

  it('does NOT match common legitimate "User: bob@example.com"-style content', () => {
    expect(
      FABRICATED_ROLE_MARKER_RE.test(
        'Here is the contact:\nUser: bob@example.com\nRole: admin',
      ),
    ).toBe(false);
  });
});

describe('createRoleMarkerGuard', () => {
  // ── Normal text ───────────────────────────────────────────────────

  it('passes normal text through unchanged', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('Hello, world!');
    expect(result).toBe('Hello, world!');
    expect(guard.contaminated).toBe(false);
    expect(guard.warningEvent()).toBeNull();
  });

  it('passes multiple normal chunks through', () => {
    const guard = createRoleMarkerGuard('msg-1');
    expect(guard.feedText('First. ')).toBe('First. ');
    expect(guard.feedText('Second.')).toBe('Second.');
    expect(guard.contaminated).toBe(false);
  });

  // ── Markdown-style detection ──────────────────────────────────────

  it('detects ## user and returns only safe prefix (newline excluded)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('OK\n## user\nfabricated');
    expect(result).toBe('OK');
    expect(guard.contaminated).toBe(true);
  });

  it('detects ## assistant', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\n## assistant\nfabricated');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## assistant');
  });

  it('detects ## system', () => {
    const guard = createRoleMarkerGuard('msg-2');
    guard.feedText('text\n## system\nfabricated');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## system');
  });

  it('detects ## assist (short form)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\n## assist\nfabricated');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## assist');
  });

  it('detects ##   user with extra whitespace', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\n##   user\nfabricated');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('##   user');
  });

  it('detects glued ## assistantReading via assist-prefix alternation', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('Done.\n## assistantReading the file...');
    expect(result).toBe('Done.');
    expect(guard.contaminated).toBe(true);
  });

  // ── Chat-style is NOT detected (intentional, see docblock) ────────

  it('does NOT detect User: marker (out of scope)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('text\nUser: hello');
    expect(result).toBe('text\nUser: hello');
    expect(guard.contaminated).toBe(false);
  });

  it('does NOT detect Assistant: marker (out of scope)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('text\nAssistant: sure');
    expect(result).toBe('text\nAssistant: sure');
    expect(guard.contaminated).toBe(false);
  });

  // ── Cross-chunk detection ─────────────────────────────────────────

  it('detects marker split across chunk boundaries', () => {
    const guard = createRoleMarkerGuard('msg-1');
    // '\n' is in chunk 1, marker starts in chunk 2
    const r1 = guard.feedText('Some text\n');
    expect(r1).toBe('Some text\n');
    expect(guard.contaminated).toBe(false);

    const r2 = guard.feedText('## user\nfabricated!');
    expect(r2).toBe('');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## user');
  });

  it('handles marker split mid-word (## use + r)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('OK\n## use');
    expect(guard.contaminated).toBe(false);

    const r2 = guard.feedText('r\nfabricated');
    expect(r2).toBe('');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## user');
  });

  it('returns safe portion when marker is mid-chunk', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('Prefix. ');
    const r2 = guard.feedText('More.\n## assistant\nfabricated');
    expect(r2).toBe('More.');
    expect(guard.contaminated).toBe(true);
  });

  it('returns empty when marker is at very start of first chunk', () => {
    const guard = createRoleMarkerGuard('msg-1');
    expect(guard.feedText('## user\nfabricated')).toBe('');
    expect(guard.contaminated).toBe(true);
  });

  // ── Bounded tail / O(1) memory behaviour ──────────────────────────

  it('detects a marker after a long stream of clean text (bounded tail still catches it)', () => {
    const guard = createRoleMarkerGuard('msg-long');
    // Feed 10 KB of clean text in small chunks to ensure the rolling tail
    // is well past its initial size before the marker arrives.
    const chunk = 'lorem ipsum dolor sit amet, consectetur adipiscing. ';
    let totalEmitted = 0;
    for (let i = 0; i < 200; i++) {
      const out = guard.feedText(chunk);
      expect(out).toBe(chunk);
      totalEmitted += out.length;
    }
    expect(guard.contaminated).toBe(false);
    expect(totalEmitted).toBe(chunk.length * 200);

    // Then introduce a marker. The guard must still detect it across the
    // last-clean-byte / first-marker-byte boundary.
    const out = guard.feedText('done.\n## user\nfabricated');
    expect(out).toBe('done.');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## user');
  });

  it('detects a marker straddling a chunk boundary after many prior chunks', () => {
    const guard = createRoleMarkerGuard('msg-straddle');
    // Long clean preamble in many small chunks.
    for (let i = 0; i < 100; i++) {
      guard.feedText('clean. ');
    }
    expect(guard.contaminated).toBe(false);

    // Marker straddles the next chunk pair.
    const r1 = guard.feedText('end of preamble.\n## us');
    expect(r1).toBe('end of preamble.\n## us');
    expect(guard.contaminated).toBe(false);

    const r2 = guard.feedText('er\nfabricated');
    expect(r2).toBe('');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## user');
  });

  // ── Streaming-anchor regression (PR #3303 review r3324060995) ─────
  // The bounded-tail refactor must not let `^` in the canonical regex
  // anchor at an arbitrary mid-stream cut point. When `tail` is a
  // slice, only `\n`-preceded markers are real role boundaries; an
  // `^`-anchored match on a sliced buffer is an artifact of the
  // window, not the model's emission.

  it('does not contaminate when mid-line `## user` is streamed char-by-char (no preceding newline)', () => {
    const guard = createRoleMarkerGuard('msg-stream');
    const fullText = '...take a look at the ## user content section of the docs...';
    for (const ch of fullText) {
      guard.feedText(ch);
    }
    expect(guard.contaminated).toBe(false);
    expect(guard.warningEvent()).toBeNull();
  });

  it('does not contaminate when space-preceded `## user` is streamed char-by-char (no preceding newline)', () => {
    const guard = createRoleMarkerGuard('msg-stream-2');
    // Long preamble (>64 chars) to guarantee `tail` becomes a slice,
    // then a space + `## user` mid-line. The `^` alternative would
    // false-positive on the sliced window; only a real `\n` should.
    const fullText =
      'lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do ' +
      'eiusmod tempor ## user incididunt ut labore et dolore magna aliqua.';
    for (const ch of fullText) {
      guard.feedText(ch);
    }
    expect(guard.contaminated).toBe(false);
  });

  it('still contaminates when a real \\n-preceded `## user` is streamed char-by-char', () => {
    const guard = createRoleMarkerGuard('msg-stream-3');
    // Same preamble length as above, but with a real newline before the
    // marker. Must contaminate even though tail has rolled forward.
    const fullText =
      'lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do ' +
      'eiusmod tempor\n## user incididunt';
    for (const ch of fullText) {
      guard.feedText(ch);
    }
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## user');
  });

  it('contaminates when `## user` is the very first chunk (^ legitimate at message start)', () => {
    const guard = createRoleMarkerGuard('msg-stream-4');
    expect(guard.feedText('## user fabricated')).toBe('');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('## user');
  });

  // ── Post-contamination ────────────────────────────────────────────

  it('silently drops text after contamination', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('OK\n## user\nfabricated');
    expect(guard.contaminated).toBe(true);

    expect(guard.feedText('More text')).toBe('');
    expect(guard.feedText('Even more')).toBe('');
  });

  // ── warningEvent ──────────────────────────────────────────────────

  it('warningEvent returns null when not contaminated', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('Normal text.');
    expect(guard.warningEvent()).toBeNull();
  });

  it('warningEvent returns correct shape for ## assistant', () => {
    const guard = createRoleMarkerGuard('msg-42');
    guard.feedText('## assistant\nfabricated');
    expect(guard.warningEvent()).toEqual({
      type: 'fabricated_role_marker',
      marker: '## assistant',
      messageId: 'msg-42',
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('handles empty string input', () => {
    const guard = createRoleMarkerGuard('msg-1');
    expect(guard.feedText('')).toBe('');
    expect(guard.contaminated).toBe(false);
  });

  it('handles multiple messages with independent guards', () => {
    const guard1 = createRoleMarkerGuard('msg-1');
    const guard2 = createRoleMarkerGuard('msg-2');

    guard1.feedText('Clean.');
    guard2.feedText('## user\ncontaminated');

    expect(guard1.contaminated).toBe(false);
    expect(guard2.contaminated).toBe(true);
    expect(guard1.warningEvent()).toBeNull();
    expect(guard2.warningEvent()!.messageId).toBe('msg-2');
  });

  it('does not false-positive on ## in the middle of prose', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('I used ## user as a tag name in code.');
    expect(result).toBe('I used ## user as a tag name in code.');
    expect(guard.contaminated).toBe(false);
  });

  it('does not false-positive on legitimate "User: bob@example.com"-style content', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('Contact info:\nUser: bob@example.com\nRole: admin');
    expect(result).toBe('Contact info:\nUser: bob@example.com\nRole: admin');
    expect(guard.contaminated).toBe(false);
  });
});
