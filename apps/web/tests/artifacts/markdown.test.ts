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

  it('renders a GFM pipe table with header and body rows', () => {
    const md = [
      '| 字段 | 类型 | 说明 |',
      '|---|---|---|',
      '| id | string | 主键 |',
      '| name | string | 简称 |',
    ].join('\n');
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<div class="md-table-wrap"><table class="md-table">');
    expect(out).toContain('<thead><tr><th>字段</th><th>类型</th><th>说明</th></tr></thead>');
    expect(out).toContain('<td>id</td><td>string</td><td>主键</td>');
    expect(out).toContain('<td>name</td><td>string</td><td>简称</td>');
    expect(out).not.toContain('<p>| 字段');
  });

  it('honors :--- / ---: / :---: column alignment markers', () => {
    const md = [
      '| L | C | R |',
      '|:---|:---:|---:|',
      '| a | b | c |',
    ].join('\n');
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<th style="text-align:left">L</th>');
    expect(out).toContain('<th style="text-align:center">C</th>');
    expect(out).toContain('<th style="text-align:right">R</th>');
    expect(out).toContain('<td style="text-align:left">a</td>');
    expect(out).toContain('<td style="text-align:center">b</td>');
    expect(out).toContain('<td style="text-align:right">c</td>');
  });

  it('formats inline markup inside table cells', () => {
    const md = ['| key | value |', '|---|---|', '| `id` | **bold** |'].join('\n');
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<td><code>id</code></td>');
    expect(out).toContain('<td><strong>bold</strong></td>');
  });

  it('keeps escaped pipes \\| as literal | inside a cell', () => {
    const md = ['| a | b |', '|---|---|', '| x \\| y | z |'].join('\n');
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<td>x | y</td>');
    expect(out).toContain('<td>z</td>');
  });

  it('pads short rows with empty cells', () => {
    const md = ['| a | b | c |', '|---|---|---|', '| x | y |'].join('\n');
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<tr><td>x</td><td>y</td><td></td></tr>');
  });

  it('breaks a preceding paragraph at a table start without a blank line', () => {
    const md = ['Some paragraph', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n');
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<p>Some paragraph</p>');
    expect(out).toContain('<div class="md-table-wrap"><table class="md-table">');
  });

  it('does not promote a stray pipe-containing paragraph to a table', () => {
    const md = 'Just a line with a | pipe in it.';
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<p>Just a line with a | pipe in it.</p>');
    expect(out).not.toContain('<table');
  });

  it('treats pipes inside a backtick code span as cell content, not column boundaries', () => {
    // Common TypeScript-style union-type cell — the `|` between `"ready"`
    // and `"done"` lives inside the backtick code span and must not split
    // the cell. Without this, the row collapses from 2 columns to 3.
    const md = ['| status | type |', '|---|---|', '| ok | `"ready" \| "done"` |'].join('\n');
    const out = renderMarkdownToSafeHtml(md);
    expect(out).toContain('<tr><td>ok</td><td><code>&quot;ready&quot; | &quot;done&quot;</code></td></tr>');
  });
});
