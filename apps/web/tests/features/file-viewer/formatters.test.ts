import { describe, expect, it } from 'vitest';

import {
  defaultTemplateName,
  documentMetaLabel,
  formatJsonFileTextForDisplay,
} from '../../../src/features/file-viewer/formatters';
import type { TranslateFn } from '../../../src/features/file-viewer/types';
import type { ProjectFile } from '../../../src/types';

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'data.json',
    path: 'data.json',
    type: 'file',
    size: 10,
    mtime: 1710000000,
    kind: 'text',
    mime: 'application/json',
    ...overrides,
  };
}

// A translate stub that echoes the key + any vars so tests can assert which
// dict entry a formatter chose without depending on the real locale bundle.
const t: TranslateFn = (key, vars) =>
  vars ? `${key}:${JSON.stringify(vars)}` : String(key);

describe('formatJsonFileTextForDisplay', () => {
  it('returns the text untouched for a non-JSON file', () => {
    const f = file({ name: 'note.txt', mime: 'text/plain' });
    const raw = '{"a":1}';
    expect(formatJsonFileTextForDisplay(f, raw)).toBe(raw);
  });

  it('treats a file as JSON by its .json extension even with a non-JSON mime', () => {
    const f = file({ name: 'data.json', mime: 'text/plain' });
    expect(formatJsonFileTextForDisplay(f, '{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('treats a file as JSON by its application/json mime even without a .json name', () => {
    const f = file({ name: 'payload', mime: 'application/json; charset=utf-8' });
    expect(formatJsonFileTextForDisplay(f, '{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('pretty-prints well-formed JSON with 2-space indentation', () => {
    const out = formatJsonFileTextForDisplay(file(), '{"a":1,"b":[2,3]}');
    expect(out).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it('returns the raw text when parsing fails', () => {
    expect(formatJsonFileTextForDisplay(file(), '{not json')).toBe('{not json');
  });

  it('preserves a signed negative zero literal verbatim', () => {
    const raw = '{"n": -0}';
    expect(formatJsonFileTextForDisplay(file(), raw)).toBe(raw);
  });

  it('preserves a precision-sensitive float literal that would not round-trip', () => {
    const raw = '{"n": 0.12345678901234567890}';
    expect(formatJsonFileTextForDisplay(file(), raw)).toBe(raw);
  });

  it('preserves a large integer whose runtime value is not a safe integer', () => {
    // No `.`/`e`, so the token scan passes, but the parsed number loses
    // precision — the unsafe-number check must catch it and bail to raw text.
    const raw = '{"n": 90071992547409910}';
    expect(formatJsonFileTextForDisplay(file(), raw)).toBe(raw);
  });

  it('preserves a float literal whose runtime value overflows to non-finite', () => {
    const raw = '{"n": 1.5e400}';
    expect(formatJsonFileTextForDisplay(file(), raw)).toBe(raw);
  });

  it('round-trips a zero-valued float literal (normalizes to canonical 0)', () => {
    expect(formatJsonFileTextForDisplay(file(), '{"n": 0.0}')).toBe('{\n  "n": 0\n}');
  });

  it('preserves an unsafe number nested inside arrays and objects', () => {
    const raw = '{"outer": [{"deep": 90071992547409911}]}';
    expect(formatJsonFileTextForDisplay(file(), raw)).toBe(raw);
  });

  it('does not treat an in-string number-shaped literal as precision-sensitive', () => {
    // The `-0` lives inside a string, so the scanner must skip it and still
    // pretty-print the document.
    const out = formatJsonFileTextForDisplay(file(), '{"label": "value -0 here", "n": 1}');
    expect(out).toBe('{\n  "label": "value -0 here",\n  "n": 1\n}');
  });

  it('handles escaped quotes inside strings without desyncing the scanner', () => {
    const out = formatJsonFileTextForDisplay(file(), '{"s": "a \\" -0 b", "n": 2}');
    expect(out).toBe('{\n  "s": "a \\" -0 b",\n  "n": 2\n}');
  });
});

describe('documentMetaLabel', () => {
  it('picks the pdf label', () => {
    expect(documentMetaLabel(file({ kind: 'pdf' }), t)).toBe('fileViewer.pdfMeta');
  });

  it('picks the document label', () => {
    expect(documentMetaLabel(file({ kind: 'document' }), t)).toBe('fileViewer.documentMeta');
  });

  it('picks the presentation label', () => {
    expect(documentMetaLabel(file({ kind: 'presentation' }), t)).toBe('fileViewer.presentationMeta');
  });

  it('picks the spreadsheet label', () => {
    expect(documentMetaLabel(file({ kind: 'spreadsheet' }), t)).toBe('fileViewer.spreadsheetMeta');
  });

  it('falls back to the binary label (human-readable size) for any other kind', () => {
    expect(documentMetaLabel(file({ kind: 'binary', size: 2048 }), t)).toBe(
      'fileViewer.binaryMeta:{"size":"2.0 KB"}',
    );
  });
});

describe('defaultTemplateName', () => {
  it('strips a .html extension', () => {
    expect(defaultTemplateName('landing.html', t)).toBe('landing');
  });

  it('strips a .htm extension case-insensitively', () => {
    expect(defaultTemplateName('Landing.HTM', t)).toBe('Landing');
  });

  it('leaves a non-html file name untouched', () => {
    expect(defaultTemplateName('report.pdf', t)).toBe('report.pdf');
  });

  it('falls back to the translated default when nothing but the extension remains', () => {
    expect(defaultTemplateName('.html', t)).toBe('fileViewer.templateNameDefault');
  });
});
