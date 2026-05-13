import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '../../src/runtime/markdown';

function html(input: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(input)}</>);
}

describe('renderMarkdown', () => {
  it('autolinks bare https URLs without breaking on underscores in query params', () => {
    // OAuth-style URL with underscores in `response_type`, `client_id`,
    // `code_challenge`, `code_challenge_method`. The previous renderer
    // greedily matched `_..._` as italic and shredded the URL into pieces.
    const url =
      'https://mcp.higgsfield.ai/oauth2/authorize?response_type=code&client_id=abc&code_challenge=xyz&code_challenge_method=S256';
    // HTML attribute encoding swaps `&` for `&amp;` — compare against the
    // encoded form rather than the raw URL we passed in.
    const encoded = url.replace(/&/g, '&amp;');
    const out = html(`Open this link: ${url}`);
    expect(out).toContain(`href="${encoded}"`);
    expect(out).toContain(`>${encoded}</a>`);
    // The italic <em> tag should NOT have been emitted from the URL fragments.
    expect(out).not.toContain('<em>');
  });

  it('keeps italic working in regular prose', () => {
    const out = html('A word with _emphasis_ here.');
    expect(out).toContain('<em>emphasis</em>');
  });

  it('renders explicit [text](url) markdown links', () => {
    const out = html('Click [here](https://example.com/page) to continue.');
    expect(out).toContain('<a class="md-link"');
    expect(out).toContain('href="https://example.com/page"');
    expect(out).toContain('>here</a>');
  });

  it('marks bare URLs with the bare-link class so CSS can break them mid-string', () => {
    const out = html('See https://example.com/very/long/path?with=long&query=string');
    expect(out).toContain('md-link-bare');
  });

  it('does not autolink inside inline code spans', () => {
    const out = html('Use `https://example.com/x` literally.');
    // The URL should appear inside a <code> tag, not turned into an anchor.
    expect(out).toContain('<code class="md-inline-code">https://example.com/x</code>');
  });

  it('renders a GFM pipe table with header, body, and alignment', () => {
    const md = [
      '| L | C | R |',
      '|:---|:---:|---:|',
      '| a | b | c |',
      '| d | e | f |',
    ].join('\n');
    const out = html(md);
    expect(out).toContain('<div class="md-table-wrap">');
    expect(out).toContain('<table class="md-table">');
    expect(out).toContain('<th style="text-align:left">L</th>');
    expect(out).toContain('<th style="text-align:center">C</th>');
    expect(out).toContain('<th style="text-align:right">R</th>');
    expect(out).toContain('<td style="text-align:left">a</td>');
    expect(out).toContain('<td style="text-align:right">f</td>');
    expect(out).not.toContain('<p>| L');
  });

  it('renders inline code and bold inside table cells', () => {
    const md = ['| k | v |', '|---|---|', '| `id` | **bold** |'].join('\n');
    const out = html(md);
    expect(out).toContain('<code class="md-inline-code">id</code>');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('keeps escaped pipes literal inside a cell', () => {
    const md = ['| a | b |', '|---|---|', '| x \\| y | z |'].join('\n');
    const out = html(md);
    expect(out).toContain('x | y');
  });

  it('breaks the preceding paragraph at a table start without a blank line', () => {
    const md = ['Intro paragraph', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n');
    const out = html(md);
    expect(out).toContain('Intro paragraph');
    expect(out).toContain('<div class="md-table-wrap">');
    expect(out).toContain('<table class="md-table">');
    expect(out).not.toContain('Intro paragraph\n| a');
  });

  it('does not promote a stray pipe-containing line to a table', () => {
    const out = html('Just a line with a | pipe.');
    expect(out).not.toContain('<table');
    expect(out).toContain('| pipe');
  });

  it('treats pipes inside a backtick code span as cell content, not column boundaries', () => {
    // TypeScript-style union cells contain a literal `|` inside backticks.
    // The pre-review splitter ran before inline parsing and shredded such
    // rows; this asserts the scan-based splitter keeps the code span whole
    // (one body cell, not two).
    const md = ['| status | type |', '|---|---|', '| ok | `"ready" | "done"` |'].join('\n');
    const out = html(md);
    expect(out).toContain('<code class="md-inline-code">&quot;ready&quot; | &quot;done&quot;</code>');
    // Exactly two <td> cells in the body row — pipe inside backticks must
    // not have introduced a phantom third column.
    const bodyTd = (out.match(/<tbody>[\s\S]*<\/tbody>/)?.[0] ?? '').match(/<td/g) ?? [];
    expect(bodyTd.length).toBe(2);
  });
});
