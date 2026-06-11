import { describe, expect, it } from 'vitest';

import { diffLine, renderDiffLineContent } from '../src/diff-line.js';

describe('renderDiffLineContent', () => {
  it('escapes carriage returns so they are visible', () => {
    expect(renderDiffLineContent('a\rb')).toBe('a\\rb');
  });

  it('leaves plain content untouched', () => {
    expect(renderDiffLineContent('hello world')).toBe('hello world');
  });
});

describe('diffLine line-ending handling', () => {
  it('strips a plain LF terminator', () => {
    expect(diffLine('-', 'hello\n')).toBe('-hello');
  });

  // Regression: a CRLF terminator must drop both characters. Slicing only the
  // final '\n' left a trailing '\r' that rendered as a spurious '\r'.
  it('strips a full CRLF terminator without leaving a stray carriage return', () => {
    expect(diffLine('-', 'hello\r\n')).toBe('-hello');
    expect(diffLine('+', 'world\r\n')).toBe('+world');
    expect(diffLine(' ', 'ctx\r\n')).toBe(' ctx');
  });

  it('preserves and escapes a lone trailing CR (no newline)', () => {
    // A bare '\r' is not a line terminator here; it is content and is escaped.
    expect(diffLine('-', 'hello\r')).toBe('-hello\\r');
  });

  it('escapes an interior carriage return regardless of terminator', () => {
    expect(diffLine('-', 'a\rb\r\n')).toBe('-a\\rb');
    expect(diffLine('-', 'a\rb\n')).toBe('-a\\rb');
  });

  it('flags a missing trailing newline', () => {
    expect(diffLine('-', 'hello')).toBe('-hello\n\\ No newline at end of file');
  });

  it('keeps the prefix verbatim', () => {
    expect(diffLine('+', 'x\n')).toBe('+x');
    expect(diffLine(' ', 'x\n')).toBe(' x');
  });
});
