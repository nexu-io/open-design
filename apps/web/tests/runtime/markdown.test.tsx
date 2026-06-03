// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '../../src/runtime/markdown';

function html(input: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(input)}</>);
}

describe('renderMarkdown', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
    cleanup();
    vi.clearAllMocks();
  });

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

  it.each([
    {
      name: 'ascii comma',
      input: 'Open https://example.com/demo, please.',
      href: 'https://example.com/demo',
      rendered: '>https://example.com/demo</a>,',
      excludedHref: 'https://example.com/demo,',
    },
    {
      name: 'fullwidth full stop',
      input: 'Visit https://example.com/final。',
      href: 'https://example.com/final',
      rendered: '>https://example.com/final</a>。',
      excludedHref: 'https://example.com/final。',
    },
    {
      name: 'wrapped in fullwidth parens',
      input: '（https://example.com/a）',
      href: 'https://example.com/a',
      rendered: '（<a class="md-link md-link-bare" href="https://example.com/a"',
      trailing: '>https://example.com/a</a>）',
      excludedHref: 'https://example.com/a）',
    },
    {
      name: 'lone trailing CJK quote',
      input: 'https://example.com/b」',
      href: 'https://example.com/b',
      rendered: '>https://example.com/b</a>」',
      excludedHref: 'https://example.com/b」',
    },
    {
      name: 'stacked CJK punctuation',
      input: 'https://example.com/c。）',
      href: 'https://example.com/c',
      rendered: '>https://example.com/c</a>。）',
      excludedHref: 'https://example.com/c。）',
    },
    {
      name: 'no trailing punctuation',
      input: 'https://example.com/path',
      href: 'https://example.com/path',
      rendered: '>https://example.com/path</a>',
      excludedHref: '',
    },
  ])('keeps bare autolink punctuation handling stable: $name', ({ input, href, rendered, excludedHref, trailing }) => {
    const out = html(input);
    expect(out).toContain(`href="${href}"`);
    expect(out).toContain(rendered);
    if (trailing) {
      expect(out).toContain(trailing);
    }
    if (excludedHref) {
      expect(out).not.toContain(`href="${excludedHref}"`);
    }
  });

  it('does not autolink inside inline code spans', () => {
    const out = html('Use `https://example.com/x` literally.');
    // The URL should appear inside a <code> tag, not turned into an anchor.
    expect(out).toContain('<code class="md-inline-code">https://example.com/x</code>');
  });

  it('renders color swatches for valid hex tokens inside inline code spans', () => {
    const out = html('Palette: `#475569`, `#fff`, `#ffff`, `#11223344`, and `npm install`.');

    expect(out).toContain('<code class="md-inline-code md-color-token">');
    expect(out).toContain('style="background-color:#475569"');
    expect(out).toContain('style="background-color:#fff"');
    expect(out).toContain('style="background-color:#ffff"');
    expect(out).toContain('style="background-color:#11223344"');
    expect(out).toContain('<code class="md-inline-code">npm install</code>');
    expect(out.match(/class="md-color-swatch"/g)?.length).toBe(4);
  });

  it('renders prose color swatches only for 6 and 8 digit hex values', () => {
    const out = html('Use #475569, #11223344, #1672, and #498 in the notes.');

    expect(out).toContain('style="background-color:#475569"');
    expect(out).toContain('style="background-color:#11223344"');
    expect(out).not.toContain('style="background-color:#1672"');
    expect(out).not.toContain('style="background-color:#498"');
    expect(out).toContain('#1672');
    expect(out).toContain('#498');
    expect(out.match(/class="md-color-swatch"/g)?.length).toBe(2);
  });

  it('adds copy controls to fenced code blocks', () => {
    const out = html('```tsx\nexport const ok = true;\n```');
    expect(out).toContain('class="md-code-block"');
    expect(out).toContain('class="md-code-actions"');
    expect(out).toContain('class="md-code-action"');
    expect(out).toContain('>Copy</button>');
    expect(out).toContain('export const ok = true;');
  });

  it('copies fenced code block contents', async () => {
    render(<>{renderMarkdown('```css\n.card { color: red; }\n```')}</>);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('.card { color: red; }');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy();
    });
  });

  it('renders Codex code-comment directives as annotation cards', () => {
    const out = html(
      'Before\n' +
        '::code-comment{title="[P2] Guard empty state" body="This should check the empty queue before reading the first task." file="/repo/apps/web/src/Chat.tsx" start=42 end=44 priority=2}\n' +
        'After',
    );

    expect(out).toContain('Before');
    expect(out).toContain('class="md-code-comment"');
    expect(out).toContain('[P2] Guard empty state');
    expect(out).toContain('This should check the empty queue before reading the first task.');
    expect(out).toContain('/repo/apps/web/src/Chat.tsx:42-44');
    expect(out).toContain('P2');
    expect(out).toContain('After');
    expect(out).not.toContain('::code-comment');
  });

  it('leaves malformed code-comment directives as text', () => {
    const out = html('::code-comment{title="No file" body="Missing file"}');

    expect(out).toContain('::code-comment');
    expect(out).not.toContain('class="md-code-comment"');
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

  it('renders ![alt](url) as <img> for relative BYOK image URLs', () => {
    const out = html('Here is your cat: ![cute kitten](/api/byok-image/abc-123.png)');
    expect(out).toContain('<img');
    expect(out).toContain('class="md-image"');
    expect(out).toContain('src="/api/byok-image/abc-123.png"');
    expect(out).toContain('alt="cute kitten"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('referrerPolicy="no-referrer"');
    // Image syntax must NOT be turned into an <a> link — `[alt](url)`
    // with a leading `!` is image, not link.
    expect(out).not.toContain('<a class="md-link"');
  });

  it('renders ![](url) with empty alt text', () => {
    const out = html('![](/api/byok-image/abc.png)');
    expect(out).toContain('<img');
    expect(out).toContain('alt=""');
  });

  it('renders https image URLs', () => {
    const out = html('![logo](https://example.com/logo.png)');
    expect(out).toContain('<img');
    expect(out).toContain('src="https://example.com/logo.png"');
  });

  it('renders data: image URIs', () => {
    const out = html('![inline](data:image/png;base64,iVBORw0KGgo=)');
    expect(out).toContain('<img');
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('drops image tags with unsafe schemes and keeps alt text as plain text', () => {
    const out = html('![hacked](javascript:alert(1))');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('hacked');
  });

  it('rejects protocol-relative image URLs (could load cross-origin)', () => {
    // `//evil.com/track.png` would inherit the page protocol; not in our
    // allowlist. Should fall through to alt-as-text.
    const out = html('![track](//evil.com/track.png)');
    expect(out).not.toContain('<img');
    expect(out).toContain('track');
  });

  it('keeps regular [text](url) links working alongside image syntax', () => {
    const out = html('Click [here](https://example.com) and look ![image](/api/byok-image/a.png)');
    expect(out).toContain('<a class="md-link"');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('>here</a>');
    expect(out).toContain('<img');
    expect(out).toContain('src="/api/byok-image/a.png"');
  });

  it('preserves bold + italic + code after the image regex addition', () => {
    const out = html('**b** and *i* and `c` and ![a](/p.png)');
    expect(out).toContain('<strong>b</strong>');
    expect(out).toContain('<em>i</em>');
    expect(out).toContain('<code class="md-inline-code">c</code>');
    expect(out).toContain('<img');
  });
});
