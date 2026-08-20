// @vitest-environment jsdom
//
// splitTabLabel is what lets a wrapped workspace tab keep its file extension
// visible when the stem truncates ("index….html" instead of "index….ht").
// The extension is the affordance that tells the user which file the tab
// points at, so the split logic needs to hold across the shapes we see in
// practice: real file extensions, extension-less project names, leading-dot
// names, multi-dot names, and copy that only *looks* like it has an
// extension (version strings, sentences, i18n).

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { splitTabLabel, TabLabel } from '../../src/components/workspaceTabLabel';

afterEach(() => {
  cleanup();
});

describe('splitTabLabel', () => {
  it('splits a plain file name on the extension dot', () => {
    expect(splitTabLabel('index.html')).toEqual({ stem: 'index', ext: '.html' });
    expect(splitTabLabel('kit.html')).toEqual({ stem: 'kit', ext: '.html' });
    expect(splitTabLabel('foo.tsx')).toEqual({ stem: 'foo', ext: '.tsx' });
    expect(splitTabLabel('a.md')).toEqual({ stem: 'a', ext: '.md' });
  });

  it('splits on the LAST dot when there are several', () => {
    expect(splitTabLabel('config.settings.json')).toEqual({
      stem: 'config.settings',
      ext: '.json',
    });
    expect(splitTabLabel('scene.v2.usda')).toEqual({
      stem: 'scene.v2',
      ext: '.usda',
    });
  });

  it('leaves extension-less titles whole', () => {
    expect(splitTabLabel('Design Files')).toEqual({ stem: 'Design Files', ext: null });
    expect(splitTabLabel('kit')).toEqual({ stem: 'kit', ext: null });
    expect(splitTabLabel('')).toEqual({ stem: '', ext: null });
  });

  it('keeps leading-dot names whole (no visible stem to truncate against)', () => {
    expect(splitTabLabel('.gitignore')).toEqual({ stem: '.gitignore', ext: null });
    expect(splitTabLabel('.env')).toEqual({ stem: '.env', ext: null });
    expect(splitTabLabel('.eslintrc')).toEqual({ stem: '.eslintrc', ext: null });
  });

  it('does not misread version strings and sentences as extensions', () => {
    // Trailing token contains punctuation → not an extension.
    expect(splitTabLabel('v1.2 release notes')).toEqual({
      stem: 'v1.2 release notes',
      ext: null,
    });
    // Bare version suffix: the 1-char trailing token fails the 2-char floor.
    expect(splitTabLabel('v1.2')).toEqual({
      stem: 'v1.2',
      ext: null,
    });
    // Version-shape tokens `.v2` / `.b3` are the two common single-prefix
    // shapes rejected so a project named "app.v2" or "flow.b3" keeps the
    // version tag in the stem. Multi-letter version prefixes (`.beta3`,
    // `.alpha1`) intentionally still match the extension shape - they
    // share the shape of real extensions like `.mp3` and `.mp4`, and
    // disambiguating cleanly needs a known-extension lookup this file
    // deliberately does not carry.
    expect(splitTabLabel('app.v2')).toEqual({
      stem: 'app.v2',
      ext: null,
    });
    expect(splitTabLabel('flow.b3')).toEqual({
      stem: 'flow.b3',
      ext: null,
    });
    // Trailing token is longer than 5 chars → not an extension.
    expect(splitTabLabel('report.summary')).toEqual({
      stem: 'report.summary',
      ext: null,
    });
    // Single-character tails are not extensions in this app's vocabulary.
    expect(splitTabLabel('song.a')).toEqual({
      stem: 'song.a',
      ext: null,
    });
    // Trailing dot with empty token.
    expect(splitTabLabel('trailing.')).toEqual({
      stem: 'trailing.',
      ext: null,
    });
  });

  it('accepts short numeric and mixed extensions', () => {
    expect(splitTabLabel('song.mp3')).toEqual({ stem: 'song', ext: '.mp3' });
    expect(splitTabLabel('model.3dm')).toEqual({ stem: 'model', ext: '.3dm' });
    expect(splitTabLabel('archive.7z')).toEqual({ stem: 'archive', ext: '.7z' });
  });

  it('accepts codec extensions that share shape with version tags', () => {
    // `.h264` and `.x265` are `<letter><digits>` shape but are real file
    // kinds, so the version-token exclusion is narrow to `v`/`b` prefixes.
    expect(splitTabLabel('video.h264')).toEqual({ stem: 'video', ext: '.h264' });
    expect(splitTabLabel('clip.x265')).toEqual({ stem: 'clip', ext: '.x265' });
  });

  it('splits CJK stems on the trailing ASCII extension', () => {
    // The extension regex is ASCII-only by design; a CJK stem is fine as
    // long as the trailing token is a real short extension.
    expect(splitTabLabel('设计文件.tsx')).toEqual({ stem: '设计文件', ext: '.tsx' });
    expect(splitTabLabel('ホーム.html')).toEqual({ stem: 'ホーム', ext: '.html' });
    // Both stem and tail non-ASCII → the whole title stays in the stem.
    expect(splitTabLabel('文档.文档')).toEqual({ stem: '文档.文档', ext: null });
  });

  it('keeps extensions longer than 5 chars in the stem (documented ceiling)', () => {
    // EXTENSION_TOKEN caps at 5 chars, so `.svelte`, `.markdown`, `.gradle`,
    // `.astro`, `.eslintrc` fall through to no-split. This is a deliberate
    // narrow scope: raising the ceiling would need a known-extension
    // lookup to avoid misreading long sentence-tails as file kinds. Behavior
    // here is a graceful degradation to end-ellipsis, not a regression;
    // the pre-fix behavior was the same. Pinned so a future ceiling change
    // is a conscious decision rather than an accidental one.
    expect(splitTabLabel('component.svelte')).toEqual({
      stem: 'component.svelte',
      ext: null,
    });
    expect(splitTabLabel('README.markdown')).toEqual({
      stem: 'README.markdown',
      ext: null,
    });
    expect(splitTabLabel('build.gradle')).toEqual({
      stem: 'build.gradle',
      ext: null,
    });
  });

  it('rejects extensions with non-alphanumeric characters', () => {
    expect(splitTabLabel('report.doc-1')).toEqual({
      stem: 'report.doc-1',
      ext: null,
    });
    expect(splitTabLabel('note. txt')).toEqual({
      stem: 'note. txt',
      ext: null,
    });
  });
});

describe('TabLabel', () => {
  it('renders stem + extension as separate spans when the title has an extension', () => {
    const { container } = render(<TabLabel title="index.html" />);
    const root = container.querySelector('.ws-tab-label');
    expect(root).not.toBeNull();
    const stem = root!.querySelector('.ws-tab-label-stem');
    const ext = root!.querySelector('.ws-tab-label-ext');
    expect(stem?.textContent).toBe('index');
    expect(ext?.textContent).toBe('.html');
  });

  it('renders only the stem span for extension-less titles', () => {
    const { container } = render(<TabLabel title="Design Files" />);
    const root = container.querySelector('.ws-tab-label');
    expect(root?.querySelector('.ws-tab-label-stem')?.textContent).toBe('Design Files');
    expect(root?.querySelector('.ws-tab-label-ext')).toBeNull();
  });

  it('keeps the extension split when a dirty mark is present', () => {
    // Sketch tabs pass ` •` when dirty. The dirty mark rides its own prop
    // so the extension detection still runs on the bare filename; the
    // rendered order is stem → ext → dirty so a narrow tab still reads
    // like `foo….sketch.json •` rather than losing the file kind.
    const { container } = render(
      <TabLabel title="foo.sketch.json" dirtyMark=" •" />,
    );
    const root = container.querySelector('.ws-tab-label');
    expect(root?.querySelector('.ws-tab-label-stem')?.textContent).toBe('foo.sketch');
    expect(root?.querySelector('.ws-tab-label-ext')?.textContent).toBe('.json');
    expect(root?.querySelector('.ws-tab-label-dirty')?.textContent).toBe(' •');
    expect(root?.textContent).toBe('foo.sketch.json •');
  });

  it('renders the dirty span in dom order after the extension', () => {
    const { container } = render(
      <TabLabel title="index.html" dirtyMark=" •" />,
    );
    const root = container.querySelector('.ws-tab-label');
    const spans = Array.from(root?.querySelectorAll('span') ?? []).map(
      (span) => span.className,
    );
    expect(spans).toEqual([
      'ws-tab-label-stem',
      'ws-tab-label-ext',
      'ws-tab-label-dirty',
    ]);
  });

  it('omits the dirty span when the mark is empty', () => {
    const { container } = render(<TabLabel title="index.html" dirtyMark="" />);
    const root = container.querySelector('.ws-tab-label');
    expect(root?.querySelector('.ws-tab-label-dirty')).toBeNull();
  });
});

// Seeded fuzz corpus. Deterministic so a failure is reproducible off the
// printed input, and the run stays fast (single-digit ms for the pure
// function, low hundreds of ms for the DOM properties in jsdom).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Explicit corners the random pass would take many iterations to stumble
// into. Every one of these has caused parser bugs in similar helpers.
const SEED_CORPUS = [
  '',
  '.', '..', '...',
  'a', 'a.', '.a', '.ab', '.abc', 'a.b', 'a.bc', 'a.bcd',
  ' ', ' .', '. ', 'a b.c', 'a.b c',
  '\n', '\t', '\0',
  'a'.repeat(500),
  `${'a'.repeat(500)}.html`,
  '设计.tsx', '.env', '.gitignore', '.eslintrc',
  'app.v2', 'flow.b3', 'video.h264', 'clip.x265',
  'component.svelte', 'README.markdown',
  'note. txt', 'trailing.', '.only', 'ends.with..',
];

function randomCorpus(seed: number, count: number): string[] {
  const rng = mulberry32(seed);
  const ascii = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const punct = '.-_ !@#$%^&*()[]{}<>?/\\|;:\'"~+=';
  const cjk = '設計文件ホームπΩ你好世界';
  const pool = ascii + punct + cjk;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const len = Math.floor(rng() * 40);
    let s = '';
    for (let j = 0; j < len; j += 1) {
      // 12% chance of a dot to synthesise extension-shaped candidates
      // without dropping the tail into non-dotty territory too often.
      s += rng() < 0.12 ? '.' : pool[Math.floor(rng() * pool.length)];
    }
    out.push(s);
  }
  return out;
}

const FUZZ_CORPUS = [...SEED_CORPUS, ...randomCorpus(0xdeadbeef, 400)];

describe('splitTabLabel invariants (fuzz)', () => {
  it('round-trips: stem + ext always reconstructs the input title', () => {
    // If this ever fails, a tab label silently loses text between the
    // shipped filename and the rendered spans. That is the loudest bug
    // this function can develop, so it gets the loudest guarantee.
    for (const title of FUZZ_CORPUS) {
      const { stem, ext } = splitTabLabel(title);
      const rebuilt = stem + (ext ?? '');
      if (rebuilt !== title) {
        throw new Error(
          `round-trip failed on ${JSON.stringify(title)}: got ${JSON.stringify(rebuilt)}`,
        );
      }
    }
  });

  it('ext, when present, is a real extension and never a version tag', () => {
    // Locks the docblock's contract: the extension slot only ever
    // carries the 2-5 alnum ASCII shape and never the v/b + digits
    // shape that the exclusion regex was added to reject.
    for (const title of FUZZ_CORPUS) {
      const { ext } = splitTabLabel(title);
      if (ext === null) continue;
      if (!/^\.[A-Za-z0-9]{2,5}$/.test(ext)) {
        throw new Error(
          `ext violates 2-5 alnum shape on ${JSON.stringify(title)}: ${JSON.stringify(ext)}`,
        );
      }
      if (/^\.[vVbB]\d+$/.test(ext)) {
        throw new Error(
          `ext is a version tag but was split off on ${JSON.stringify(title)}: ${JSON.stringify(ext)}`,
        );
      }
    }
  });

  it('idempotent: splitting the rebuilt title yields the same split', () => {
    // A pure text-parser should be stable under re-application. If this
    // fails we have accidentally introduced a rule that mangles its own
    // output.
    for (const title of FUZZ_CORPUS) {
      const first = splitTabLabel(title);
      const second = splitTabLabel(first.stem + (first.ext ?? ''));
      if (first.stem !== second.stem || first.ext !== second.ext) {
        throw new Error(
          `idempotence violated on ${JSON.stringify(title)}: first=${JSON.stringify(first)} second=${JSON.stringify(second)}`,
        );
      }
    }
  });

  it('never throws on any string input', () => {
    for (const title of FUZZ_CORPUS) {
      expect(() => splitTabLabel(title)).not.toThrow();
    }
  });

  it('ext-present implies a non-empty stem (leading-dot names stay whole)', () => {
    // The stem is what the ellipsis truncates against; if we ever return
    // an empty stem alongside a real extension, a narrow tab renders as
    // just the extension and the file is unidentifiable.
    for (const title of FUZZ_CORPUS) {
      const { stem, ext } = splitTabLabel(title);
      if (ext !== null && stem.length === 0) {
        throw new Error(
          `empty stem with non-null ext on ${JSON.stringify(title)}: ext=${JSON.stringify(ext)}`,
        );
      }
    }
  });
});

describe('TabLabel invariants (fuzz)', () => {
  // Smaller corpus: each iteration renders + queries the DOM under jsdom.
  const DOM_CORPUS = [
    ...SEED_CORPUS,
    ...randomCorpus(0xfeedface, 80),
  ];
  const DIRTY_MARKS = ['', ' •', ' *', '·'];

  it('textContent equals title + dirtyMark for every (title, mark) pair', () => {
    // The DOM-level guarantee that the split spans do not visually lose
    // text. This is the user-facing invariant; splitTabLabel's
    // round-trip is the pure-function version of the same claim.
    for (const title of DOM_CORPUS) {
      for (const dirtyMark of DIRTY_MARKS) {
        const { container } = render(
          <TabLabel title={title} dirtyMark={dirtyMark || undefined} />,
        );
        const root = container.querySelector('.ws-tab-label');
        const got = root?.textContent ?? '';
        const want = title + dirtyMark;
        cleanup();
        if (got !== want) {
          throw new Error(
            `textContent mismatch: title=${JSON.stringify(title)} dirty=${JSON.stringify(dirtyMark)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`,
          );
        }
      }
    }
  });

  it('span order is always stem → ext? → dirty? (never anything else)', () => {
    // Locks the visual layout contract: the extension pins to the right
    // of the stem, the dirty marker pins to the right of the extension,
    // and no other slot exists.
    const validSlots = ['ws-tab-label-stem', 'ws-tab-label-ext', 'ws-tab-label-dirty'];
    for (const title of DOM_CORPUS) {
      for (const dirtyMark of DIRTY_MARKS) {
        const { container } = render(
          <TabLabel title={title} dirtyMark={dirtyMark || undefined} />,
        );
        const root = container.querySelector('.ws-tab-label');
        const order = Array.from(root?.querySelectorAll('span') ?? []).map(
          (span) => span.className,
        );
        cleanup();
        let lastIndex = -1;
        for (const cls of order) {
          const idx = validSlots.indexOf(cls);
          if (idx <= lastIndex) {
            throw new Error(
              `span order violated: title=${JSON.stringify(title)} dirty=${JSON.stringify(dirtyMark)} order=${JSON.stringify(order)}`,
            );
          }
          lastIndex = idx;
        }
      }
    }
  });
});
