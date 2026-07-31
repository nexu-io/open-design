import { describe, expect, it } from 'vitest';
import { highlightCode, highlightCodeTokens } from '../../src/runtime/shiki';

describe('highlightCodeTokens', () => {
  it('colors mixed HTML source without changing its text', async () => {
    const source = [
      '<!doctype html>',
      '<style>body { color: tomato; }</style>',
      '<script>document.body.dataset.ready = "true";</script>',
    ].join('\n');

    const lines = await highlightCodeTokens(source, 'html');

    expect(lines.map((line) => line.map((token) => token.content).join('')).join('\n')).toBe(source);
    expect(lines.flat().some((token) => Boolean(token.color))).toBe(true);
  });

  it('returns no tokens for unsupported languages', async () => {
    await expect(highlightCodeTokens('hello', 'not-a-language')).resolves.toEqual([]);
  });

  it('loads configured languages that are outside the web bundle on demand', async () => {
    await expect(highlightCode('fn main() {}', 'rust')).resolves.toContain('class="shiki');
  });
});
