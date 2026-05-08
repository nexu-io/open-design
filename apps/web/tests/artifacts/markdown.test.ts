import { describe, expect, it } from 'vitest';

import { renderMarkdownToSafeHtml } from '../../src/artifacts/markdown';

describe('renderMarkdownToSafeHtml', () => {
  it('renders common markdown blocks', () => {
    const md = [
      '# Title',
      '',
      'Paragraph with **bold** and *italic* and `code`.',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> note line',
      '',
      '```',
      'const x = 1 < 2;',
      '```',
    ].join('\n');

    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<p>Paragraph with <strong>bold</strong> and <em>italic</em> and <code>code</code>.</p>');
    expect(out).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(out).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(out).toContain('<blockquote>note line</blockquote>');
    expect(out).toContain('<pre><code>const x = 1 &lt; 2;</code></pre>');
  });

  it('escapes raw html', () => {
    const out = renderMarkdownToSafeHtml('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('renders safe links with target attributes', () => {
    const out = renderMarkdownToSafeHtml('[Open](https://example.com)');
    expect(out).toContain('<a href="https://example.com" rel="noreferrer noopener" target="_blank">Open</a>');
  });

  it('keeps underscores inside href intact', () => {
    const out = renderMarkdownToSafeHtml('[x](https://example.com/a_b_c)');
    expect(out).toContain('<a href="https://example.com/a_b_c" rel="noreferrer noopener" target="_blank">x</a>');
    expect(out).not.toContain('<em>b</em>');
  });

  it('escapes raw html inside link text', () => {
    const out = renderMarkdownToSafeHtml('[<img src=x onerror=alert(1)>](https://example.com)');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img ');
  });

  it('keeps markdown emphasis markers literal inside inline code', () => {
    const out = renderMarkdownToSafeHtml('Use `**literal**` and `_literal_` as code.');
    expect(out).toContain('<code>**literal**</code>');
    expect(out).toContain('<code>_literal_</code>');
    expect(out).not.toContain('<code><strong>literal</strong></code>');
    expect(out).not.toContain('<code><em>literal</em></code>');
  });

  it('does not render unsafe link protocols', () => {
    const out = renderMarkdownToSafeHtml('[Bad](javascript:alert(1))');
    expect(out).toContain('<p>Bad)</p>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<a ');
  });
});
