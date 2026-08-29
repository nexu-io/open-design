import { describe, expect, it } from 'vitest';
import { parseManifest } from '../src/parsers/manifest';
import { parseMarketplace } from '../src/parsers/marketplace';
import { parseFrontmatter } from '../src/parsers/frontmatter';

describe('parseManifest', () => {
  it('accepts the minimal sidecar shape', () => {
    const result = parseManifest(JSON.stringify({
      name: 'sample-plugin',
      version: '1.0.0',
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.name).toBe('sample-plugin');
      expect(result.manifest.version).toBe('1.0.0');
    }
  });

  it('rejects an invalid name', () => {
    const result = parseManifest(JSON.stringify({
      name: 'Sample Plugin!',
      version: '1.0.0',
    }));
    expect(result.ok).toBe(false);
  });

  it('preserves unknown forward-compatible fields', () => {
    const result = parseManifest(JSON.stringify({
      name: 'sample-plugin',
      version: '1.0.0',
      futureField: { hello: 'world' },
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.manifest as Record<string, unknown>).futureField).toEqual({ hello: 'world' });
    }
  });

  it('accepts localized use-case queries', () => {
    const result = parseManifest(JSON.stringify({
      name: 'sample-plugin',
      version: '1.0.0',
      od: {
        useCase: {
          query: {
            en: 'Make a brief.',
            'zh-CN': '写一份简报。',
          },
        },
      },
    }));

    expect(result.ok).toBe(true);
  });
});

describe('parseMarketplace', () => {
  it('accepts a tiny catalog', () => {
    const result = parseMarketplace(JSON.stringify({
      specVersion: '1.0.0',
      name: 'open-design-official',
      version: '1.0.0',
      plugins: [{ name: 'make-a-deck', source: 'github:open-design/plugins/make-a-deck', version: '0.1.0' }],
    }));
    expect(result.ok).toBe(true);
  });

  it('rejects when catalog version is missing', () => {
    const result = parseMarketplace(JSON.stringify({
      name: 'no-version',
      plugins: [{ name: 'make-a-deck', source: 'github:open-design/plugins/make-a-deck', version: '0.1.0' }],
    }));
    expect(result.ok).toBe(false);
  });

  it('rejects when plugin entry version is missing', () => {
    const result = parseMarketplace(JSON.stringify({
      name: 'missing-plugin-version',
      version: '1.0.0',
      plugins: [{ name: 'make-a-deck', source: 'github:open-design/plugins/make-a-deck' }],
    }));
    expect(result.ok).toBe(false);
  });

  it('rejects when plugins is missing', () => {
    const result = parseMarketplace(JSON.stringify({ name: 'no-plugins', version: '1.0.0' }));
    expect(result.ok).toBe(false);
  });
});

describe('parseFrontmatter', () => {
  it('parses a single-line description', () => {
    const { data, body } = parseFrontmatter('---\nname: foo\ndescription: hello\n---\nbody');
    expect(data['name']).toBe('foo');
    expect(data['description']).toBe('hello');
    expect(body).toBe('body');
  });

  it('keeps frontmatter body output byte-identical across newline styles', () => {
    expect(parseFrontmatter('---\r\nname: foo\r\n---\r\nbody\r\n').body).toBe('body\r\n');
    expect(parseFrontmatter('---\nname: foo\n---\nbody\n').body).toBe('body\n');
  });

  it('does not strip partial frontmatter blocks', () => {
    const raw = '---\nname: foo\n# missing closing marker';
    expect(parseFrontmatter(raw)).toEqual({ data: {}, body: raw });
  });

  it('parses block-literal descriptions', () => {
    const src = '---\nname: foo\ndescription: |\n  line 1\n  line 2\n---\nbody';
    const { data } = parseFrontmatter(src);
    expect(data['description']).toBe('line 1\nline 2');
  });

  it('returns empty data when no frontmatter delimiter is present', () => {
    const { data, body } = parseFrontmatter('# heading');
    expect(Object.keys(data)).toHaveLength(0);
    expect(body).toBe('# heading');
  });

  it('rejects invalid closing delimiters like ---- or ---foo', () => {
    const raw1 = '---\nname: foo\n----\nbody';
    expect(parseFrontmatter(raw1)).toEqual({ data: {}, body: raw1 });

    const raw2 = '---\nname: foo\n---foo\nbody';
    expect(parseFrontmatter(raw2)).toEqual({ data: {}, body: raw2 });
  });

  it('coerces plain numbers, booleans, and null', () => {
    const { data } = parseFrontmatter('---\na: 42\nb: 3.14\nc: true\nd: null\n---\n');
    expect(data['a']).toBe(42);
    expect(data['b']).toBe(3.14);
    expect(data['c']).toBe(true);
    expect(data['d']).toBe(null);
  });

  // The YAML 1.2 core schema resolves base-10 numeric scalars as numbers,
  // including leading-zero forms. We match the schema so frontmatter
  // consumers keep getting numbers.
  it('coerces leading-zero integers to numbers (YAML 1.2 core schema)', () => {
    const { data } = parseFrontmatter('---\nzip: 01234\nid: 007\nzero: 0\n---\n');
    expect(data['zip']).toBe(1234);
    expect(data['id']).toBe(7);
    expect(data['zero']).toBe(0);
  });

  it('does not treat a lone quote character as an empty quoted string', () => {
    const { data } = parseFrontmatter('---\na: "\n---\n');
    expect(data['a']).toBe('"');
  });

  // A block sequence may sit at the same indentation as its mapping key (the
  // common flush-left `tags:` / `- item` YAML style). These items must attach
  // to the key rather than being dropped.
  it('parses a flush-left (zero-indent) block sequence', () => {
    const { data } = parseFrontmatter('---\ntags:\n- a\n- b\n---\n');
    expect(data['tags']).toEqual(['a', 'b']);
  });

  it('parses a nested flush-left sequence without dropping enclosing keys', () => {
    const { data } = parseFrontmatter('---\nod:\n  craft:\n    requires:\n    - alpha\n    - beta\n---\n');
    expect(data['od']).toEqual({ craft: { requires: ['alpha', 'beta'] } });
  });

  it('parses a flush-left sequence of single-line objects', () => {
    const { data } = parseFrontmatter('---\nitems:\n- k: 1\n  v: 2\n- k: 3\n---\n');
    expect(data['items']).toEqual([{ k: 1, v: 2 }, { k: 3 }]);
  });

  it('returns to the parent level for a key following a flush-left sequence', () => {
    const { data } = parseFrontmatter('---\ntags:\n- a\n- b\nname: foo\n---\n');
    expect(data).toEqual({ tags: ['a', 'b'], name: 'foo' });
  });

  it('still parses an indented block sequence', () => {
    const { data } = parseFrontmatter('---\ntags:\n  - a\n  - b\n---\n');
    expect(data['tags']).toEqual(['a', 'b']);
  });

  it('does not split inline-array elements on commas inside quotes', () => {
    const { data } = parseFrontmatter('---\na: ["a,b", "c"]\nb: [\'x, y\', z]\n---\n');
    expect(data['a']).toEqual(['a,b', 'c']);
    expect(data['b']).toEqual(['x, y', 'z']);
  });

  it('treats an apostrophe inside an unquoted inline-array element as literal', () => {
    const { data } = parseFrontmatter("---\ntags: [don't, stop]\n---\n");
    expect(data['tags']).toEqual(["don't", 'stop']);
  });

  it('still splits plain inline arrays on commas', () => {
    const { data } = parseFrontmatter('---\na: [x, y, z]\n---\n');
    expect(data['a']).toEqual(['x', 'y', 'z']);
  });

  // A block scalar's indentation is derived from its first content line, not a
  // fixed key+2, so content indented deeper is not left with leading spaces
  // while relative indentation deeper than that base is preserved.
  it('strips a block scalar to its own base indentation', () => {
    const { data } = parseFrontmatter('---\ntext: |\n    line one\n    line two\n---\n');
    expect(data['text']).toBe('line one\nline two');
  });

  it('preserves relative indentation inside a block scalar', () => {
    const { data } = parseFrontmatter('---\ntext: |\n  a\n    b\n---\n');
    expect(data['text']).toBe('a\n  b');
  });
});
