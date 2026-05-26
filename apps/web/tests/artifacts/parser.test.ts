import { describe, expect, it } from 'vitest';

import { type ArtifactEvent, createArtifactParser } from '../../src/artifacts/parser';

function collect(input: string): ArtifactEvent[] {
  const parser = createArtifactParser();
  const events: ArtifactEvent[] = [];
  for (const e of parser.feed(input)) events.push(e);
  for (const e of parser.flush()) events.push(e);
  return events;
}

describe('createArtifactParser', () => {
  it('parses a real artifact tag in prose', () => {
    const events = collect(
      'Here is a page:\n<artifact identifier="hello" type="text/html" title="Hi">\n<h1>Hi</h1>\n</artifact>\nDone.',
    );
    const start = events.find((e) => e.type === 'artifact:start');
    const end = events.find((e) => e.type === 'artifact:end');
    expect(start).toMatchObject({ identifier: 'hello', artifactType: 'text/html', title: 'Hi' });
    expect(end).toMatchObject({ identifier: 'hello' });
    const trailing = events
      .filter((e): e is Extract<ArtifactEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.delta)
      .join('');
    expect(trailing).toContain('Done.');
  });

  it('does not enter artifact mode for a tag inside inline backticks', () => {
    const events = collect(
      'To emit an artifact, wrap output in `<artifact identifier="x" type="text/html" title="X">` and continue writing normal prose afterwards.',
    );
    expect(events.find((e) => e.type === 'artifact:start')).toBeUndefined();
    const text = events
      .filter((e): e is Extract<ArtifactEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.delta)
      .join('');
    expect(text).toContain('continue writing normal prose afterwards.');
  });

  it('does not enter artifact mode for a tag inside a fenced code block', () => {
    const events = collect(
      [
        'Example:',
        '```html',
        '<artifact identifier="demo" type="text/html" title="Demo">',
        '<h1>Demo</h1>',
        '</artifact>',
        '```',
        'After the fence, more prose.',
      ].join('\n'),
    );
    expect(events.find((e) => e.type === 'artifact:start')).toBeUndefined();
    const text = events
      .filter((e): e is Extract<ArtifactEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.delta)
      .join('');
    expect(text).toContain('After the fence, more prose.');
  });

  it('still parses a real artifact tag when prose contains an inline triple-backtick that is not a fence', () => {
    // The chat markdown renderer (apps/web/src/runtime/markdown.tsx) only treats
    // ``` as a fence when it appears alone on a line. A mid-line ```html that
    // is not a fence per the renderer must not suppress a real artifact that
    // follows. (Reported by Codex review on PR #1132.)
    const events = collect(
      'The opening marker is ```html and the response then writes:\n<artifact identifier="real" type="text/html" title="Real">\n<h1>real</h1>\n</artifact>',
    );
    expect(events.find((e) => e.type === 'artifact:start')).toMatchObject({
      identifier: 'real',
      artifactType: 'text/html',
      title: 'Real',
    });
  });

  it('does not enter artifact mode for a tag wrapped in double backticks', () => {
    // lefarcen P2: double-backtick code spans (``…``) are valid Markdown.
    const events = collect(
      'You can quote it as ``<artifact identifier="x" type="text/html" title="X">`` in prose.',
    );
    expect(events.find((e) => e.type === 'artifact:start')).toBeUndefined();
  });

  it('does not enter artifact mode on a triple-backtick string literal inside a fenced block', () => {
    // lefarcen P2: fenced JS example whose body contains a string with literal ``` should
    // not pop fence state early and expose a later <artifact> as real.
    const events = collect(
      [
        '```js',
        'const fence = "```";',
        'const tag = "<artifact identifier=\\"x\\" type=\\"text/html\\" title=\\"X\\">";',
        '```',
        'After.',
      ].join('\n'),
    );
    expect(events.find((e) => e.type === 'artifact:start')).toBeUndefined();
  });

  it('holds back when a chunk ends mid-line on a renderer-valid fence opener prefix', () => {
    // lefarcen polish P2: the streaming tail-line guard must mirror the
    // renderer's FENCE_OPEN_RE shape, not a stricter \w-only subset.
    // Opener tails like "```c++" (info string with `+`/`-`) or "``` "
    // (trailing whitespace) are valid renderer openers waiting for a `\n`.
    // If the parser flushes them as text and then sees a literal `<artifact>`
    // on the next chunk, that artifact would incorrectly enter artifact mode.
    const cases: Array<{ name: string; chunks: [string, string] }> = [
      {
        name: 'plus suffix',
        chunks: ['Header.\n```c++', '\n<artifact identifier="x" type="text/plain" title="X">demo</artifact>\n```\n'],
      },
      {
        name: 'dash suffix',
        chunks: ['Header.\n```ts-', '\n<artifact identifier="x" type="text/plain" title="X">demo</artifact>\n```\n'],
      },
      {
        name: 'trailing space',
        chunks: ['Header.\n``` ', '\n<artifact identifier="x" type="text/plain" title="X">demo</artifact>\n```\n'],
      },
    ];
    for (const { name, chunks } of cases) {
      const parser = createArtifactParser();
      const events: ArtifactEvent[] = [];
      for (const c of chunks) for (const e of parser.feed(c)) events.push(e);
      for (const e of parser.flush()) events.push(e);
      expect(events.find((e) => e.type === 'artifact:start'), name).toBeUndefined();
    }
  });

  it('parses a real artifact between paragraphs that each carry a stray backtick', () => {
    // Inline code is paragraph-local in the renderer; an unbalanced backtick
    // in one paragraph must not bridge across a blank line to pair with a
    // backtick in a later paragraph and swallow a real <artifact …> in
    // between (mrcfps's 2026-05-11 repro).
    const events = collect(
      [
        'intro `',
        '',
        '<artifact identifier="x" type="text/plain" title="X">demo</artifact>',
        '',
        'closing `',
      ].join('\n'),
    );
    expect(events.find((e) => e.type === 'artifact:start')).toBeDefined();
    expect(events.find((e) => e.type === 'artifact:end')).toBeDefined();
  });

  it('does not enter artifact mode when bridged by stray backticks across HR-shaped lines', () => {
    // Renderer's paragraph loop does not break on HR (runtime/markdown.tsx:95-104),
    // so `intro \`\n---\n<artifact …>…</artifact>\n---\nclosing \`` is one paragraph
    // and the backticks pair to cover the literal recitation. mrcfps's
    // 2026-05-11 05:46 follow-up — the skip-range walker must not split on HR.
    const events = collect(
      [
        'intro `',
        '---',
        '<artifact identifier="x" type="text/plain" title="X">demo</artifact>',
        '---',
        'closing `',
      ].join('\n'),
    );
    expect(events.find((e) => e.type === 'artifact:start')).toBeUndefined();
  });

  it('does not enter artifact mode for <artifactual> or other prefix-shared identifiers', () => {
    // `<artifact` must be followed by whitespace to count as a real open;
    // strings like `<artifactual>` are not protocol tags and must survive as
    // literal text on both the parser and the stripper sides.
    const events = collect('prefix <artifactual>demo</artifact> suffix');
    expect(events.find((e) => e.type === 'artifact:start')).toBeUndefined();
    const text = events
      .filter((e): e is Extract<ArtifactEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.delta)
      .join('');
    expect(text).toBe('prefix <artifactual>demo</artifact> suffix');
  });

  it('does not enter artifact mode when a fenced tag arrives across multiple chunks', () => {
    const parser = createArtifactParser();
    const chunks = [
      'Example:\n```html\n<artifact identifier="demo"',
      ' type="text/html" title="Demo">\n<h1>Demo</h1>\n</artif',
      'act>\n```\nAfter the fence, more prose.',
    ];
    const events: ArtifactEvent[] = [];
    for (const c of chunks) for (const e of parser.feed(c)) events.push(e);
    for (const e of parser.flush()) events.push(e);
    expect(events.find((e) => e.type === 'artifact:start')).toBeUndefined();
    const text = events
      .filter((e): e is Extract<ArtifactEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.delta)
      .join('');
    expect(text).toContain('After the fence, more prose.');
  });
});
