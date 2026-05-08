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
});
