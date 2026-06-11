import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../src/frontmatter.js';

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

  // Per YAML 1.2, a leading-zero decimal like `01234` is a *string*, not a
  // number — the leading zero is significant (zip codes, zero-padded ids,
  // phone-like values). Coercing it to 1234 silently corrupts the value.
  it('keeps leading-zero integers as strings', () => {
    expect(data('zip: 01234').zip).toBe('01234');
    expect(data('id: 007').id).toBe('007');
  });

  it('keeps a negative leading-zero integer as a string', () => {
    expect(data('a: -01').a).toBe('-01');
  });

  it('still treats a bare zero as the number 0', () => {
    expect(data('a: 0').a).toBe(0);
  });

  it('keeps leading-zero decimals as strings', () => {
    // "00.5" has a redundant leading zero in the integer part -> string.
    expect(data('a: 00.5').a).toBe('00.5');
  });

  it('still coerces a single zero before the decimal point', () => {
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
