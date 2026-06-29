import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../src/design-systems/frontmatter.js';

function data(src: string) {
  return parseFrontmatter(`---\n${src}\n---\n`).data;
}

describe('parseFrontmatter scalar coercion', () => {
  it('coerces plain integers and floats to numbers', () => {
    expect(data('a: 42').a).toBe(42);
    expect(data('a: -7').a).toBe(-7);
    expect(data('a: 3.14').a).toBe(3.14);
  });

  it('coerces booleans and null', () => {
    expect(data('a: true').a).toBe(true);
    expect(data('a: false').a).toBe(false);
    expect(data('a: null').a).toBe(null);
    expect(data('a: ~').a).toBe(null);
  });

  // The YAML 1.2 core schema resolves base-10 numeric scalars as numbers,
  // including leading-zero decimals (`[-+]?[0-9]+` for ints). We match the
  // schema so existing frontmatter consumers keep getting numbers.
  it('coerces leading-zero integers to numbers (YAML 1.2 core schema)', () => {
    expect(data('zip: 01234').zip).toBe(1234);
    expect(data('id: 007').id).toBe(7);
  });

  it('coerces a negative leading-zero integer to a number', () => {
    expect(data('a: -01').a).toBe(-1);
  });

  it('treats a bare zero as the number 0', () => {
    expect(data('a: 0').a).toBe(0);
  });

  it('coerces leading-zero decimals to numbers', () => {
    expect(data('a: 00.5').a).toBe(0.5);
  });

  it('coerces a single zero before the decimal point', () => {
    expect(data('a: 0.5').a).toBe(0.5);
    expect(data('a: .5').a).toBe(0.5);
  });

  it('strips matching surrounding quotes', () => {
    expect(data('a: "hello"').a).toBe('hello');
    expect(data("a: 'world'").a).toBe('world');
  });

  // A value that is a single quote character is not a quoted string; slicing
  // 1..-1 of a one-char string wrongly yields ''.
  it('does not treat a lone quote character as an empty quoted string', () => {
    expect(data('a: "').a).toBe('"');
    expect(data("a: '").a).toBe("'");
  });
});
