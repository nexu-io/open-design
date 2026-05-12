import { describe, expect, it } from 'vitest';

import { stripArtifact } from '../../src/artifacts/strip';

describe('stripArtifact', () => {
  it('removes a real artifact tag and its body from prose', () => {
    const out = stripArtifact(
      'Header.\n<artifact identifier="x" type="text/html" title="X">\n<h1>x</h1>\n</artifact>\nFooter.',
    );
    expect(out).toBe('Header.\n\nFooter.');
  });

  it('preserves an artifact tag wrapped in inline backticks', () => {
    const input = 'Wrap output as `<artifact identifier="x">demo</artifact>` to ship it.';
    expect(stripArtifact(input)).toBe(input);
  });

  it('preserves an artifact tag inside a fenced code block', () => {
    const input = [
      'Example:',
      '```html',
      '<artifact identifier="demo" type="text/html" title="Demo">',
      '<h1>Demo</h1>',
      '</artifact>',
      '```',
      'After.',
    ].join('\n');
    expect(stripArtifact(input)).toBe(input);
  });

  it('preserves a tag wrapped in double backticks', () => {
    const input = 'Use ``<artifact identifier="x" type="text/html" title="X">`` here.';
    expect(stripArtifact(input)).toBe(input);
  });

  it('returns content unchanged when no artifact open tag is present', () => {
    const input = 'Just prose, no markup.';
    expect(stripArtifact(input)).toBe(input);
  });

  it('does not truncate when an open tag has no matching close', () => {
    // A bare orphan open without a close should not nuke the rest of the
    // message (the previous implementation sliced to end-of-string).
    const input = 'Trailing prose<artifact identifier="x"> with no closer.';
    expect(stripArtifact(input)).toBe(input);
  });

  it('preserves a tag inside a fenced literal whose closing fence has no trailing newline', () => {
    // Renderer treats an unclosed-at-EOF fence as a code block extending to
    // end of input. The stripper must do the same, otherwise a literal
    // recitation tucked into a code example at the bottom of a chat reply
    // gets eaten.
    const input = '```js\nconst s = `<artifact identifier="x">demo</artifact>`;\n```';
    expect(stripArtifact(input)).toBe(input);
  });

  it('strips a real artifact that follows an indented pseudo-fence (renderer sees no fence)', () => {
    // The renderer's open-fence regex disallows leading spaces; an indented
    // "   ```html" line is rendered as a paragraph, not a fence. The
    // <artifact …> on the next line is therefore a real protocol tag and
    // must be stripped — not preserved as fictional fenced content.
    const input = [
      '   ```html',
      '<artifact identifier="x" type="text/html" title="X">',
      '<h1>x</h1>',
      '</artifact>',
      'Tail.',
    ].join('\n');
    const out = stripArtifact(input);
    expect(out).not.toContain('<artifact');
    expect(out).toContain('Tail.');
  });

  it('strips a real artifact between paragraphs that each carry a stray backtick', () => {
    // Inline code spans are paragraph-local in the renderer; an unbalanced
    // backtick in one paragraph must not bridge across a blank line to pair
    // with a backtick in another paragraph and accidentally classify a real
    // <artifact …> between them as inline code (mrcfps's 2026-05-11 repro).
    const input = [
      'intro `',
      '',
      '<artifact identifier="x" type="text/plain" title="X">demo</artifact>',
      '',
      'closing `',
    ].join('\n');
    const out = stripArtifact(input);
    expect(out).not.toContain('<artifact');
    expect(out).toContain('intro `');
    expect(out).toContain('closing `');
  });

  it('preserves a tag bridged by stray backticks across HR-shaped lines (renderer keeps HR as paragraph content)', () => {
    // runtime/markdown.tsx:95-104's paragraph-accumulation loop only breaks on
    // blank / fence / heading / ul / ol — it does NOT break on HR. So a buffer
    // shaped `intro \`` / `---` / `<artifact …>…</artifact>` / `---` / `closing \``
    // is one paragraph in the renderer, and the two stray backticks pair to
    // cover the literal artifact recitation. The skip-range walker must mirror
    // that (mrcfps's 2026-05-11 05:46 follow-up).
    const input = [
      'intro `',
      '---',
      '<artifact identifier="x" type="text/plain" title="X">demo</artifact>',
      '---',
      'closing `',
    ].join('\n');
    expect(stripArtifact(input)).toBe(input);
  });

  it('does not strip <artifactual> or other prefix-shared identifiers', () => {
    // The streaming parser only treats `<artifact` as a real open when the
    // next char is whitespace; the stripper must apply the same rule, else
    // literal prose mentioning `<artifactual>` gets silently truncated.
    const input = 'prefix <artifactual>demo</artifact> suffix';
    expect(stripArtifact(input)).toBe(input);
  });

  it('preserves a tag inside a fenced block that contains a `\`\`\`html` line in its body', () => {
    // The renderer closes a fence only on a bare "```\\s*$" — a "```html"
    // line inside an open fence is kept as code content. The stripper must
    // match that semantics or it will exit the fence early and eat a
    // literal <artifact …> recitation that follows.
    const input = [
      '```js',
      'const a = `<p>x</p>`;',
      '```html',
      '<artifact identifier="x" type="text/html" title="X">demo</artifact>',
      '```',
    ].join('\n');
    expect(stripArtifact(input)).toBe(input);
  });
});
