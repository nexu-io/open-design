// @ts-nocheck
// Tests for `apps/daemon/src/finalize-design.ts` — fills in across phases
// D-I. Phase D adds the truncation helper tests; phases E-I extend.
//
// Per memory `project_open_design_493_merged.md`: this file uses
// `import fs from 'node:fs'` (default import) so `vi.spyOn(fs, '<fn>')`
// can redefine properties on the underlying CJS exports object. ESM
// namespace import (`import * as fs from 'node:fs'`) gives a frozen
// Module Namespace Object that `vi.spyOn` cannot mutate.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
  truncateTranscriptForPrompt,
} from '../src/finalize-design.js';

// Touch the imports so the unused-import linter stays quiet on the scaffold.
void fs;
void os;
void path;
void finalizeDesignPackage;
void FinalizePackageLockedError;
void FinalizeUpstreamError;

const HEADER = JSON.stringify({
  kind: 'header',
  schemaVersion: 2,
  projectId: 'proj-1',
  exportedAt: '2026-05-07T14:00:00.000Z',
  conversationCount: 1,
  messageCount: 100,
});

function buildSyntheticJsonl(messageCount: number, perMessageBytes: number): string {
  // Each message line is roughly `perMessageBytes` long after stringify.
  const lines = [HEADER, JSON.stringify({ kind: 'conversation', id: 'c1', title: 't', createdAt: 1, updatedAt: 1 })];
  const padBytes = Math.max(0, perMessageBytes - 80);
  const filler = 'x'.repeat(padBytes);
  for (let i = 0; i < messageCount; i += 1) {
    lines.push(JSON.stringify({
      kind: 'message',
      id: `m${i}`,
      role: 'user',
      position: i,
      blocks: [{ type: 'text', text: `msg-${i}-${filler}` }],
    }));
  }
  return lines.join('\n') + '\n';
}

describe('truncateTranscriptForPrompt', () => {
  it('returns the input verbatim when the JSONL fits under the 384 KiB cap', () => {
    // 50 messages at ~100 bytes each = ~5 KB total; well under the cap.
    const jsonl = buildSyntheticJsonl(50, 100);
    expect(Buffer.byteLength(jsonl, 'utf8')).toBeLessThan(384 * 1024);

    const out = truncateTranscriptForPrompt(jsonl);

    expect(out).toBe(jsonl);
    expect(out).not.toContain('"kind":"truncated"');
    // Every message line round-trips.
    for (let i = 0; i < 50; i += 1) {
      expect(out).toContain(`"id":"m${i}"`);
    }
  });

  it('head+tail truncates with a single marker line when the JSONL exceeds the 384 KiB cap', () => {
    // 800 messages at ~1 KB each = ~800 KB total; comfortably above the cap.
    const jsonl = buildSyntheticJsonl(800, 1024);
    expect(Buffer.byteLength(jsonl, 'utf8')).toBeGreaterThan(384 * 1024);

    const out = truncateTranscriptForPrompt(jsonl);

    // Output is bounded by the cap (allow a small tolerance for the
    // marker + reservation slack).
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(384 * 1024);

    // Header line survives.
    expect(out.split('\n')[0]).toBe(HEADER);

    // Exactly one truncation marker present, with a non-zero omittedBytes.
    const markerMatches = out.match(/\{"kind":"truncated","reason":"size","omittedBytes":\d+\}/g);
    expect(markerMatches).not.toBeNull();
    expect(markerMatches).toHaveLength(1);
    const omittedBytes = Number(markerMatches![0].match(/"omittedBytes":(\d+)/)![1]);
    expect(omittedBytes).toBeGreaterThan(0);

    // Both ends preserved: first message after header survives; last
    // message before the trailing newline survives.
    expect(out).toContain('"id":"m0"');
    expect(out).toContain('"id":"m799"');

    // Middle messages (e.g. m400) should NOT all survive — at least one
    // must be omitted; otherwise we wouldn't have needed the marker.
    const surviving = (out.match(/"id":"m\d+"/g) || []).map((s) => Number(s.match(/m(\d+)/)![1]));
    expect(surviving.length).toBeLessThan(800);
    expect(surviving).toContain(0);
    expect(surviving).toContain(799);
  });
});

describe.skip('finalizeDesignPackage (phases E-I land remaining bodies)', () => {
  it('placeholder', () => {
    /* phases E-I add real cases here */
  });
});
