import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/parsers/frontmatter';

describe('parseFrontmatter inline arrays', () => {
  it('parses an inline array of scalars', () => {
    const { data } = parseFrontmatter('---\ntags: [a, b, c]\n---\n');
    expect(data['tags']).toEqual(['a', 'b', 'c']);
  });

  it('coerces typed values inside inline arrays', () => {
    const { data } = parseFrontmatter('---\nmixed: [1, true, "kept"]\n---\n');
    expect(data['mixed']).toEqual([1, true, 'kept']);
  });

  it('parses an empty inline array', () => {
    const { data } = parseFrontmatter('---\nempty: []\n---\n');
    expect(data['empty']).toEqual([]);
  });
});

describe('parseFrontmatter dash-prefixed arrays', () => {
  it('parses a dash-array of scalars under a key', () => {
    const src = '---\ntags:\n  - first\n  - second\n---\n';
    const { data } = parseFrontmatter(src);
    expect(data['tags']).toEqual(['first', 'second']);
  });

  it('parses a dash-array of single-line objects', () => {
    const src = '---\ninputs:\n  - name: tone\n  - name: audience\n---\n';
    const { data } = parseFrontmatter(src);
    expect(data['inputs']).toEqual([{ name: 'tone' }, { name: 'audience' }]);
  });
});

describe('parseFrontmatter delimiter handling', () => {
  it('strips a UTF-8 BOM before the opening delimiter', () => {
    const src = '﻿---\nname: foo\n---\nbody';
    const { data, body } = parseFrontmatter(src);
    expect(data['name']).toBe('foo');
    expect(body).toBe('body');
  });

  it('handles CRLF line endings between delimiters', () => {
    const src = '---\r\nname: foo\r\ndescription: hi\r\n---\r\nbody';
    const { data, body } = parseFrontmatter(src);
    expect(data['name']).toBe('foo');
    expect(data['description']).toBe('hi');
    expect(body).toBe('body');
  });
});

describe('parseFrontmatter coerce primitives', () => {
  it('coerces booleans, null, and numbers', () => {
    const src = '---\nyes: true\nno: false\nnone: null\ntilde: ~\nint: 42\nfloat: -1.5\n---\n';
    const { data } = parseFrontmatter(src);
    expect(data['yes']).toBe(true);
    expect(data['no']).toBe(false);
    expect(data['none']).toBeNull();
    expect(data['tilde']).toBeNull();
    expect(data['int']).toBe(42);
    expect(data['float']).toBe(-1.5);
  });

  it('preserves quoted strings without re-coercion', () => {
    const src = '---\nstr1: "true"\nstr2: \'42\'\n---\n';
    const { data } = parseFrontmatter(src);
    expect(data['str1']).toBe('true');
    expect(data['str2']).toBe('42');
  });
});

describe('parseFrontmatter nested objects', () => {
  it('parses a nested scalar block', () => {
    const src = '---\nod:\n  mode: prototype\n  platform: desktop\n---\n';
    const { data } = parseFrontmatter(src);
    expect(data['od']).toEqual({ mode: 'prototype', platform: 'desktop' });
  });
});
