import { describe, expect, it } from 'vitest';
import {
  createRoleMarkerGuard,
  FABRICATED_ROLE_MARKER_RE,
} from '../src/role-marker-guard.js';

describe('FABRICATED_ROLE_MARKER_RE', () => {
  // ── Markdown-style markers ────────────────────────────────────────

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

  // ── Chat-style markers ────────────────────────────────────────────

  it('matches User: after a newline', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('OK\nUser: hello')).toBe(true);
  });

  it('matches Assistant:', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nAssistant: sure')).toBe(true);
  });

  it('matches Human:', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nHuman: what now?')).toBe(true);
  });

  it('matches AI:', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nAI: processing')).toBe(true);
  });

  it('matches user: (lowercase, case-insensitive flag)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nuser: hello')).toBe(true);
  });

  it('matches ASSISTANT: (uppercase)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nASSISTANT: done')).toBe(true);
  });

  it('matches User  : with extra whitespace before colon', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\nUser  : hello')).toBe(true);
  });

  it('matches user: at very start of text', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('user: hello')).toBe(true);
  });

  // ── Leading whitespace tolerance ───────────────────────────────────

  it('matches when line has leading spaces before ## user', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\n  ## user\nfabricated')).toBe(true);
  });

  it('matches when line has leading spaces before User:', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('text\n  User: hello')).toBe(true);
  });

  // ── Negative cases ────────────────────────────────────────────────

  it('does NOT match ## user in the middle of a line (no preceding newline)', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('here is the ## user content')).toBe(false);
  });

  it('does NOT match User: in the middle of a line', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('tell User: something')).toBe(false);
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

  // ── Chat-style detection ──────────────────────────────────────────

  it('detects User: marker', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\nUser: hello');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('User:');
  });

  it('detects Assistant:', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\nAssistant: ok');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('Assistant:');
  });

  it('detects Human:', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\nHuman: hi');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('Human:');
  });

  it('detects AI:', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\nAI: result');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('AI:');
  });

  it('detects user: (lowercase, case-insensitive)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\nuser: hello');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('user:');
  });

  it('detects USER: (uppercase)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\nUSER: hello');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('USER:');
  });

  it('detects User  : with whitespace before colon', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('text\nUser  : hello');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('User  :');
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

  it('handles chat-style marker split across chunks (User + :)', () => {
    const guard = createRoleMarkerGuard('msg-1');
    guard.feedText('OK\nUser');
    expect(guard.contaminated).toBe(false);

    const r2 = guard.feedText(': hello');
    expect(r2).toBe('');
    expect(guard.contaminated).toBe(true);
    expect(guard.warningEvent()!.marker).toBe('User:');
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

  it('warningEvent returns correct shape for User:', () => {
    const guard = createRoleMarkerGuard('msg-7');
    guard.feedText('User: hello');
    expect(guard.warningEvent()).toEqual({
      type: 'fabricated_role_marker',
      marker: 'User:',
      messageId: 'msg-7',
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

  it('does not false-positive on inline role mentions', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('The User: class has a method...');
    expect(result).toBe('The User: class has a method...');
    expect(guard.contaminated).toBe(false);
  });

  it('does not false-positive on ## in the middle of prose', () => {
    const guard = createRoleMarkerGuard('msg-1');
    const result = guard.feedText('I used ## user as a tag name in code.');
    expect(result).toBe('I used ## user as a tag name in code.');
    expect(guard.contaminated).toBe(false);
  });
});
