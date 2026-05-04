// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { extractRelativeRefs } from '../src/mcp.js';

describe('extractRelativeRefs', () => {
  it('flat project: index.html referencing tokens.css resolves to tokens.css', () => {
    const refs = extractRelativeRefs('<link href="tokens.css">', 'index.html', 'text/html');
    expect(refs).toContain('tokens.css');
  });

  it('nested: pages/landing.html referencing ../tokens.css resolves to tokens.css', () => {
    const refs = extractRelativeRefs('<link href="../tokens.css">', 'pages/landing.html', 'text/html');
    expect(refs).toContain('tokens.css');
  });

  it('deeply nested: a/b/c/file.css referencing ../../shared.css resolves to a/shared.css', () => {
    const refs = extractRelativeRefs('@import "../../shared.css";', 'a/b/c/file.css', 'text/css');
    expect(refs).toContain('a/shared.css');
  });

  it('escape attempt from root: index.html referencing ../../etc/passwd is rejected', () => {
    const refs = extractRelativeRefs('<link href="../../etc/passwd">', 'index.html', 'text/html');
    expect(refs).toHaveLength(0);
  });

  it('escape attempt at depth 1: pages/landing.html referencing ../../escape.txt is rejected', () => {
    const refs = extractRelativeRefs('<link href="../../escape.txt">', 'pages/landing.html', 'text/html');
    expect(refs).toHaveLength(0);
  });

  it('external https URL is ignored', () => {
    const refs = extractRelativeRefs('<script src="https://cdn.example.com/app.js"></script>', 'index.html', 'text/html');
    expect(refs).toHaveLength(0);
  });

  it('data URL is ignored', () => {
    const refs = extractRelativeRefs('<img src="data:image/png;base64,abc">', 'index.html', 'text/html');
    expect(refs).toHaveLength(0);
  });

  it('anchor ref is ignored', () => {
    const refs = extractRelativeRefs('<a href="#section">', 'index.html', 'text/html');
    expect(refs).toHaveLength(0);
  });

  it('mailto and tel refs are ignored', () => {
    const refs = extractRelativeRefs('<a href="mailto:x@y.com"><a href="tel:+1">', 'index.html', 'text/html');
    expect(refs).toHaveLength(0);
  });

  it('srcset with parent-relative entries resolves correctly', () => {
    const html = '<img srcset="../img/small.png 1x, ../img/large.png 2x">';
    const refs = extractRelativeRefs(html, 'pages/index.html', 'text/html');
    expect(refs).toContain('img/small.png');
    expect(refs).toContain('img/large.png');
  });
});
