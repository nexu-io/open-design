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
});
