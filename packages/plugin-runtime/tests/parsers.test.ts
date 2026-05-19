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
});
