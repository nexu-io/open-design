import { describe, expect, it } from 'vitest';

import {
  collectCompactionLedgerCandidatesFromMessages,
  parseCompactionLedger,
  serializeCompactionLedger,
  washCompactionLedgerEntries,
} from '../src/runtimes/compaction-ledger.js';

describe('washCompactionLedgerEntries', () => {
  it('merges duplicate identifiers with first occurrence winning', () => {
    const washed = washCompactionLedgerEntries([
      { identifier: 'file:a', description: 'first description', fileName: 'a.html' },
      { identifier: 'file:b', description: 'component styles' },
      { identifier: 'file:a', description: 'losing description', fileName: 'renamed.html' },
    ]);

    expect(washed).toEqual([
      { identifier: 'file:a', description: 'first description', fileName: 'a.html' },
      { identifier: 'file:b', description: 'component styles' },
    ]);
  });

  it('sorts survivors by identifier before the caller stores them', () => {
    const washed = washCompactionLedgerEntries([
      { identifier: 'z-last', description: 'styles' },
      { identifier: 'a-first', description: 'html' },
      { identifier: 'm-middle', description: 'assets' },
    ]);

    expect(washed.map((entry) => entry.identifier)).toEqual(['a-first', 'm-middle', 'z-last']);
  });

  it('drops entries without a usable identifier or description', () => {
    const washed = washCompactionLedgerEntries([
      { identifier: '', description: 'no identifier' },
      { identifier: 'file:ok', description: '' },
      { identifier: 42, description: 'numeric identifier' },
      { identifier: 'file:kept', description: 'kept' },
      { description: 'missing identifier' },
      null,
    ] as never[]);

    expect(washed).toEqual([{ identifier: 'file:kept', description: 'kept' }]);
  });

  it('omits the fileName key when absent so serialization is total', () => {
    const washed = washCompactionLedgerEntries([{ identifier: 'x', description: 'desc' }]);

    expect('fileName' in washed[0]!).toBe(false);
    expect(serializeCompactionLedger(washed)).toBe(
      JSON.stringify([{ identifier: 'x', description: 'desc' }]),
    );
  });
});

describe('parseCompactionLedger', () => {
  it('round-trips the canonical serialization byte for byte', () => {
    const entries = [
      { identifier: 'file:a', description: 'page html', fileName: 'a.html' },
      { identifier: 'file:b', description: 'styles' },
    ];
    const json = serializeCompactionLedger(entries);

    expect(parseCompactionLedger(json)).toEqual(entries);
  });

  it('re-washes a stored ledger that drifted from the canonical shape', () => {
    const parsed = parseCompactionLedger(
      JSON.stringify([
        { identifier: 'b', description: 'b' },
        { identifier: 'a', description: 'a' },
        { identifier: 'a', description: 'duplicate that must lose' },
        { identifier: '', description: 'junk' },
      ]),
    );

    expect(parsed).toEqual([
      { identifier: 'a', description: 'a' },
      { identifier: 'b', description: 'b' },
    ]);
  });

  it('returns an empty ledger for corrupt json', () => {
    expect(parseCompactionLedger('{ not json')).toEqual([]);
    expect(parseCompactionLedger('')).toEqual([]);
  });

  it('returns an empty ledger for non-array payloads', () => {
    expect(parseCompactionLedger('{"identifier":"x"}')).toEqual([]);
    expect(parseCompactionLedger('"a string"')).toEqual([]);
    expect(parseCompactionLedger('null')).toEqual([]);
  });
});

describe('collectCompactionLedgerCandidatesFromMessages', () => {
  const messages = [
    {
      artifactRefs: [{ label: 'src/page.html', kind: 'html' }],
      producedFiles: [{ path: './src/page.html', kind: 'html' }],
      traceObjectFiles: [{ name: 'styles.css', type: 'text/css' }],
    },
    {
      producedFiles: [{ path: '/src/app.js', kind: 'js' }, { name: 'screenshot', type: 'dir' }],
    },
    {
      // Same artifact again in a later turn: the wash must keep the first.
      producedFiles: [{ path: 'src/page.html', kind: 'html' }],
    },
    { producedFiles: 'not an array' },
    { producedFiles: [{ path: '././src/windows\\seps.html', kind: 'html' }] },
  ];

  it('normalizes identifiers and yields unwahsed candidates in message order', () => {
    const candidates = collectCompactionLedgerCandidatesFromMessages(messages);

    expect(candidates.map((c) => c.identifier)).toEqual([
      'src/page.html',
      'src/page.html',
      'styles.css',
      'src/app.js',
      'screenshot',
      'src/page.html',
      'src/windows/seps.html',
    ]);
    expect(candidates[0]).toEqual({
      identifier: 'src/page.html',
      description: 'html',
      fileName: 'src/page.html',
    });
    const dirCandidate = candidates.find((c) => c.identifier === 'screenshot');
    expect(dirCandidate?.description).toBe('dir');
    const jsCandidate = candidates.find((c) => c.identifier === 'src/app.js');
    expect(jsCandidate?.description).toBe('js');
  });

  it('washes into the canonical deduplicated, sorted ledger', () => {
    const washed = washCompactionLedgerEntries(
      collectCompactionLedgerCandidatesFromMessages(messages),
    );

    expect(washed.map((entry) => entry.identifier)).toEqual([
      'screenshot',
      'src/app.js',
      'src/page.html',
      'src/windows/seps.html',
      'styles.css',
    ]);
    expect(washed.find((entry) => entry.identifier === 'src/page.html')?.description).toBe('html');
  });

  it('ignores non-object messages and non-string labels', () => {
    const candidates = collectCompactionLedgerCandidatesFromMessages([
      null,
      'junk',
      { artifactRefs: [{ label: '', kind: 'html' }, { kind: 'html' }] },
      { producedFiles: [null, { path: '' }, { name: 42 }] },
    ]);

    expect(candidates).toEqual([]);
  });
});