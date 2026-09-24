import { describe, expect, it } from 'vitest';

import {
  buildCompactionSummaryPrompt,
  extractCompactionSummaryText,
  renderCompactionSpanTranscript,
} from '../src/runtimes/compaction-summary.js';

describe('buildCompactionSummaryPrompt', () => {
  it('is self-contained: carries the transcript and forbids anything but the summary', () => {
    const prompt = buildCompactionSummaryPrompt({
      transcript: '## user\nbuild the page\n\n## assistant\nwrote page.html',
      ledgerLines: ['- file:page: page.html'],
    });

    expect(prompt).toContain('## Full conversation transcript');
    expect(prompt).toContain('build the page');
    expect(prompt).toContain('do not output anything except the summary');
    expect(prompt).toContain('## Workspace ledger (machine-extracted; trust it over the transcript)');
    expect(prompt).toContain('- file:page: page.html');
  });

  it('omits the ledger block entirely when the ledger is empty', () => {
    const prompt = buildCompactionSummaryPrompt({
      transcript: '## user\nhello',
      ledgerLines: [],
    });

    expect(prompt).not.toContain('Workspace ledger');
  });
});

describe('renderCompactionSpanTranscript', () => {
  it('renders chronological role blocks and collapses surrounding whitespace', () => {
    const transcript = renderCompactionSpanTranscript([
      { role: 'user', content: '  build the page  ' },
      { role: 'assistant', content: '\nwrote page.html\n' },
    ]);

    expect(transcript).toBe('## user\nbuild the page\n\n## assistant\nwrote page.html');
  });

  it('skips messages without a role or without text content', () => {
    const transcript = renderCompactionSpanTranscript([
      { role: 'user', content: 'keep me' },
      { role: 'assistant', content: '' },
      { role: '', content: 'no role' },
      { content: 'no role either' },
    ]);

    expect(transcript).toBe('## user\nkeep me');
  });

  it('renders an empty string for an empty span', () => {
    expect(renderCompactionSpanTranscript([])).toBe('');
  });
});

describe('extractCompactionSummaryText', () => {
  it('concatenates agent text_delta frames into the final answer', () => {
    const text = extractCompactionSummaryText([
      { id: 1, event: 'start', data: {} },
      { id: 2, event: 'agent', data: { type: 'text_delta', delta: 'Part one. ' } },
      { id: 3, event: 'agent', data: { type: 'text_delta', delta: 'Part two.' } },
      { id: 4, event: 'agent', data: { type: 'thinking_delta', delta: 'noise' } },
      { id: 5, event: 'agent', data: { type: 'usage' } },
      { id: 6, event: 'end', data: {} },
    ]);

    expect(text).toBe('Part one. Part two.');
  });

  it('also accepts the legacy plain text frame shape', () => {
    const text = extractCompactionSummaryText([
      { id: 1, event: 'agent', data: { type: 'text', text: 'legacy answer' } },
    ]);

    expect(text).toBe('legacy answer');
  });

  it('returns null when no text frames were emitted', () => {
    expect(extractCompactionSummaryText([])).toBeNull();
    expect(
      extractCompactionSummaryText([
        { id: 1, event: 'agent', data: { type: 'thinking_delta', delta: 'only thinking' } },
      ]),
    ).toBeNull();
  });

  it('extracts plain-stream stdout chunks (antigravity channel)', () => {
    expect(extractCompactionSummaryText([
      { event: 'progress', data: { stage: 'summarizing' } },
      { event: 'stdout', data: { chunk: '## Summary\n' } },
      { event: 'stdout', data: { chunk: 'Done.' } },
    ])).toBe('## Summary\nDone.');
  });
});